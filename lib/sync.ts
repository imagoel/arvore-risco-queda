/**
 * Serviço de sincronização entre o app mobile e o backend.
 * Envia árvores e regiões para o servidor via tRPC vanilla client.
 * Faz upload de fotos locais para /api/upload (multer) antes de sincronizar.
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import * as FileSystem from "expo-file-system/legacy";
import type { AppRouter } from "@/server/routers";
import type { IrqParametros } from "@/drizzle/schema";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

export interface ArvoreLocal {
  id: string;
  nomeCientifico?: string;
  descricao?: string;
  fotoUri?: string;
  latitude: number;
  longitude: number;
  irqValor?: number;
  irqClassificacao?: string;
  irqParametros?: IrqParametros;
  pinColor?: string;
}

export interface RegiaoLocal {
  id: string;
  titulo: string;
  descricao?: string;
  fotoUri?: string;
  coordenadas: Array<{ latitude: number; longitude: number }>;
}

/** Cria um vanilla tRPC client para uso fora de componentes React */
async function getVanillaClient() {
  const token = await Auth.getSessionToken();
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        transformer: superjson,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        },
      }),
    ],
  });
}

/**
 * Faz upload de uma foto local (URI file:// ou content://) para o servidor
 * via POST /api/upload usando multipart/form-data (multer).
 * Retorna o caminho relativo no servidor (/uploads/arvores/abc.jpg) ou undefined.
 */
async function uploadFoto(uri: string, pasta: "arvores" | "regioes"): Promise<string | undefined> {
  try {
    const baseUrl = getApiBaseUrl();
    const formData = new FormData();

    // React Native aceita { uri, name, type } como entrada do FormData
    const filename = uri.split("/").pop() || `foto_${Date.now()}.jpg`;
    const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";

    // @ts-ignore — React Native FormData aceita objeto com uri/name/type
    formData.append("foto", { uri, name: filename, type: mimeType });

    const response = await fetch(`${baseUrl}/api/upload?pasta=${pasta}`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      console.warn("[Sync] Upload falhou com status:", response.status);
      return undefined;
    }

    const data = await response.json() as { url: string };

    // G1: Apaga o arquivo local somente após confirmação absoluta de sucesso (response.ok).
    // idempotent:true evita crash caso o arquivo já tenha sido removido por outro processo.
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      console.log("[Sync] Foto local removida após upload bem-sucedido:", uri);
    } catch (deleteError) {
      // Falha silenciosa — o upload já foi confirmado; a limpeza é best-effort.
      console.warn("[Sync] Não foi possível remover foto local:", deleteError);
    }

    return data.url;
  } catch (error) {
    console.warn("[Sync] Falha no upload da foto:", error);
    return undefined;
  }
}

/**
 * Sincroniza uma árvore com o servidor.
 * Se a árvore tiver foto local (file:// ou content://), faz upload primeiro.
 */
export async function sincronizarArvore(arvore: ArvoreLocal): Promise<boolean> {
  try {
    let fotoUrl = arvore.fotoUri;

    if (fotoUrl && (fotoUrl.startsWith("file://") || fotoUrl.startsWith("content://"))) {
      const urlRemota = await uploadFoto(fotoUrl, "arvores");
      if (urlRemota) fotoUrl = urlRemota;
    }

    const client = await getVanillaClient();
    await client.arvores.sincronizar.mutate({
      localId: arvore.id,
      nomeCientifico: arvore.nomeCientifico,
      descricao: arvore.descricao,
      fotoUrl,
      latitude: arvore.latitude,
      longitude: arvore.longitude,
      irqValor: arvore.irqValor,
      irqClassificacao: arvore.irqClassificacao,
      irqParametros: arvore.irqParametros,
      pinColor: arvore.pinColor,
    });

    return true;
  } catch (error) {
    console.warn("[Sync] Falha ao sincronizar árvore:", error);
    return false;
  }
}

/**
 * Sincroniza uma região com o servidor.
 */
export async function sincronizarRegiao(regiao: RegiaoLocal): Promise<boolean> {
  try {
    let fotoUrl = regiao.fotoUri;

    if (fotoUrl && (fotoUrl.startsWith("file://") || fotoUrl.startsWith("content://"))) {
      const urlRemota = await uploadFoto(fotoUrl, "regioes");
      if (urlRemota) fotoUrl = urlRemota;
    }

    const centroLat = regiao.coordenadas.reduce((s, c) => s + c.latitude, 0) / regiao.coordenadas.length;
    const centroLng = regiao.coordenadas.reduce((s, c) => s + c.longitude, 0) / regiao.coordenadas.length;

    const client = await getVanillaClient();
    await client.regioes.sincronizar.mutate({
      localId: regiao.id,
      titulo: regiao.titulo,
      descricao: regiao.descricao,
      fotoUrl,
      coordenadas: regiao.coordenadas,
      centroLat,
      centroLng,
    });

    return true;
  } catch (error) {
    console.warn("[Sync] Falha ao sincronizar região:", error);
    return false;
  }
}

/**
 * Remove uma árvore do servidor.
 */
export async function deletarArvoreRemota(localId: string): Promise<boolean> {
  try {
    const client = await getVanillaClient();
    await client.arvores.deletar.mutate({ localId });
    return true;
  } catch (error) {
    console.warn("[Sync] Falha ao deletar árvore remota:", error);
    return false;
  }
}

/**
 * Remove uma região do servidor.
 */
export async function deletarRegiaoRemota(localId: string): Promise<boolean> {
  try {
    const client = await getVanillaClient();
    await client.regioes.deletar.mutate({ localId });
    return true;
  } catch (error) {
    console.warn("[Sync] Falha ao deletar região remota:", error);
    return false;
  }
}
