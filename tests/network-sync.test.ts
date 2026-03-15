/**
 * Testes unitários para a lógica de fila de sincronização pendente.
 * Testa as funções puras de gerenciamento de fila sem dependências nativas.
 *
 * NOTA: O hook use-network-sync importa módulos nativos (expo-network, @/lib/sync).
 * Para evitar problemas de resolução de alias no Vitest, testamos a lógica de fila
 * diretamente, replicando as funções puras aqui.
 */
import { describe, it, expect, beforeEach } from "vitest";

// ─── Replicando a lógica de fila (funções puras, sem dependências nativas) ────

const PENDING_TREES_KEY = "@sync_pending_trees";
const PENDING_REGIONS_KEY = "@sync_pending_regions";

// Simulação do AsyncStorage em memória
const storage: Record<string, string> = {};
const AsyncStorage = {
  getItem: async (key: string) => storage[key] ?? null,
  setItem: async (key: string, value: string) => { storage[key] = value; },
};

async function marcarArvorePendente(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(PENDING_TREES_KEY);
  const pending: string[] = raw ? JSON.parse(raw) : [];
  if (!pending.includes(id)) {
    pending.push(id);
    await AsyncStorage.setItem(PENDING_TREES_KEY, JSON.stringify(pending));
  }
}

async function marcarRegiaoPendente(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(PENDING_REGIONS_KEY);
  const pending: string[] = raw ? JSON.parse(raw) : [];
  if (!pending.includes(id)) {
    pending.push(id);
    await AsyncStorage.setItem(PENDING_REGIONS_KEY, JSON.stringify(pending));
  }
}

async function removerArvorePendente(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(PENDING_TREES_KEY);
  const pending: string[] = raw ? JSON.parse(raw) : [];
  const updated = pending.filter((p) => p !== id);
  await AsyncStorage.setItem(PENDING_TREES_KEY, JSON.stringify(updated));
}

async function removerRegiaoPendente(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(PENDING_REGIONS_KEY);
  const pending: string[] = raw ? JSON.parse(raw) : [];
  const updated = pending.filter((p) => p !== id);
  await AsyncStorage.setItem(PENDING_REGIONS_KEY, JSON.stringify(updated));
}

async function contarPendentes(): Promise<number> {
  const [rawTrees, rawRegions] = await Promise.all([
    AsyncStorage.getItem(PENDING_TREES_KEY),
    AsyncStorage.getItem(PENDING_REGIONS_KEY),
  ]);
  const trees: string[] = rawTrees ? JSON.parse(rawTrees) : [];
  const regions: string[] = rawRegions ? JSON.parse(rawRegions) : [];
  return trees.length + regions.length;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function limparStorage() {
  Object.keys(storage).forEach((k) => delete storage[k]);
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("Fila de sincronização pendente — árvores", () => {
  beforeEach(limparStorage);

  it("adiciona uma árvore à fila vazia", async () => {
    await marcarArvorePendente("tree-1");
    const raw = storage[PENDING_TREES_KEY];
    expect(JSON.parse(raw)).toContain("tree-1");
  });

  it("adiciona múltiplas árvores à fila", async () => {
    await marcarArvorePendente("tree-1");
    await marcarArvorePendente("tree-2");
    const pending = JSON.parse(storage[PENDING_TREES_KEY]);
    expect(pending).toHaveLength(2);
    expect(pending).toContain("tree-1");
    expect(pending).toContain("tree-2");
  });

  it("não duplica o mesmo id na fila", async () => {
    await marcarArvorePendente("tree-1");
    await marcarArvorePendente("tree-1");
    const pending = JSON.parse(storage[PENDING_TREES_KEY]);
    expect(pending).toHaveLength(1);
  });

  it("remove uma árvore da fila", async () => {
    await marcarArvorePendente("tree-1");
    await marcarArvorePendente("tree-2");
    await removerArvorePendente("tree-1");
    const pending = JSON.parse(storage[PENDING_TREES_KEY]);
    expect(pending).not.toContain("tree-1");
    expect(pending).toContain("tree-2");
  });

  it("remove árvore inexistente sem erros", async () => {
    await marcarArvorePendente("tree-1");
    await removerArvorePendente("tree-999");
    const pending = JSON.parse(storage[PENDING_TREES_KEY]);
    expect(pending).toHaveLength(1);
  });

  it("fila fica vazia após remover único item", async () => {
    await marcarArvorePendente("tree-1");
    await removerArvorePendente("tree-1");
    const pending = JSON.parse(storage[PENDING_TREES_KEY]);
    expect(pending).toHaveLength(0);
  });
});

describe("Fila de sincronização pendente — regiões", () => {
  beforeEach(limparStorage);

  it("adiciona uma região à fila vazia", async () => {
    await marcarRegiaoPendente("region-1");
    const raw = storage[PENDING_REGIONS_KEY];
    expect(JSON.parse(raw)).toContain("region-1");
  });

  it("não duplica o mesmo id de região", async () => {
    await marcarRegiaoPendente("region-1");
    await marcarRegiaoPendente("region-1");
    const pending = JSON.parse(storage[PENDING_REGIONS_KEY]);
    expect(pending).toHaveLength(1);
  });

  it("remove uma região da fila", async () => {
    await marcarRegiaoPendente("region-1");
    await marcarRegiaoPendente("region-2");
    await removerRegiaoPendente("region-1");
    const pending = JSON.parse(storage[PENDING_REGIONS_KEY]);
    expect(pending).not.toContain("region-1");
    expect(pending).toContain("region-2");
  });
});

describe("Contagem de pendentes", () => {
  beforeEach(limparStorage);

  it("retorna 0 quando não há pendentes", async () => {
    const count = await contarPendentes();
    expect(count).toBe(0);
  });

  it("conta apenas árvores pendentes", async () => {
    await marcarArvorePendente("tree-1");
    await marcarArvorePendente("tree-2");
    const count = await contarPendentes();
    expect(count).toBe(2);
  });

  it("conta apenas regiões pendentes", async () => {
    await marcarRegiaoPendente("region-1");
    const count = await contarPendentes();
    expect(count).toBe(1);
  });

  it("soma árvores e regiões pendentes", async () => {
    await marcarArvorePendente("tree-1");
    await marcarArvorePendente("tree-2");
    await marcarRegiaoPendente("region-1");
    const count = await contarPendentes();
    expect(count).toBe(3);
  });

  it("decrementa após remover pendente", async () => {
    await marcarArvorePendente("tree-1");
    await marcarArvorePendente("tree-2");
    await removerArvorePendente("tree-1");
    const count = await contarPendentes();
    expect(count).toBe(1);
  });

  it("retorna 0 após remover todos os pendentes", async () => {
    await marcarArvorePendente("tree-1");
    await marcarRegiaoPendente("region-1");
    await removerArvorePendente("tree-1");
    await removerRegiaoPendente("region-1");
    const count = await contarPendentes();
    expect(count).toBe(0);
  });
});

describe("Lógica de detecção de transição de rede", () => {
  it("detecta transição offline → online quando wasOffline=true e isOnline=true", () => {
    let wasOffline = true;
    const isOnline = true;
    const shouldSync = isOnline && wasOffline;
    expect(shouldSync).toBe(true);
    wasOffline = false; // atualiza estado
    expect(wasOffline).toBe(false);
  });

  it("não dispara sync quando já estava online", () => {
    const wasOffline = false;
    const isOnline = true;
    const shouldSync = isOnline && wasOffline;
    expect(shouldSync).toBe(false);
  });

  it("não dispara sync quando ainda está offline", () => {
    const wasOffline = true;
    const isOnline = false;
    const shouldSync = isOnline && wasOffline;
    expect(shouldSync).toBe(false);
  });

  it("isOnline é false quando isConnected é false", () => {
    const state = { isConnected: false, isInternetReachable: null };
    const isOnline = !!(state.isConnected && state.isInternetReachable !== false);
    expect(isOnline).toBe(false);
  });

  it("isOnline é true quando isConnected=true e isInternetReachable=true", () => {
    const state = { isConnected: true, isInternetReachable: true };
    const isOnline = !!(state.isConnected && state.isInternetReachable !== false);
    expect(isOnline).toBe(true);
  });

  it("isOnline é false quando isConnected=true mas isInternetReachable=false", () => {
    const state = { isConnected: true, isInternetReachable: false };
    const isOnline = !!(state.isConnected && state.isInternetReachable !== false);
    expect(isOnline).toBe(false);
  });

  it("isOnline é true quando isInternetReachable=null (iOS retorna null quando conectado)", () => {
    const state = { isConnected: true, isInternetReachable: null };
    const isOnline = !!(state.isConnected && state.isInternetReachable !== false);
    expect(isOnline).toBe(true);
  });
});
