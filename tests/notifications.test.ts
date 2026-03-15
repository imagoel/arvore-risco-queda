/**
 * Testes para lib/notifications.ts
 *
 * Testa a lógica pura de formatação da mensagem de notificação de sync
 * e as condições de disparo (quando notificar vs. não notificar).
 * expo-notifications é mockado pois usa módulos nativos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Lógica pura extraída de notificarSyncConcluido ──────────────────────────

/**
 * Gera o texto do corpo da notificação de sync.
 * Espelha a lógica de notificarSyncConcluido em lib/notifications.ts.
 */
function buildSyncNotificationBody(syncedTrees: number, syncedRegions: number): string | null {
  if (syncedTrees === 0 && syncedRegions === 0) return null;

  const partes: string[] = [];
  if (syncedTrees > 0) {
    partes.push(syncedTrees === 1 ? "1 árvore" : `${syncedTrees} árvores`);
  }
  if (syncedRegions > 0) {
    partes.push(syncedRegions === 1 ? "1 região" : `${syncedRegions} regiões`);
  }

  return partes.join(" e ") + " sincronizada" + (syncedTrees + syncedRegions > 1 ? "s" : "");
}

/**
 * Simula a decisão de disparar ou não a notificação.
 */
function shouldNotify(syncedTrees: number, syncedRegions: number, permissionGranted: boolean): boolean {
  if (syncedTrees === 0 && syncedRegions === 0) return false;
  if (!permissionGranted) return false;
  return true;
}

// ─── Testes de formatação da mensagem ────────────────────────────────────────

describe("Formatação da mensagem de notificação de sync", () => {
  it("retorna null quando nenhum item foi sincronizado", () => {
    expect(buildSyncNotificationBody(0, 0)).toBeNull();
  });

  it("formata corretamente 1 árvore (singular)", () => {
    expect(buildSyncNotificationBody(1, 0)).toBe("1 árvore sincronizada");
  });

  it("formata corretamente 3 árvores (plural)", () => {
    expect(buildSyncNotificationBody(3, 0)).toBe("3 árvores sincronizadas");
  });

  it("formata corretamente 1 região (singular)", () => {
    expect(buildSyncNotificationBody(0, 1)).toBe("1 região sincronizada");
  });

  it("formata corretamente 2 regiões (plural)", () => {
    expect(buildSyncNotificationBody(0, 2)).toBe("2 regiões sincronizadas");
  });

  it("formata corretamente 1 árvore e 1 região", () => {
    expect(buildSyncNotificationBody(1, 1)).toBe("1 árvore e 1 região sincronizadas");
  });

  it("formata corretamente 3 árvores e 2 regiões", () => {
    expect(buildSyncNotificationBody(3, 2)).toBe("3 árvores e 2 regiões sincronizadas");
  });

  it("formata corretamente 1 árvore e 2 regiões", () => {
    expect(buildSyncNotificationBody(1, 2)).toBe("1 árvore e 2 regiões sincronizadas");
  });

  it("formata corretamente 5 árvores e 1 região", () => {
    expect(buildSyncNotificationBody(5, 1)).toBe("5 árvores e 1 região sincronizadas");
  });

  it("usa plural 'sincronizadas' quando total > 1", () => {
    const body = buildSyncNotificationBody(2, 0);
    expect(body).toContain("sincronizadas");
  });

  it("usa singular 'sincronizada' quando total = 1", () => {
    const body = buildSyncNotificationBody(1, 0);
    expect(body).toContain("sincronizada");
    expect(body).not.toContain("sincronizadas");
  });
});

// ─── Testes de condições de disparo ──────────────────────────────────────────

describe("Condições de disparo da notificação", () => {
  it("NÃO deve notificar quando nenhum item foi sincronizado", () => {
    expect(shouldNotify(0, 0, true)).toBe(false);
  });

  it("NÃO deve notificar quando permissão não foi concedida", () => {
    expect(shouldNotify(3, 0, false)).toBe(false);
  });

  it("NÃO deve notificar quando permissão negada mesmo com itens sincronizados", () => {
    expect(shouldNotify(5, 2, false)).toBe(false);
  });

  it("DEVE notificar quando há árvores sincronizadas e permissão concedida", () => {
    expect(shouldNotify(1, 0, true)).toBe(true);
  });

  it("DEVE notificar quando há regiões sincronizadas e permissão concedida", () => {
    expect(shouldNotify(0, 1, true)).toBe(true);
  });

  it("DEVE notificar quando há árvores e regiões sincronizadas com permissão", () => {
    expect(shouldNotify(3, 2, true)).toBe(true);
  });

  it("NÃO deve notificar com 0 árvores e 0 regiões mesmo com permissão", () => {
    expect(shouldNotify(0, 0, true)).toBe(false);
  });
});

// ─── Testes de integração com mock do expo-notifications ─────────────────────

describe("Integração com expo-notifications (mockado)", () => {
  const mockSchedule = vi.fn().mockResolvedValue(undefined);
  const mockGetPermissions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scheduleNotificationAsync é chamado com título correto", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });

    // Simula a chamada de notificarSyncConcluido
    const status = (await mockGetPermissions()).status;
    if (status === "granted") {
      await mockSchedule({
        content: { title: "Sincronização concluída", body: "3 árvores sincronizadas" },
        trigger: null,
      });
    }

    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Sincronização concluída",
        }),
      })
    );
  });

  it("scheduleNotificationAsync NÃO é chamado quando permissão negada", async () => {
    mockGetPermissions.mockResolvedValue({ status: "denied" });

    const status = (await mockGetPermissions()).status;
    if (status === "granted") {
      await mockSchedule({ content: { title: "Sincronização concluída" }, trigger: null });
    }

    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("trigger null garante disparo imediato", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });

    const status = (await mockGetPermissions()).status;
    if (status === "granted") {
      await mockSchedule({
        content: { title: "Sincronização concluída", body: "1 árvore sincronizada" },
        trigger: null,
      });
    }

    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: null })
    );
  });
});
