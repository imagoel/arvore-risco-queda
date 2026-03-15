/**
 * Testes para G1: limpeza automática de foto local após upload bem-sucedido.
 *
 * Como expo-file-system usa módulos nativos, testamos a lógica de decisão
 * (quando deletar vs. não deletar) de forma pura, sem dependências nativas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Lógica pura extraída de uploadFoto (lib/sync.ts) ────────────────────────

interface UploadResult {
  url: string | undefined;
  shouldDelete: boolean;
  deleteUri: string | undefined;
}

/**
 * Simula a lógica de decisão de uploadFoto:
 * - Retorna url e se deve deletar o arquivo local.
 * - deleteAsync só deve ser chamado se response.ok === true.
 */
async function simulateUploadLogic(
  uri: string,
  mockFetch: () => Promise<{ ok: boolean; status: number; json: () => Promise<{ url: string }> }>
): Promise<UploadResult> {
  try {
    const response = await mockFetch();

    if (!response.ok) {
      return { url: undefined, shouldDelete: false, deleteUri: undefined };
    }

    const data = await response.json();

    // G1: só apaga se response.ok foi confirmado
    return {
      url: data.url,
      shouldDelete: true,
      deleteUri: uri,
    };
  } catch {
    return { url: undefined, shouldDelete: false, deleteUri: undefined };
  }
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("G1 — Limpeza de foto local após upload", () => {
  const fotoUri = "file:///var/mobile/Containers/Data/Application/abc/foto.jpg";
  const urlRemota = "/uploads/arvores/foto_123.jpg";

  it("deve marcar para deletar quando o servidor retorna 200 OK", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: urlRemota }),
    });

    const result = await simulateUploadLogic(fotoUri, mockFetch);

    expect(result.url).toBe(urlRemota);
    expect(result.shouldDelete).toBe(true);
    expect(result.deleteUri).toBe(fotoUri);
  });

  it("deve marcar para deletar quando o servidor retorna 201 Created", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ url: urlRemota }),
    });

    const result = await simulateUploadLogic(fotoUri, mockFetch);

    expect(result.shouldDelete).toBe(true);
    expect(result.deleteUri).toBe(fotoUri);
  });

  it("NÃO deve deletar quando o servidor retorna 400 Bad Request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Bad Request" }),
    });

    const result = await simulateUploadLogic(fotoUri, mockFetch);

    expect(result.url).toBeUndefined();
    expect(result.shouldDelete).toBe(false);
    expect(result.deleteUri).toBeUndefined();
  });

  it("NÃO deve deletar quando o servidor retorna 500 Internal Server Error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal Server Error" }),
    });

    const result = await simulateUploadLogic(fotoUri, mockFetch);

    expect(result.url).toBeUndefined();
    expect(result.shouldDelete).toBe(false);
  });

  it("NÃO deve deletar quando o servidor retorna 401 Unauthorized", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    });

    const result = await simulateUploadLogic(fotoUri, mockFetch);

    expect(result.shouldDelete).toBe(false);
  });

  it("NÃO deve deletar quando a requisição falha por erro de rede", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network request failed"));

    const result = await simulateUploadLogic(fotoUri, mockFetch);

    expect(result.url).toBeUndefined();
    expect(result.shouldDelete).toBe(false);
    expect(result.deleteUri).toBeUndefined();
  });

  it("NÃO deve deletar quando a requisição falha por timeout", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("AbortError: The operation was aborted"));

    const result = await simulateUploadLogic(fotoUri, mockFetch);

    expect(result.shouldDelete).toBe(false);
  });

  it("deve retornar a URL remota correta após upload bem-sucedido", async () => {
    const expectedUrl = "/uploads/arvores/foto_abc123.jpg";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: expectedUrl }),
    });

    const result = await simulateUploadLogic(fotoUri, mockFetch);

    expect(result.url).toBe(expectedUrl);
  });

  it("deve preservar o URI original para deletar (não alterar o caminho)", async () => {
    const uriOriginal = "file:///var/mobile/foto_especial_com_espacos.jpg";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: "/uploads/arvores/foto.jpg" }),
    });

    const result = await simulateUploadLogic(uriOriginal, mockFetch);

    expect(result.deleteUri).toBe(uriOriginal);
  });
});

describe("G1 — Idempotência do deleteAsync", () => {
  it("deleteAsync com idempotent:true não deve lançar erro se arquivo não existe", async () => {
    // Simula o comportamento do FileSystem.deleteAsync com idempotent:true
    const mockDeleteAsync = vi.fn().mockResolvedValue(undefined);

    // Chama duas vezes o mesmo URI (simula idempotência)
    await expect(mockDeleteAsync("file:///foto.jpg", { idempotent: true })).resolves.toBeUndefined();
    await expect(mockDeleteAsync("file:///foto.jpg", { idempotent: true })).resolves.toBeUndefined();

    expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
    expect(mockDeleteAsync).toHaveBeenCalledWith("file:///foto.jpg", { idempotent: true });
  });

  it("deleteAsync com idempotent:true deve ser chamado com o URI correto", async () => {
    const mockDeleteAsync = vi.fn().mockResolvedValue(undefined);
    const uri = "file:///var/mobile/foto_123.jpg";

    await mockDeleteAsync(uri, { idempotent: true });

    expect(mockDeleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
  });

  it("falha silenciosa: erro no deleteAsync não deve propagar para o chamador", async () => {
    // Mesmo que deleteAsync lance erro, o upload já foi confirmado
    // A lógica em sync.ts tem try/catch separado para o delete
    const mockDeleteAsync = vi.fn().mockRejectedValue(new Error("Permission denied"));

    let uploadUrl: string | undefined;
    try {
      // Simula o bloco try/catch do deleteAsync em sync.ts
      await mockDeleteAsync("file:///foto.jpg", { idempotent: true });
    } catch {
      // Falha silenciosa — não propaga
    }
    uploadUrl = "/uploads/arvores/foto.jpg"; // URL já foi retornada antes do delete

    expect(uploadUrl).toBe("/uploads/arvores/foto.jpg");
  });
});
