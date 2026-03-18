import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerUploadRoutes } from "../upload-local";
import { gerarKmz } from "../kmz";
import { appRouter } from "../routers";
import { createContext } from "./context";

// Compatibilidade ESM: __dirname não existe em ES Modules puros.
// O esbuild compila com --format=esm, então import.meta.url está disponível.
// Em dev (tsx watch) isso também funciona corretamente.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Log de todas as requisições para debug
  app.use((req, _res, next) => {
    console.log(`[REQ] ${req.method} ${req.url} from ${req.ip}`);
    next();
  });

  registerOAuthRoutes(app);
  registerUploadRoutes(app);

  // Painel administrativo web
  app.get("/painel", (req, res) => {
    try {
      // Em produção (esbuild ESM → dist/index.js), __dirname = dist/
      // O script build copia painel.html para dist/, então tentamos dist/painel.html primeiro.
      // Em dev (tsx watch), __dirname = server/_core/, então tentamos ../painel.html.
      let htmlPath = path.resolve(__dirname, "painel.html");
      if (!fs.existsSync(htmlPath)) {
        htmlPath = path.resolve(__dirname, "../painel.html");
      }
      if (!fs.existsSync(htmlPath)) {
        htmlPath = path.resolve(process.cwd(), "dist", "painel.html");
      }
      let html = fs.readFileSync(htmlPath, "utf-8");
      // Injeta a chave da Google Maps API (se configurada)
      const gmapsKey = process.env.GOOGLE_MAPS_API_KEY ?? "";
      html = html.replace("__GMAPS_API_KEY__", gmapsKey);
      // Injeta a URL base da API para que o painel resolva caminhos relativos de fotos
      // Ex: /uploads/arvores/abc.jpg → https://3000-*.manus.computer/uploads/arvores/abc.jpg
      //
      // Ordem de prioridade dos fallbacks:
      // 1. x-forwarded-proto + x-forwarded-host (proxy reverso: Nginx, Manus, etc.)
      // 2. req.protocol + req.headers.host     (acesso direto com header Host)
      // 3. PUBLIC_URL env var                  (configurado manualmente em produção)
      // 4. http://localhost:{port}              (dev local sem proxy, último recurso)
      const forwardedProto = req.headers["x-forwarded-proto"];
      const forwardedHost  = req.headers["x-forwarded-host"];
      const directHost     = req.headers.host;
      const envUrl         = process.env.PUBLIC_URL;

      let apiBase: string;
      if (forwardedProto && forwardedHost) {
        // Cenário 1: atrás de proxy reverso (Nginx, Manus, Cloudflare, etc.)
        const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
        const host  = Array.isArray(forwardedHost)  ? forwardedHost[0]  : forwardedHost;
        apiBase = `${proto}://${host}`;
      } else if (directHost) {
        // Cenário 2: acesso direto (curl, dev local com header Host presente)
        apiBase = `${req.protocol}://${directHost}`;
      } else if (envUrl) {
        // Cenário 3: variável de ambiente configurada manualmente
        apiBase = envUrl.replace(/\/$/, ""); // remove trailing slash
      } else {
        // Cenário 4: último recurso — localhost com a porta atual
        apiBase = `http://127.0.0.1:${port}`;
      }

      html = html.replace("__APIBASE_PLACEHOLDER__", apiBase);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err) {
      console.error("[painel] erro ao servir HTML:", err);
      res.status(500).send("Erro ao carregar o painel.");
    }
  });

  // Rota de exportação KMZ
  app.get("/api/kmz", async (req, res) => {
    try {
      await gerarKmz(req, res);
    } catch (err) {
      console.error("[kmz] erro ao gerar:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erro ao gerar KMZ" });
      }
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
