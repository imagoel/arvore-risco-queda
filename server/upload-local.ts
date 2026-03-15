/**
 * Upload local de fotos usando multer.
 * As fotos são salvas fisicamente em /uploads dentro do servidor.
 * O banco armazena apenas o caminho relativo: /uploads/arvores/abc123.jpg
 */

import fs from "fs";
import path from "path";
import multer from "multer";
import type { Express, Request, Response } from "express";

// Diretório raiz de uploads (relativo ao processo)
export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

// Garante que os subdiretórios existem ao iniciar
for (const sub of ["arvores", "regioes"]) {
  fs.mkdirSync(path.join(UPLOADS_DIR, sub), { recursive: true });
}

// Configuração do multer: disco local
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const pasta = (req.query.pasta as string) || "arvores";
    const dir = path.join(UPLOADS_DIR, pasta);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${suffix}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Apenas imagens são permitidas"));
    }
  },
});

/**
 * Registra as rotas de upload e serving de fotos no app Express.
 */
export function registerUploadRoutes(app: Express) {
  // POST /api/upload?pasta=arvores  →  { url: "/uploads/arvores/abc123.jpg" }
  app.post("/api/upload", upload.single("foto"), (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado" });
      return;
    }
    const pasta = (req.query.pasta as string) || "arvores";
    const url = `/uploads/${pasta}/${req.file.filename}`;
    res.json({ url });
  });

  // GET /uploads/:pasta/:filename  →  serve o arquivo de imagem
  app.use("/uploads", (req: Request, res: Response) => {
    const filePath = path.join(UPLOADS_DIR, req.path);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Arquivo não encontrado" });
      return;
    }
    res.sendFile(filePath);
  });
}
