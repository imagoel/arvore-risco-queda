import "dotenv/config";
import express from "express";
import crypto from "crypto";
import { createServer } from "http";
import net from "net";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerUploadRoutes } from "../upload-local";
import { gerarKmz } from "../kmz";
import { gerarRelatorio } from "../relatorio";
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

  // Cloudflare Tunnel (ou outro reverse proxy) envia x-forwarded-proto/host.
  // Sem isso, req.protocol retorna "http" mesmo quando o acesso externo é HTTPS.
  app.set("trust proxy", 1);

  // ── CORS — whitelist de origens permitidas ──────────────────────────────────
  // Requests nativos (React Native) não enviam Origin, então não são afetados.
  // Apenas browsers são restringidos por CORS.
  const allowedOrigins = new Set<string>();

  // Produção: PUBLIC_URL (ex: https://geo.c2sistemas.online)
  if (process.env.PUBLIC_URL) {
    allowedOrigins.add(process.env.PUBLIC_URL.replace(/\/$/, ""));
  }

  // Dev local: Metro web e servidor Express
  allowedOrigins.add("http://localhost:8081");
  allowedOrigins.add("http://localhost:3000");
  allowedOrigins.add("http://127.0.0.1:8081");
  allowedOrigins.add("http://127.0.0.1:3000");

  // Origens extras via env var (separadas por vírgula) para ambientes customizados
  const extraOrigins = process.env.CORS_ORIGINS || "";
  if (extraOrigins) {
    extraOrigins.split(",").forEach((o: string) => {
      const trimmed = o.trim().replace(/\/$/, "");
      if (trimmed) allowedOrigins.add(trimmed);
    });
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
    }

    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );

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

  // ── Autenticação do painel (usuário/senha via env var) ──────────────────────
  // Formato: PAINEL_USERS=user1:pass1,user2:pass2
  // Fallback: PAINEL_USER + PAINEL_PASSWORD (single user)
  const painelUsers = new Map<string, string>();
  const rawUsers = process.env.PAINEL_USERS || "";
  if (rawUsers) {
    rawUsers.split(",").forEach((entry) => {
      const idx = entry.indexOf(":");
      if (idx > 0) {
        painelUsers.set(
          entry.slice(0, idx).trim(),
          entry.slice(idx + 1).trim(),
        );
      }
    });
  } else if (process.env.PAINEL_PASSWORD) {
    painelUsers.set(
      process.env.PAINEL_USER || "admin",
      process.env.PAINEL_PASSWORD,
    );
  }

  if (painelUsers.size === 0) {
    console.warn(
      "[SEGURANÇA] Nenhum usuário do painel configurado. " +
      "Defina PAINEL_USERS=user:pass no .env. " +
      "O painel ficará BLOQUEADO até que seja configurado."
    );
  } else {
    console.log(`[painel] ${painelUsers.size} usuário(s) configurado(s)`);
  }

  const sessionTokens = new Set<string>();

  function parseCookies(header: string | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!header) return cookies;
    header.split(";").forEach((c) => {
      const [key, ...rest] = c.split("=");
      if (key) cookies[key.trim()] = rest.join("=").trim();
    });
    return cookies;
  }

  function isPainelAuth(req: express.Request): boolean {
    if (painelUsers.size === 0) return false; // sem usuários configurados = painel bloqueado
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies["painel_session"];
    return !!token && sessionTokens.has(token);
  }

  // ── REDIRECIONAMENTO DA RAIZ ──────────────────────────────────────────
  app.get("/", (_req, res) => {
    res.redirect("/login");
  });

  // Tela de login
  app.get("/login", (_req, res) => {
    let htmlPath = path.resolve(__dirname, "login.html");
    if (!fs.existsSync(htmlPath)) {
      htmlPath = path.resolve(__dirname, "../login.html");
    }
    if (fs.existsSync(htmlPath)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(fs.readFileSync(htmlPath, "utf-8"));
    } else {
      res.status(500).send("Login page not found");
    }
  });

  // Rota de login
  app.post("/api/login", (req, res) => {
    const { user, password } = req.body || {};
    if (painelUsers.has(user) && painelUsers.get(user) === password) {
      const token = crypto.randomBytes(32).toString("hex");
      sessionTokens.add(token);
      res.setHeader(
        "Set-Cookie",
        `painel_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
      );
      res.json({ ok: true });
    } else {
      res.status(401).json({ error: "Usuário ou senha inválidos" });
    }
  });

  // Rota de logout
  app.get("/api/logout", (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies["painel_session"];
    if (token) sessionTokens.delete(token);
    res.setHeader(
      "Set-Cookie",
      "painel_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
    );
    res.redirect("/login");
  });

  // Middleware: protege rotas do painel (não afeta /api/trpc nem /api/login)
  function requirePainelAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    if (isPainelAuth(req)) {
      next();
    } else {
      res.redirect("/login");
    }
  }

  registerOAuthRoutes(app);
  registerUploadRoutes(app);

  // Painel administrativo web (protegido)
  app.get("/painel", requirePainelAuth, (req, res) => {
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
      const forwardedHost = req.headers["x-forwarded-host"];
      const directHost = req.headers.host;
      const envUrl = process.env.PUBLIC_URL;

      let apiBase: string;
      if (envUrl) {
        // Cenário 1: PUBLIC_URL definida (produção — mais confiável com tunnels/proxies)
        apiBase = envUrl.replace(/\/$/, "");
      } else if (forwardedProto && forwardedHost) {
        // Cenário 2: atrás de proxy reverso (Nginx, Manus, etc.)
        const proto = Array.isArray(forwardedProto)
          ? forwardedProto[0]
          : forwardedProto;
        const host = Array.isArray(forwardedHost)
          ? forwardedHost[0]
          : forwardedHost;
        apiBase = `${proto}://${host}`;
      } else if (directHost) {
        // Cenário 3: acesso direto (curl, dev local com header Host presente)
        apiBase = `${req.protocol}://${directHost}`;
      } else {
        // Cenário 4: último recurso — localhost com a porta atual
        apiBase = `http://127.0.0.1:${port}`;
      }

      html = html.replace("__APIBASE_PLACEHOLDER__", apiBase);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.send(html);
    } catch (err) {
      console.error("[painel] erro ao servir HTML:", err);
      res.status(500).send("Erro ao carregar o painel.");
    }
  });

  // Rota de exportação KMZ (protegida)
  app.get("/api/kmz", requirePainelAuth, async (req, res) => {
    try {
      await gerarKmz(req, res);
    } catch (err) {
      console.error("[kmz] erro ao gerar:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erro ao gerar KMZ" });
      }
    }
  });

  // Rota de geração de relatório Word (.docx) (protegida)
  app.post("/api/relatorio", requirePainelAuth, async (req, res) => {
    try {
      await gerarRelatorio(req, res);
    } catch (err) {
      console.error("[relatorio] erro ao gerar:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erro ao gerar relatório" });
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
