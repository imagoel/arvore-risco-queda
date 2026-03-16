import { decimal, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Colunas físicas no MySQL: open_id, login_method, created_at, updated_at, last_signed_in
 * (convertidas automaticamente pelo Drizzle com casing: "snake_case")
 */
export const users = mysqlTable("users", {
  id: int().autoincrement().primaryKey(),
  openId: varchar({ length: 64 }).notNull().unique(),
  name: text(),
  email: varchar({ length: 320 }),
  loginMethod: varchar({ length: 64 }),
  role: mysqlEnum(["user", "admin"]).default("user").notNull(),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp().defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tabela de árvores cadastradas em campo.
 * Armazena dados de identificação, localização GPS, foto e resultado do IRQ.
 * Colunas físicas no MySQL: local_id, nome_cientifico, foto_url, irq_valor,
 * irq_classificacao, irq_parametros, pin_color, created_at, updated_at
 */
export const arvores = mysqlTable("arvores", {
  id: int().autoincrement().primaryKey(),
  /** ID local gerado no app (UUID) para sincronização offline */
  localId: varchar({ length: 64 }).notNull().unique(),
  nomeCientifico: varchar({ length: 255 }),
  descricao: text(),
  /** Caminho relativo da foto no servidor (/uploads/arvores/abc.jpg) */
  fotoUrl: text(),
  /** Coordenadas GPS */
  latitude: decimal({ precision: 10, scale: 7 }).notNull(),
  longitude: decimal({ precision: 10, scale: 7 }).notNull(),
  /** Dados do cálculo IRQ */
  irqValor: decimal({ precision: 10, scale: 2 }),
  irqClassificacao: varchar({ length: 20 }),
  /** Parâmetros do cálculo IRQ (JSON serializado como string) */
  irqParametros: text(),
  /** Cor do pino no mapa (hex) */
  pinColor: varchar({ length: 20 }),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().onUpdateNow().notNull(),
});

export type Arvore = typeof arvores.$inferSelect;
export type InsertArvore = typeof arvores.$inferInsert;

/**
 * Tabela de regiões demarcadas como polígonos no mapa.
 * Armazena título, descrição, foto e coordenadas dos vértices do polígono.
 * Colunas físicas no MySQL: local_id, foto_url, centro_lat, centro_lng,
 * created_at, updated_at
 */
export const regioes = mysqlTable("regioes", {
  id: int().autoincrement().primaryKey(),
  /** ID local gerado no app (UUID) para sincronização offline */
  localId: varchar({ length: 64 }).notNull().unique(),
  titulo: varchar({ length: 255 }).notNull(),
  descricao: text(),
  /** Caminho relativo da foto no servidor (/uploads/regioes/abc.jpg) */
  fotoUrl: text(),
  /**
   * Coordenadas dos vértices do polígono em JSON nativo do MySQL.
   * Formato: [{ latitude: number, longitude: number }, ...]
   */
  coordenadas: json().$type<Array<{ latitude: number; longitude: number }>>().notNull(),
  /** Latitude do centróide (para referência) */
  centroLat: decimal({ precision: 10, scale: 7 }),
  /** Longitude do centróide (para referência) */
  centroLng: decimal({ precision: 10, scale: 7 }),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().onUpdateNow().notNull(),
});

export type Regiao = typeof regioes.$inferSelect;
export type InsertRegiao = typeof regioes.$inferInsert;
