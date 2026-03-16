/**
 * Gerador de arquivo .kmz
 *
 * Fluxo:
 * 1. Busca todas as árvores e regiões do MySQL
 * 2. Formata as coordenadas em XML KML
 * 3. Copia as fotos locais da pasta /uploads
 * 4. Compacta tudo em um .kmz (ZIP com extensão .kmz)
 * 5. Envia o arquivo para download
 */

import fs from "fs";
import path from "path";
import archiver from "archiver";
import type { Response } from "express";
import * as db from "./db";
import { UPLOADS_DIR } from "./upload-local";

/** Escapa caracteres especiais XML */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Converte cor hex (#RRGGBB) para formato KML AABBGGRR */
function hexToKmlColor(hex: string, alpha = "ff"): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "ff0000ff";
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `${alpha}${b}${g}${r}`;
}

/** Extrai a URL base do servidor a partir do request (mesmo algoritmo do painel) */
function getApiBase(req: import("express").Request): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost  = req.headers["x-forwarded-host"];
  const directHost     = req.headers.host;
  const envUrl         = process.env.PUBLIC_URL;
  const port           = process.env.PORT ?? "3000";
  if (forwardedProto && forwardedHost) {
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const host  = Array.isArray(forwardedHost)  ? forwardedHost[0]  : forwardedHost;
    return `${proto}://${host}`;
  }
  if (directHost) return `${req.protocol}://${directHost}`;
  if (envUrl) return envUrl.replace(/\/$/, "");
  return `http://127.0.0.1:${port}`;
}

/** Gera o KML e compacta em .kmz, enviando diretamente para o response */
export async function gerarKmz(req: import("express").Request, res: Response): Promise<void> {
  const apiBase = getApiBase(req);
  const [arvores, regioes] = await Promise.all([
    db.listarArvores(),
    db.listarRegioes(),
  ]);

  // ── Monta o conteúdo KML ──────────────────────────────────────────────────
  const placemarks: string[] = [];
  const fotosAnexadas = new Map<string, string>(); // url → caminho local

  // Helper para registrar foto local
  // Prioridade: 1) arquivo local embutido no ZIP, 2) URL absoluta do servidor, 3) URL externa
  function registrarFoto(fotoUrl: string | null | undefined): string | null {
    if (!fotoUrl) return null;
    if (fotoUrl.startsWith("/uploads/")) {
      const localPath = path.join(UPLOADS_DIR, fotoUrl.replace("/uploads/", ""));
      if (fs.existsSync(localPath)) {
        // Arquivo existe no disco: embute no ZIP para acesso offline
        const kmzPath = `files${fotoUrl}`; // ex: files/uploads/arvores/abc.jpg
        fotosAnexadas.set(kmzPath, localPath);
        return kmzPath;
      }
      // Arquivo não existe localmente (container reiniciado, etc.):
      // usa URL absoluta para que o Google Earth busque via HTTP quando online
      return `${apiBase}${fotoUrl}`;
    }
    // URL externa (S3 ou outra): referencia diretamente no KML
    return fotoUrl;
  }

  // ── Árvores ───────────────────────────────────────────────────────────────
  for (const a of arvores) {
    const nome = escapeXml(a.nomeCientifico || "Árvore sem nome");
    const desc = escapeXml(a.descricao || "");
    const norm = a.irqValor ? Math.min(Math.round((parseFloat(String(a.irqValor)) / 10000) * 100), 100) : null;
    const irq = norm != null ? `IRQ: ${norm}% — ${escapeXml(a.irqClassificacao || "")}` : "";
    const fotoRef = registrarFoto(a.fotoUrl);
    const fotoTag = fotoRef ? `<img src="${escapeXml(fotoRef)}" width="400"/><br/>` : "";
    const pinColor = hexToKmlColor(a.pinColor || "#22c55e");

    placemarks.push(`
    <Placemark>
      <name>${nome}</name>
      <description><![CDATA[${fotoTag}${desc ? `<p>${desc}</p>` : ""}${irq ? `<p><b>${irq}</b></p>` : ""}]]></description>
      <Style>
        <IconStyle>
          <color>${pinColor}</color>
          <scale>1.2</scale>
          <Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon>
        </IconStyle>
      </Style>
      <Point>
        <coordinates>${a.longitude},${a.latitude},0</coordinates>
      </Point>
    </Placemark>`);
  }

  // ── Regiões (polígonos) ───────────────────────────────────────────────────
  for (const r of regioes) {
    const titulo = escapeXml(r.titulo || "Região sem título");
    const desc = escapeXml(r.descricao || "");
    const fotoRef = registrarFoto(r.fotoUrl);
    const fotoTag = fotoRef ? `<img src="${escapeXml(fotoRef)}" width="400"/><br/>` : "";

    let coordsKml = "";
    try {
      // coordenadas é JSON nativo do MySQL: já retorna como array de objetos
      const coords: Array<{ latitude: number; longitude: number }> = Array.isArray(r.coordenadas)
        ? r.coordenadas
        : JSON.parse(String(r.coordenadas || "[]"));
      coordsKml = coords.map((c) => `${c.longitude},${c.latitude},0`).join(" ");
      // Fecha o polígono repetindo o primeiro ponto
      if (coords.length > 0) {
        coordsKml += ` ${coords[0].longitude},${coords[0].latitude},0`;
      }
    } catch {
      coordsKml = "";
    }

    if (!coordsKml) continue;

    placemarks.push(`
    <Placemark>
      <name>${titulo}</name>
      <description><![CDATA[${fotoTag}${desc}]]></description>
      <Style>
        <LineStyle><color>ff5b2ebe</color><width>2</width></LineStyle>
        <PolyStyle><color>4d5b2ebe</color></PolyStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordsKml}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`);
  }

  const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Risco de Queda de Árvores</name>
    <description>Exportado pelo app Risco de Queda</description>
    ${placemarks.join("\n")}
  </Document>
</kml>`;

  // ── Compacta em .kmz ──────────────────────────────────────────────────────
  const filename = `risco-queda-${new Date().toISOString().slice(0, 10)}.kmz`;

  res.setHeader("Content-Type", "application/vnd.google-earth.kmz");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);

  // Adiciona o doc.kml principal
  archive.append(kmlContent, { name: "doc.kml" });

  // Adiciona as fotos locais
  for (const [kmzPath, localPath] of fotosAnexadas) {
    archive.file(localPath, { name: kmzPath });
  }

  await archive.finalize();
}
