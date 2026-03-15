import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, arvores, regioes, InsertArvore, InsertRegiao } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── ÁRVORES ────────────────────────────────────────────────────────────────

export async function listarArvores() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(arvores).orderBy(arvores.createdAt);
}

export async function criarArvore(data: InsertArvore) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(arvores).values(data);
  return result[0].insertId;
}

export async function atualizarArvore(localId: string, data: Partial<InsertArvore>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(arvores).set(data).where(eq(arvores.localId, localId));
}

export async function deletarArvore(localId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(arvores).where(eq(arvores.localId, localId));
}

export async function buscarArvore(localId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(arvores).where(eq(arvores.localId, localId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── REGIÕES ─────────────────────────────────────────────────────────────────

export async function listarRegioes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(regioes).orderBy(regioes.createdAt);
}

export async function criarRegiao(data: InsertRegiao) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(regioes).values(data);
  return result[0].insertId;
}

export async function atualizarRegiao(localId: string, data: Partial<InsertRegiao>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(regioes).set(data).where(eq(regioes.localId, localId));
}

export async function deletarRegiao(localId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(regioes).where(eq(regioes.localId, localId));
}

export async function buscarRegiao(localId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(regioes).where(eq(regioes.localId, localId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
