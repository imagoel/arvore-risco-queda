/**
 * Gerador de relatório Word (.docx)
 *
 * Fluxo:
 * 1. Recebe lista de localIds de árvores e regiões selecionadas
 * 2. Busca os dados no MySQL
 * 3. Monta o documento .docx com a lib "docx"
 * 4. Envia para download
 */

import fs from "fs";
import path from "path";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  PageBreak,
} from "docx";
import type { Request, Response } from "express";
import * as db from "./db";
import { UPLOADS_DIR } from "./upload-local";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Normaliza irqValor (0-10000) para percentual (0-100) */
function normalizarIrq(irqValor: string | number | null | undefined): number | null {
  if (irqValor == null) return null;
  const v = typeof irqValor === "string" ? parseFloat(irqValor) : irqValor;
  if (isNaN(v)) return null;
  return Math.min(Math.round((v / 10000) * 100), 100);
}

/** Formata data no padrão brasileiro */
function formatarData(d: Date): string {
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/** Lê dimensões de um JPEG a partir dos markers SOF no buffer */
function lerDimensoesJpeg(buf: Buffer): { w: number; h: number } | null {
  let i = 2; // pula SOI (0xFFD8)
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    // SOF0..SOF3 contêm as dimensões
    if (marker >= 0xc0 && marker <= 0xc3) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return { w, h };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

/** Largura máxima da foto no documento (em pixels do Word ~96dpi) */
const FOTO_MAX_WIDTH = 400;
/** Altura máxima — garante que foto + título + dados cabem em 1 página */
const FOTO_MAX_HEIGHT = 500;

/** Tenta carregar uma imagem local; retorna o buffer e dimensões proporcionais */
function carregarFoto(fotoUrl: string | null | undefined): { data: Buffer; width: number; height: number } | null {
  if (!fotoUrl || !fotoUrl.startsWith("/uploads/")) return null;
  const localPath = path.join(UPLOADS_DIR, fotoUrl.replace("/uploads/", ""));
  try {
    if (!fs.existsSync(localPath)) return null;
    const data = fs.readFileSync(localPath);
    const dims = lerDimensoesJpeg(data);
    if (dims && dims.w > 0 && dims.h > 0) {
      const ratio = dims.h / dims.w;
      let width = Math.min(FOTO_MAX_WIDTH, dims.w);
      let height = Math.round(width * ratio);
      // Se a altura ultrapassar o máximo, reduz proporcionalmente
      if (height > FOTO_MAX_HEIGHT) {
        height = FOTO_MAX_HEIGHT;
        width = Math.round(height / ratio);
      }
      return { data, width, height };
    }
    // Fallback se não conseguir ler dimensões
    return { data, width: FOTO_MAX_WIDTH, height: 338 };
  } catch { /* ignora */ }
  return null;
}

/** Borda fina padrão para tabelas */
const BORDA_FINA = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
} as const;

/** Cria uma linha de tabela com label + valor */
function linhaTabela(label: string, valor: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        borders: BORDA_FINA,
        width: { size: 35, type: WidthType.PERCENTAGE },
        children: [new Paragraph({
          children: [new TextRun({ text: label, bold: true, size: 20, font: "Arial" })],
        })],
      }),
      new TableCell({
        borders: BORDA_FINA,
        width: { size: 65, type: WidthType.PERCENTAGE },
        children: [new Paragraph({
          children: [new TextRun({ text: valor, size: 20, font: "Arial" })],
        })],
      }),
    ],
  });
}

/** Mapa de nomes amigáveis dos parâmetros IRQ */
const PARAM_LABELS: Record<string, string> = {
  diametroCopa: "Diâmetro da copa (m)",
  alturaGeral: "Altura geral (m)",
  alturaRamificacao: "Altura de ramificação (m)",
  dap: "DAP (cm)",
  dcolo: "Diâmetro do colo (cm)",
  anguloInclinacao: "Ângulo de inclinação (°)",
  coloDiagnosticado: "Colo diagnosticado (cm)",
  ramificacaoV: "Ramificação em V",
  corpoFrutificacao: "Corpo de frutificação",
};

// ── Gerador principal ───────────────────────────────────────────────────────

export async function gerarRelatorio(req: Request, res: Response): Promise<void> {
  const { arvoreIds, regiaoIds } = req.body as {
    arvoreIds?: string[];
    regiaoIds?: string[];
  };

  // Busca todos os dados
  const [todasArvores, todasRegioes] = await Promise.all([
    db.listarArvores(),
    db.listarRegioes(),
  ]);

  // Se algum array foi enviado (mesmo vazio), filtra pelos selecionados.
  // Se ambos forem null/undefined, inclui tudo (nenhum checkbox marcado = relatório completo).
  const temSelecao = arvoreIds != null || regiaoIds != null;
  const arvores = temSelecao
    ? todasArvores.filter((a) => arvoreIds?.includes(a.localId))
    : todasArvores;

  const regioes = temSelecao
    ? todasRegioes.filter((r) => regiaoIds?.includes(r.localId))
    : todasRegioes;

  // ── Resumo por classificação ──────────────────────────────────────────
  const contagem: Record<string, number> = {
    "Risco Muito Baixo": 0,
    "Risco Baixo": 0,
    "Alerta - Monitorar Árvore": 0,
    "Alerta - Supressão da Árvore": 0,
    "Sem classificação": 0,
  };
  for (const a of arvores) {
    const cls = a.irqClassificacao || "Sem classificação";
    if (cls in contagem) contagem[cls]++;
    else contagem["Sem classificação"]++;
  }

  // ── Seções do documento ───────────────────────────────────────────────
  const children: Paragraph[] | (Paragraph | Table)[] = [];

  // Título
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Relatório de Inventário Arbóreo", bold: true, size: 32, font: "Arial", color: "000000" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: `Data de geração: ${formatarData(new Date())}`, size: 22, font: "Arial", color: "666666" })],
    }),
  );

  // Tabela de resumo
  const resumoRows = [
    new TableRow({
      children: [
        new TableCell({
          borders: BORDA_FINA,
          shading: { fill: "E8E8E8" },
          children: [new Paragraph({ children: [new TextRun({ text: "Classificação", bold: true, size: 20, font: "Arial" })] })],
        }),
        new TableCell({
          borders: BORDA_FINA,
          shading: { fill: "E8E8E8" },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Quantidade", bold: true, size: 20, font: "Arial" })],
          })],
        }),
      ],
    }),
    ...Object.entries(contagem).map(([cls, qtd]) =>
      new TableRow({
        children: [
          new TableCell({
            borders: BORDA_FINA,
            children: [new Paragraph({ children: [new TextRun({ text: cls, size: 20, font: "Arial" })] })],
          }),
          new TableCell({
            borders: BORDA_FINA,
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: String(qtd), size: 20, font: "Arial" })],
            })],
          }),
        ],
      }),
    ),
    // Total
    new TableRow({
      children: [
        new TableCell({
          borders: BORDA_FINA,
          shading: { fill: "E8E8E8" },
          children: [new Paragraph({ children: [new TextRun({ text: "Total de árvores", bold: true, size: 20, font: "Arial" })] })],
        }),
        new TableCell({
          borders: BORDA_FINA,
          shading: { fill: "E8E8E8" },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: String(arvores.length), bold: true, size: 20, font: "Arial" })],
          })],
        }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          borders: BORDA_FINA,
          shading: { fill: "E8E8E8" },
          children: [new Paragraph({ children: [new TextRun({ text: "Total de regiões", bold: true, size: 20, font: "Arial" })] })],
        }),
        new TableCell({
          borders: BORDA_FINA,
          shading: { fill: "E8E8E8" },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: String(regioes.length), bold: true, size: 20, font: "Arial" })],
          })],
        }),
      ],
    }),
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: resumoRows,
    }),
  );

  // ── Inventário de Árvores ─────────────────────────────────────────────
  if (arvores.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 400 },
        children: [new TextRun({ text: "Inventário de Árvores", bold: true, size: 28, font: "Arial", color: "000000" })],
      }),
    );

    for (let i = 0; i < arvores.length; i++) {
      const a = arvores[i];
      const irqNorm = normalizarIrq(a.irqValor);
      const nome = a.nomeCientifico || "Árvore sem nome";

      // Título da árvore
      children.push(
        new Paragraph({
          spacing: { before: 300 },
          children: [new TextRun({ text: `${i + 1}. ${nome}`, bold: true, size: 24, font: "Arial", color: "000000" })],
        }),
      );

      // Foto (acima das informações)
      const foto = carregarFoto(a.fotoUrl);
      if (foto) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new ImageRun({
                data: foto.data,
                transformation: { width: foto.width, height: foto.height },
                type: "jpg",
              }),
            ],
          }),
        );
      }

      // Tabela de dados
      const dadosRows = [
        linhaTabela("Coordenadas", `${a.latitude}, ${a.longitude}`),
      ];
      if (irqNorm != null) {
        dadosRows.push(linhaTabela("IRQ", `${irqNorm}% — ${a.irqClassificacao || ""}`));
      }
      if (a.descricao) {
        dadosRows.push(linhaTabela("Descrição", a.descricao));
      }

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: dadosRows,
        }),
      );

      // Parâmetros dendrométricos (se existem)
      const params = a.irqParametros;
      if (params && typeof params === "object") {
        const paramRows: TableRow[] = [
          new TableRow({
            children: [
              new TableCell({
                borders: BORDA_FINA,
                shading: { fill: "E8E8E8" },
                children: [new Paragraph({ children: [new TextRun({ text: "Parâmetro", bold: true, size: 18, font: "Arial" })] })],
              }),
              new TableCell({
                borders: BORDA_FINA,
                shading: { fill: "E8E8E8" },
                children: [new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: "Valor", bold: true, size: 18, font: "Arial" })],
                })],
              }),
            ],
          }),
        ];

        for (const [key, label] of Object.entries(PARAM_LABELS)) {
          const val = (params as Record<string, unknown>)[key];
          if (val == null) continue;
          const display = typeof val === "boolean" ? (val ? "Sim" : "Não") : String(val);
          paramRows.push(linhaTabela(label, display));
        }

        if (paramRows.length > 1) {
          children.push(
            new Paragraph({
              spacing: { before: 100 },
              children: [new TextRun({ text: "Parâmetros Dendrométricos", bold: true, italics: true, size: 20, font: "Arial" })],
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: paramRows,
            }),
          );
        }
      }

      // Quebra de página entre árvores (exceto a última)
      if (i < arvores.length - 1) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
    }
  }

  // ── Inventário de Regiões ─────────────────────────────────────────────
  if (regioes.length > 0) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        children: [new TextRun({ text: "Inventário de Regiões", bold: true, size: 28, font: "Arial", color: "000000" })],
      }),
    );

    for (let i = 0; i < regioes.length; i++) {
      const r = regioes[i];
      const titulo = r.titulo || "Região sem título";

      children.push(
        new Paragraph({
          spacing: { before: 300 },
          children: [new TextRun({ text: `${i + 1}. ${titulo}`, bold: true, size: 24, font: "Arial", color: "000000" })],
        }),
      );

      // Foto
      const foto = carregarFoto(r.fotoUrl);
      if (foto) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new ImageRun({
                data: foto.data,
                transformation: { width: foto.width, height: foto.height },
                type: "jpg",
              }),
            ],
          }),
        );
      }

      // Dados
      const coords = Array.isArray(r.coordenadas) ? r.coordenadas : [];
      const dadosRows = [
        linhaTabela("Vértices", `${coords.length} pontos`),
      ];
      if (r.descricao) {
        dadosRows.push(linhaTabela("Descrição", r.descricao));
      }

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: dadosRows,
        }),
      );

      if (i < regioes.length - 1) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
    }
  }

  // ── Gera o documento ──────────────────────────────────────────────────
  const doc = new Document({
    sections: [{ children: children as (Paragraph | Table)[] }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `relatorio-inventario-${new Date().toISOString().slice(0, 10)}.docx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}
