/**
 * Utilitário de notificações locais para o app Risco de Queda de Árvore.
 *
 * Responsabilidades:
 * - Configurar o handler de foreground (notificações aparecem mesmo com app aberto)
 * - Criar o canal Android "sync" com importância LOW (discreta, sem som)
 * - Solicitar permissão de forma não-intrusiva (sem alert em caso de negação)
 * - Disparar notificação local após sync bem-sucedido
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/** ID do canal Android para notificações de sincronização */
const SYNC_CHANNEL_ID = "sync";

/**
 * Configura o handler global de notificações.
 * Deve ser chamado uma vez, fora de qualquer componente (nível de módulo).
 * Garante que notificações apareçam mesmo com o app em foreground.
 */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,   // discreta — sem som
      shouldSetBadge: false,    // não altera badge do ícone
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Cria o canal Android "sync" com importância LOW.
 * Importância LOW = aparece na bandeja sem som nem vibração.
 * Deve ser chamado antes de qualquer scheduleNotificationAsync no Android.
 */
export async function setupAndroidSyncChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(SYNC_CHANNEL_ID, {
    name: "Sincronização",
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: undefined,  // sem vibração
    enableVibrate: false,
    sound: null,                  // sem som
    showBadge: false,
  });
}

/**
 * Solicita permissão de notificações ao usuário.
 * Retorna true se a permissão foi concedida, false caso contrário.
 * Não exibe alertas em caso de negação — falha silenciosa.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === "granted") return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/**
 * Dispara uma notificação local discreta informando o resultado do sync.
 *
 * @param syncedTrees  Número de árvores sincronizadas com sucesso
 * @param syncedRegions Número de regiões sincronizadas com sucesso
 *
 * Exemplos de mensagem:
 * - "3 árvores sincronizadas"
 * - "1 árvore e 2 regiões sincronizadas"
 * - "1 região sincronizada"
 */
export async function notificarSyncConcluido(
  syncedTrees: number,
  syncedRegions: number
): Promise<void> {
  if (syncedTrees === 0 && syncedRegions === 0) return;

  // Verificar permissão antes de disparar
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const partes: string[] = [];
  if (syncedTrees > 0) {
    partes.push(syncedTrees === 1 ? "1 árvore" : `${syncedTrees} árvores`);
  }
  if (syncedRegions > 0) {
    partes.push(syncedRegions === 1 ? "1 região" : `${syncedRegions} regiões`);
  }

  const body = partes.join(" e ") + " sincronizada" + (syncedTrees + syncedRegions > 1 ? "s" : "");

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Sincronização concluída",
        body,
        // Sem data extra — notificação puramente informativa
      },
      trigger: null, // disparo imediato
      ...(Platform.OS === "android" && {
        // Associa ao canal discreto no Android
        // @ts-ignore — channelId é aceito mas não tipado no content
        channelId: SYNC_CHANNEL_ID,
      }),
    });
  } catch (err) {
    // Falha silenciosa — não interrompe o fluxo de sync
    console.warn("[Notifications] Falha ao disparar notificação de sync:", err);
  }
}
