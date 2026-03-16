import { boolean, decimal, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tabela de árvores cadastradas em campo.
 * Armazena dados de identificação, localização GPS, foto e resultado do IRQ.
 */
export const arvores = mysqlTable("arvores", {
  id: int("id").autoincrement().primaryKey(),
  /** ID local gerado no app (UUID) para sincronização offline */
  localId: varchar("localId", { length: 64 }).notNull().unique(),
  nomeCientifico: varchar("nomeCientifico", { length: 255 }),
  descricao: text("descricao"),
  /** URL da foto no S3 */
  fotoUrl: text("fotoUrl"),
  /** Coordenadas GPS */
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  /** Dados do cálculo IRQ */
  irqValor: decimal("irqValor", { precision: 10, scale: 2 }),
  irqClassificacao: varchar("irqClassificacao", { length: 20 }),
  /** Parâmetros do cálculo IRQ (armazenados como JSON) */
  irqParametros: text("irqParametros"),
  /** Cor do pino no mapa */
  pinColor: varchar("pinColor", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Arvore = typeof arvores.$inferSelect;
export type InsertArvore = typeof arvores.$inferInsert;

/**
 * Tabela de regiões demarcadas como polígonos no mapa.
 * Armazena título, descrição, foto e coordenadas dos vértices do polígono.
 */
export const regioes = mysqlTable("regioes", {
  id: int("id").autoincrement().primaryKey(),
  /** ID local gerado no app (UUID) para sincronização offline */
  localId: varchar("localId", { length: 64 }).notNull().unique(),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao"),
  /** URL da foto no S3 */
  fotoUrl: text("fotoUrl"),
  /**
   * Coordenadas dos vértices do polígono em JSON nativo do MySQL.
   * Formato: [{ latitude: number, longitude: number }, ...]
   * Usando json() para aproveitar validação e indexação JSON nativa do MySQL 8.0.
   */
  coordenadas: json("coordenadas").$type<Array<{ latitude: number; longitude: number }>>().notNull(),
  /** Latitude do centróide (para referência) */
  centroLat: decimal("centroLat", { precision: 10, scale: 7 }),
  /** Longitude do centróide (para referência) */
  centroLng: decimal("centroLng", { precision: 10, scale: 7 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Regiao = typeof regioes.$inferSelect;
export type InsertRegiao = typeof regioes.$inferInsert;
