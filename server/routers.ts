import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { storagePut } from "./storage";

// ─── Schemas de validação ────────────────────────────────────────────────────

const coordenadaSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

const irqParametrosSchema = z.object({
  diametroCopa: z.number().optional(),
  alturaGeral: z.number().optional(),
  alturaRamificacao: z.number().optional(),
  dap: z.number().optional(),
  dcolo: z.number().optional(),
  anguloInclinacao: z.number().optional(),
  coloDiagnosticado: z.number().optional(),
  ramificacaoV: z.boolean().optional(),
  corpoFrutificacao: z.boolean().optional(),
}).optional();

const arvoreInputSchema = z.object({
  localId: z.string(),
  nomeCientifico: z.string().optional(),
  descricao: z.string().optional(),
  fotoUrl: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  irqValor: z.number().optional(),
  irqClassificacao: z.string().optional(),
  irqParametros: irqParametrosSchema,
  pinColor: z.string().optional(),
});

const coordenadaArraySchema = z.array(z.object({
  latitude: z.number(),
  longitude: z.number(),
}));

const regiaoInputSchema = z.object({
  localId: z.string(),
  titulo: z.string(),
  descricao: z.string().optional(),
  fotoUrl: z.string().optional(),
  /** Array de coordenadas (JSON nativo no MySQL) */
  coordenadas: coordenadaArraySchema,
  centroLat: z.number().optional(),
  centroLng: z.number().optional(),
});

// ─── Router principal ────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      return { success: true } as const;
    }),
  }),

  // ─── Upload de foto ────────────────────────────────────────────────────────
  upload: router({
    foto: publicProcedure
      .input(z.object({
        /** Base64 da imagem */
        base64: z.string(),
        /** Tipo MIME: image/jpeg ou image/png */
        mimeType: z.string().default("image/jpeg"),
        /** Prefixo da pasta: "arvores" ou "regioes" */
        pasta: z.string().default("arvores"),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.mimeType === "image/png" ? "png" : "jpg";
        const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const fileKey = `${input.pasta}/${suffix}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        return { url };
      }),
  }),

  // ─── Árvores ───────────────────────────────────────────────────────────────
  arvores: router({
    listar: publicProcedure.query(async () => {
      return db.listarArvores();
    }),

    sincronizar: publicProcedure
      .input(arvoreInputSchema)
      .mutation(async ({ input }) => {
        const existente = await db.buscarArvore(input.localId);
        if (existente) {
          await db.atualizarArvore(input.localId, {
            nomeCientifico: input.nomeCientifico,
            descricao: input.descricao,
            fotoUrl: input.fotoUrl,
            latitude: String(input.latitude),
            longitude: String(input.longitude),
            irqValor: input.irqValor !== undefined ? String(input.irqValor) : undefined,
            irqClassificacao: input.irqClassificacao,
            irqParametros: input.irqParametros,
            pinColor: input.pinColor,
          });
          return { acao: "atualizado", localId: input.localId };
        } else {
          await db.criarArvore({
            localId: input.localId,
            nomeCientifico: input.nomeCientifico,
            descricao: input.descricao,
            fotoUrl: input.fotoUrl,
            latitude: String(input.latitude),
            longitude: String(input.longitude),
            irqValor: input.irqValor !== undefined ? String(input.irqValor) : undefined,
            irqClassificacao: input.irqClassificacao,
            irqParametros: input.irqParametros,
            pinColor: input.pinColor,
          });
          return { acao: "criado", localId: input.localId };
        }
      }),

    deletar: publicProcedure
      .input(z.object({ localId: z.string() }))
      .mutation(async ({ input }) => {
        await db.deletarArvore(input.localId);
        return { sucesso: true };
      }),
  }),

  // ─── Regiões ───────────────────────────────────────────────────────────────
  regioes: router({
    listar: publicProcedure.query(async () => {
      return db.listarRegioes();
    }),

    sincronizar: publicProcedure
      .input(regiaoInputSchema)
      .mutation(async ({ input }) => {
        const existente = await db.buscarRegiao(input.localId);
        if (existente) {
          await db.atualizarRegiao(input.localId, {
            titulo: input.titulo,
            descricao: input.descricao,
            fotoUrl: input.fotoUrl,
            coordenadas: input.coordenadas,
            centroLat: input.centroLat !== undefined ? String(input.centroLat) : undefined,
            centroLng: input.centroLng !== undefined ? String(input.centroLng) : undefined,
          });
          return { acao: "atualizado", localId: input.localId };
        } else {
          await db.criarRegiao({
            localId: input.localId,
            titulo: input.titulo,
            descricao: input.descricao,
            fotoUrl: input.fotoUrl,
            coordenadas: input.coordenadas,
            centroLat: input.centroLat !== undefined ? String(input.centroLat) : undefined,
            centroLng: input.centroLng !== undefined ? String(input.centroLng) : undefined,
          });
          return { acao: "criado", localId: input.localId };
        }
      }),

    deletar: publicProcedure
      .input(z.object({ localId: z.string() }))
      .mutation(async ({ input }) => {
        await db.deletarRegiao(input.localId);
        return { sucesso: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
