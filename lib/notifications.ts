/**
 * Utiliário de notificações locais para o app Risco de Queda de Árvore.
 *
 * Responsabilidades:
 * - Configurar o handler de foreground (notificações aparecem mesmo com app aberto)
 * - Criar o canal Android "sync" com importância LOW (discreta, sem som)
 * - Criar o canal Android "sync-alert" com importância DEFAULT (alerta de falha parcial)
 * - Solicitar permissão de forma não-intrusiva (sem alert em caso de negação)
 * - Disparar notificação local após sync bem-sucedido
 * - Disparar notificação de alerta com identifier fixo (anti-spam) em falha parcial
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/** ID do canal Android para notificações de sincronização bem-sucedida (LOW — discreta) */
const SYNC_CHANNEL_ID = "sync";

/** ID do canal Android para alertas de falha parcial (DEFAULT — com som) */
const SYNC_ALERT_CHANNEL_ID = "sync-alert";

/**
 * Identifier fixo para a notificação de falha parcial.
 * Usar o mesmo identifier faz com que a notificação anterior seja sobrescrita,
 * evitando acumulo de alertas quando o sync roda múltiplas vezes em background.
 */
const PARTIAL_SYNC_NOTIFICATION_ID = "sync-partial";

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

  // Canal discreto para sync bem-sucedido (sem som, sem vibração)
  await Notifications.setNotificationChannelAsync(SYNC_CHANNEL_ID, {
    name: "Sincronização",
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: undefined,
    enableVibrate: false,
    sound: null,
    showBadge: false,
  });

  // Canal de alerta para falha parcial (DEFAULT = aparece com som padrão do sistema)
  await Notifications.setNotificationChannelAsync(SYNC_ALERT_CHANNEL_ID, {
    name: "Alertas de Sincronização",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250],   // vibração curta para chamar atenção
    enableVibrate: true,
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
        // @ts-ignore — channelId é aceito mas não tipado no content
        channelId: SYNC_CHANNEL_ID,
      }),
    });
  } catch (err) {
    // Falha silenciosa — não interrompe o fluxo de sync
    console.warn("[Notifications] Falha ao disparar notificação de sync:", err);
  }
}

/**
 * Dispara uma notificação de alerta para falha parcial de sincronização.
 *
 * Usa um identifier fixo ("sync-partial") para que execuções repetidas em background
 * sobrescrevam a notificação anterior em vez de acumular múltiplos alertas.
 *
 * O toque na notificação abre a tela do mapa (via deep link) onde o usuário
 * pode visualizar os itens ainda pendentes e o badge de status.
 *
 * @param successCount Número de itens sincronizados com sucesso
 * @param totalCount   Número total de itens que tentaram ser sincronizados
 */
export async function notificarSyncParcial(
  successCount: number,
  totalCount: number
): Promise<void> {
  // Só dispara se houve pelo menos um sucesso E pelo menos uma falha
  if (successCount <= 0 || successCount >= totalCount) return;

  // Verificar permissão antes de disparar
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const body = `${successCount} de ${totalCount} itens foram enviados. Conecte-se a uma rede estável para sincronizar o restante.`;

  try {
    // Cancelar notificação anterior com o mesmo identifier antes de criar a nova.
    // Isso garante anti-spam mesmo em plataformas que não suportam sobrescrita nativa.
    await Notifications.dismissNotificationAsync(PARTIAL_SYNC_NOTIFICATION_ID).catch(() => {});

    await Notifications.scheduleNotificationAsync({
      identifier: PARTIAL_SYNC_NOTIFICATION_ID,
      content: {
        title: "⚠️ Sincronização Pendente",
        body,
        // Deep link para a tela do mapa onde o usuário vê os pendentes
        data: { url: "/(tabs)/mapa" },
      },
      trigger: null, // disparo imediato
      ...(Platform.OS === "android" && {
        // @ts-ignore — channelId é aceito mas não tipado no content
        channelId: SYNC_ALERT_CHANNEL_ID,
      }),
    });
  } catch (err) {
    // Falha silenciosa — não interrompe o fluxo de sync
    console.warn("[Notifications] Falha ao disparar notificação de falha parcial:", err);
  }
}
