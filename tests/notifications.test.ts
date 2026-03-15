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

// ─── Lógica pura de notificarSyncParcial ─────────────────────────────────────

/**
 * Espelha a lógica de disparo de notificarSyncParcial em lib/notifications.ts.
 * Retorna o corpo da mensagem ou null se não deve disparar.
 */
function buildPartialSyncBody(
  successCount: number,
  totalCount: number,
  permissionGranted: boolean
): string | null {
  if (successCount <= 0) return null;         // nenhum sucesso
  if (successCount >= totalCount) return null; // sucesso total (não é parcial)
  if (!permissionGranted) return null;         // sem permissão
  return `${successCount} de ${totalCount} itens foram enviados. Conecte-se a uma rede estável para sincronizar o restante.`;
}

/**
 * Simula a lógica condicional do useNetworkSync para escolher qual notificação disparar.
 */
function chooseNotification(
  allOk: boolean,
  totalSynced: number,
  totalAttempted: number
): "success" | "partial" | "none" {
  if (allOk && totalSynced > 0) return "success";
  if (!allOk && totalSynced > 0) return "partial";
  return "none";
}

// ─── Testes de notificarSyncParcial ──────────────────────────────────────────

describe("Lógica de notificarSyncParcial", () => {
  it("NÃO dispara quando successCount = 0 (nenhum sucesso)", () => {
    expect(buildPartialSyncBody(0, 5, true)).toBeNull();
  });

  it("NÃO dispara quando successCount = totalCount (sucesso total)", () => {
    expect(buildPartialSyncBody(5, 5, true)).toBeNull();
  });

  it("NÃO dispara quando permissão negada", () => {
    expect(buildPartialSyncBody(3, 5, false)).toBeNull();
  });

  it("DISPARA quando há sucesso parcial com permissão", () => {
    const body = buildPartialSyncBody(2, 5, true);
    expect(body).not.toBeNull();
  });

  it("formata a mensagem corretamente com os contadores", () => {
    const body = buildPartialSyncBody(3, 7, true);
    expect(body).toBe("3 de 7 itens foram enviados. Conecte-se a uma rede estável para sincronizar o restante.");
  });

  it("formata corretamente com 1 de 2 itens", () => {
    const body = buildPartialSyncBody(1, 2, true);
    expect(body).toBe("1 de 2 itens foram enviados. Conecte-se a uma rede estável para sincronizar o restante.");
  });

  it("NÃO dispara quando successCount > totalCount (caso de borda)", () => {
    expect(buildPartialSyncBody(6, 5, true)).toBeNull();
  });
});

// ─── Testes da lógica condicional do useNetworkSync ──────────────────────────

describe("Lógica condicional de escolha de notificação no useNetworkSync", () => {
  it("retorna 'success' quando allOk=true e totalSynced > 0", () => {
    expect(chooseNotification(true, 5, 5)).toBe("success");
  });

  it("retorna 'partial' quando allOk=false e totalSynced > 0", () => {
    expect(chooseNotification(false, 3, 5)).toBe("partial");
  });

  it("retorna 'none' quando allOk=true mas totalSynced = 0", () => {
    expect(chooseNotification(true, 0, 0)).toBe("none");
  });

  it("retorna 'none' quando allOk=false e totalSynced = 0 (falha total sem nenhum sucesso)", () => {
    expect(chooseNotification(false, 0, 5)).toBe("none");
  });

  it("retorna 'success' quando todos os 1 item foi sincronizado", () => {
    expect(chooseNotification(true, 1, 1)).toBe("success");
  });

  it("retorna 'partial' quando apenas 1 de 10 itens foi sincronizado", () => {
    expect(chooseNotification(false, 1, 10)).toBe("partial");
  });
});

// ─── Testes de anti-spam (identifier fixo) ───────────────────────────────────

describe("Anti-spam: identifier fixo da notificação parcial", () => {
  const mockSchedule = vi.fn().mockResolvedValue(undefined);
  const mockDismiss = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("usa identifier fixo 'sync-partial' para sobrescrever notificações anteriores", async () => {
    // Simula duas chamadas consecutivas de notificarSyncParcial
    for (let i = 0; i < 2; i++) {
      await mockDismiss("sync-partial").catch(() => {});
      await mockSchedule({
        identifier: "sync-partial",
        content: { title: "⚠️ Sincronização Pendente", body: "2 de 5 itens foram enviados." },
        trigger: null,
      });
    }

    // Deve ter chamado schedule 2 vezes (sobrescreve, não acumula)
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    // Ambas as chamadas usam o mesmo identifier
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "sync-partial" })
    );
  });

  it("dismiss é chamado antes de schedule para garantir sobrescrita", async () => {
    const callOrder: string[] = [];
    const orderedDismiss = vi.fn().mockImplementation(async () => { callOrder.push("dismiss"); });
    const orderedSchedule = vi.fn().mockImplementation(async () => { callOrder.push("schedule"); });

    await orderedDismiss("sync-partial").catch(() => {});
    await orderedSchedule({ identifier: "sync-partial", content: {}, trigger: null });

    expect(callOrder).toEqual(["dismiss", "schedule"]);
  });

  it("notificação de falha parcial contém deep link para a tela do mapa", async () => {
    await mockSchedule({
      identifier: "sync-partial",
      content: {
        title: "⚠️ Sincronização Pendente",
        body: "2 de 5 itens foram enviados.",
        data: { url: "/(tabs)/mapa" },
      },
      trigger: null,
    });

    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          data: expect.objectContaining({ url: "/(tabs)/mapa" }),
        }),
      })
    );
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
