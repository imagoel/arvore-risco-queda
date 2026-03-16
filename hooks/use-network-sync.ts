/**
 * Hook de monitoramento de rede e sincronização automática.
 *
 * Usa `expo-network` para detectar quando a conexão é restaurada e
 * automaticamente sincroniza todos os itens pendentes no AsyncStorage.
 *
 * Itens são marcados como pendentes quando a sincronização falha (sem conexão).
 * Quando a conexão retorna, todos os pendentes são enviados ao backend.
 */
import { useEffect, useRef, useCallback } from "react";
import * as Network from "expo-network";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sincronizarArvore, sincronizarRegiao, type ArvoreLocal, type RegiaoLocal } from "@/lib/sync";
import type { IrqParametros } from "@/drizzle/schema";
import { notificarSyncConcluido, notificarSyncParcial } from "@/lib/notifications";

// Chaves de storage compartilhadas com mapa.native.tsx
const STORAGE_KEY = "@arvore_marcadores_v3";
const STORAGE_REGIONS_KEY = "@arvore_regioes_v1";

// Chave para rastrear IDs pendentes de sincronização
export const PENDING_TREES_KEY = "@sync_pending_trees";
export const PENDING_REGIONS_KEY = "@sync_pending_regions";

export type SyncStatus = "idle" | "syncing" | "ok" | "error" | "offline";

/**
 * Adiciona um ID de árvore à fila de pendentes.
 * Chamado quando a sincronização falha por falta de conexão.
 */
export async function marcarArvorePendente(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_TREES_KEY);
    const pending: string[] = raw ? JSON.parse(raw) : [];
    if (!pending.includes(id)) {
      pending.push(id);
      await AsyncStorage.setItem(PENDING_TREES_KEY, JSON.stringify(pending));
    }
  } catch {
    // Ignora erros de storage
  }
}

/**
 * Adiciona um ID de região à fila de pendentes.
 */
export async function marcarRegiaoPendente(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_REGIONS_KEY);
    const pending: string[] = raw ? JSON.parse(raw) : [];
    if (!pending.includes(id)) {
      pending.push(id);
      await AsyncStorage.setItem(PENDING_REGIONS_KEY, JSON.stringify(pending));
    }
  } catch {
    // Ignora erros de storage
  }
}

/**
 * Remove um ID da fila de pendentes de árvores (após sync bem-sucedido).
 */
export async function removerArvorePendente(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_TREES_KEY);
    const pending: string[] = raw ? JSON.parse(raw) : [];
    const updated = pending.filter((p) => p !== id);
    await AsyncStorage.setItem(PENDING_TREES_KEY, JSON.stringify(updated));
  } catch {
    // Ignora erros de storage
  }
}

/**
 * Remove um ID da fila de pendentes de regiões (após sync bem-sucedido).
 */
export async function removerRegiaoPendente(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_REGIONS_KEY);
    const pending: string[] = raw ? JSON.parse(raw) : [];
    const updated = pending.filter((p) => p !== id);
    await AsyncStorage.setItem(PENDING_REGIONS_KEY, JSON.stringify(updated));
  } catch {
    // Ignora erros de storage
  }
}

/**
 * Retorna o total de itens pendentes de sincronização.
 */
export async function contarPendentes(): Promise<number> {
  try {
    const [rawTrees, rawRegions] = await Promise.all([
      AsyncStorage.getItem(PENDING_TREES_KEY),
      AsyncStorage.getItem(PENDING_REGIONS_KEY),
    ]);
    const trees: string[] = rawTrees ? JSON.parse(rawTrees) : [];
    const regions: string[] = rawRegions ? JSON.parse(rawRegions) : [];
    return trees.length + regions.length;
  } catch {
    return 0;
  }
}

interface UseNetworkSyncOptions {
  /** Callback chamado quando o status de sync muda */
  onStatusChange?: (status: SyncStatus) => void;
  /** Callback chamado quando o número de pendentes muda */
  onPendingCountChange?: (count: number) => void;
}

/**
 * Hook principal de monitoramento de rede e sincronização automática.
 *
 * - Monitora mudanças de estado de rede via `addNetworkStateListener`
 * - Quando a conexão é restaurada (offline → online), sincroniza todos os pendentes
 * - Expõe `syncPending()` para trigger manual
 */
export function useNetworkSync({ onStatusChange, onPendingCountChange }: UseNetworkSyncOptions = {}) {
  // Rastreia se estava offline antes (para detectar transição offline→online)
  const wasOfflineRef = useRef<boolean>(false);
  // Evita múltiplas sincronizações simultâneas
  const isSyncingRef = useRef<boolean>(false);

  const notifyStatus = useCallback(
    (status: SyncStatus) => {
      onStatusChange?.(status);
    },
    [onStatusChange]
  );

  const notifyPending = useCallback(
    async () => {
      const count = await contarPendentes();
      onPendingCountChange?.(count);
    },
    [onPendingCountChange]
  );

  /**
   * Sincroniza todos os itens pendentes no AsyncStorage.
   * Lê as filas de pendentes, busca os dados completos e envia ao backend.
   */
  const syncPending = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      // Verificar se há pendentes
      const [rawPendingTrees, rawPendingRegions] = await Promise.all([
        AsyncStorage.getItem(PENDING_TREES_KEY),
        AsyncStorage.getItem(PENDING_REGIONS_KEY),
      ]);

      const pendingTreeIds: string[] = rawPendingTrees ? JSON.parse(rawPendingTrees) : [];
      const pendingRegionIds: string[] = rawPendingRegions ? JSON.parse(rawPendingRegions) : [];

      if (pendingTreeIds.length === 0 && pendingRegionIds.length === 0) {
        isSyncingRef.current = false;
        return;
      }

      notifyStatus("syncing");

      // Buscar dados completos das árvores e regiões
      const [rawTrees, rawRegions] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(STORAGE_REGIONS_KEY),
      ]);

      const allTrees: ArvoreLocal[] = rawTrees
        ? (JSON.parse(rawTrees) as Array<{
            id: string;
            nomeCientifico?: string;
            descricao?: string;
            fotoUri?: string | null;
            latitude: number;
            longitude: number;
            irq?: number | null;
            riskLabel?: string | null;
            riskColor?: string | null;
            irqParametros?: IrqParametros;
          }>).map((m) => ({
            id: m.id,
            nomeCientifico: m.nomeCientifico,
            descricao: m.descricao,
            fotoUri: m.fotoUri ?? undefined,
            latitude: m.latitude,
            longitude: m.longitude,
            irqValor: m.irq ?? undefined,
            irqClassificacao: m.riskLabel ?? undefined,
            irqParametros: m.irqParametros,
            pinColor: m.riskColor ?? undefined,
          }))
        : [];

      const allRegions: RegiaoLocal[] = rawRegions
        ? (JSON.parse(rawRegions) as Array<{
            id: string;
            titulo: string;
            descricao?: string;
            fotoUri?: string | null;
            coordinates: Array<{ latitude: number; longitude: number }>;
          }>).map((r) => ({
            id: r.id,
            titulo: r.titulo,
            descricao: r.descricao,
            fotoUri: r.fotoUri ?? undefined,
            coordenadas: r.coordinates,
          }))
        : [];

      let allOk = true;
      let syncedTrees = 0;
      let syncedRegions = 0;

      // Sincronizar árvores pendentes
      for (const treeId of pendingTreeIds) {
        const tree = allTrees.find((t) => t.id === treeId);
        if (!tree) {
          // Item deletado localmente — remover da fila
          await removerArvorePendente(treeId);
          continue;
        }
        const ok = await sincronizarArvore(tree);
        if (ok) {
          await removerArvorePendente(treeId);
          syncedTrees++;
        } else {
          allOk = false;
        }
      }

      // Sincronizar regiões pendentes
      for (const regionId of pendingRegionIds) {
        const region = allRegions.find((r) => r.id === regionId);
        if (!region) {
          // Item deletado localmente — remover da fila
          await removerRegiaoPendente(regionId);
          continue;
        }
        const ok = await sincronizarRegiao(region);
        if (ok) {
          await removerRegiaoPendente(regionId);
          syncedRegions++;
        } else {
          allOk = false;
        }
      }

      const totalSynced = syncedTrees + syncedRegions;
      const totalAttempted = pendingTreeIds.length + pendingRegionIds.length;

      if (allOk && totalSynced > 0) {
        // Sucesso total: notificação discreta de confirmação
        await notificarSyncConcluido(syncedTrees, syncedRegions);
      } else if (!allOk && totalSynced > 0) {
        // Falha parcial: alerta com identifier fixo (anti-spam) e deep link para o mapa
        await notificarSyncParcial(totalSynced, totalAttempted);
      }

      notifyStatus(allOk ? "ok" : "error");
      await notifyPending();
    } catch (err) {
      console.warn("[NetworkSync] Erro ao sincronizar pendentes:", err);
      notifyStatus("error");
    } finally {
      isSyncingRef.current = false;
    }
  }, [notifyStatus, notifyPending]);

  // Verificar estado inicial e configurar listener
  useEffect(() => {
    let subscription: ReturnType<typeof Network.addNetworkStateListener> | null = null;

    const initialize = async () => {
      // Verificar estado inicial da rede
      try {
        const state = await Network.getNetworkStateAsync();
        const isOnline = !!(state.isConnected && state.isInternetReachable !== false);
        wasOfflineRef.current = !isOnline;

        if (!isOnline) {
          notifyStatus("offline");
        }

        await notifyPending();
      } catch {
        // Se falhar ao checar, assume online
        wasOfflineRef.current = false;
      }

      // Registrar listener para mudanças de rede
      subscription = Network.addNetworkStateListener((state) => {
        const isOnline = !!(state.isConnected && state.isInternetReachable !== false);

        if (isOnline && wasOfflineRef.current) {
          // Transição offline → online: sincronizar pendentes
          wasOfflineRef.current = false;
          syncPending();
        } else if (!isOnline) {
          wasOfflineRef.current = true;
          notifyStatus("offline");
        }
      });
    };

    initialize();

    return () => {
      subscription?.remove();
    };
  }, [syncPending, notifyStatus, notifyPending]);

  return { syncPending };
}
