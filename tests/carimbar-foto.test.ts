/**
 * tests/carimbar-foto.test.ts
 *
 * Testes unitários para lib/carimbar-foto.ts.
 *
 * Nota: carimbarFoto() chama Marker.markText() do react-native-image-marker,
 * que é uma biblioteca nativa e não pode ser executada no ambiente Node.js/Vitest.
 * Por isso, mockamos o módulo inteiro e testamos:
 *   1. formatarDataBR — lógica pura, sem dependência nativa
 *   2. carimbarFoto — contrato: chama markText com os parâmetros corretos,
 *      retorna a URI da foto carimbada, e faz fallback em caso de erro
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock do react-native-image-marker ────────────────────────────────────────
// Deve ser declarado antes do import de carimbar-foto para que o vi.mock
// seja hoisted pelo Vitest e intercepte o require do módulo.
vi.mock("react-native-image-marker", () => {
  const markText = vi.fn().mockResolvedValue("file:///carimbada.jpg");
  return {
    default: { markText },
    Position: {
      topLeft: "topLeft",
      topCenter: "topCenter",
      topRight: "topRight",
      bottomLeft: "bottomLeft",
      bottomCenter: "bottomCenter",
      bottomRight: "bottomRight",
      center: "center",
    },
    TextBackgroundType: {
      stretchX: "stretchX",
      stretchY: "stretchY",
      none: "fit",
    },
    ImageFormat: {
      png: "png",
      jpg: "jpg",
      base64: "base64",
    },
  };
});

import { carimbarFoto, formatarDataBR, type DadosCarimbo } from "../lib/carimbar-foto";
import Marker from "react-native-image-marker";

// ── Helpers ──────────────────────────────────────────────────────────────────
const dadosPadrao: DadosCarimbo = {
  nomeCientifico: "Ficus benjamina",
  irqNormalizado: 42,
  irqClassificacao: "Risco Baixo",
  latitude: -13.0583,
  longitude: -39.6025,
};

// ── formatarDataBR ────────────────────────────────────────────────────────────
describe("formatarDataBR", () => {
  it("formata data no padrão DD/MM/AAAA HH:MM", () => {
    const data = new Date(2026, 2, 16, 15, 30); // 16/03/2026 15:30
    expect(formatarDataBR(data)).toBe("16/03/2026 15:30");
  });

  it("adiciona zero à esquerda em dia e mês de um dígito", () => {
    const data = new Date(2026, 0, 5, 9, 7); // 05/01/2026 09:07
    expect(formatarDataBR(data)).toBe("05/01/2026 09:07");
  });

  it("formata meia-noite corretamente", () => {
    const data = new Date(2026, 11, 31, 0, 0); // 31/12/2026 00:00
    expect(formatarDataBR(data)).toBe("31/12/2026 00:00");
  });

  it("formata horário de fim de dia corretamente", () => {
    const data = new Date(2026, 5, 1, 23, 59); // 01/06/2026 23:59
    expect(formatarDataBR(data)).toBe("01/06/2026 23:59");
  });
});

// ── carimbarFoto ─────────────────────────────────────────────────────────────
describe("carimbarFoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Marker.markText as ReturnType<typeof vi.fn>).mockResolvedValue("file:///carimbada.jpg");
  });

  it("retorna a URI da foto carimbada", async () => {
    const resultado = await carimbarFoto("file:///original.jpg", dadosPadrao);
    expect(resultado).toBe("file:///carimbada.jpg");
  });

  it("chama Marker.markText exatamente uma vez", async () => {
    await carimbarFoto("file:///original.jpg", dadosPadrao);
    expect(Marker.markText).toHaveBeenCalledTimes(1);
  });

  it("passa a URI original como backgroundImage.src com objeto { uri }", async () => {
    await carimbarFoto("file:///original.jpg", dadosPadrao);
    const opcoes = (Marker.markText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opcoes.backgroundImage.src).toEqual({ uri: "file:///original.jpg" });
  });

  it("inclui o nome científico no texto do carimbo esquerdo", async () => {
    await carimbarFoto("file:///original.jpg", dadosPadrao);
    const opcoes = (Marker.markText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const textoEsquerdo = opcoes.watermarkTexts[0].text as string;
    expect(textoEsquerdo).toContain("Ficus benjamina");
  });

  it("inclui o IRQ normalizado no texto do carimbo esquerdo", async () => {
    await carimbarFoto("file:///original.jpg", dadosPadrao);
    const opcoes = (Marker.markText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const textoEsquerdo = opcoes.watermarkTexts[0].text as string;
    expect(textoEsquerdo).toContain("42%");
  });

  it("inclui a classificação de risco no texto do carimbo esquerdo", async () => {
    await carimbarFoto("file:///original.jpg", dadosPadrao);
    const opcoes = (Marker.markText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const textoEsquerdo = opcoes.watermarkTexts[0].text as string;
    expect(textoEsquerdo).toContain("Risco Baixo");
  });

  it("inclui as coordenadas no texto do carimbo direito", async () => {
    await carimbarFoto("file:///original.jpg", dadosPadrao);
    const opcoes = (Marker.markText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const textoDireito = opcoes.watermarkTexts[1].text as string;
    expect(textoDireito).toContain("-13.0583");
    expect(textoDireito).toContain("-39.6025");
  });

  it("inclui a data no texto do carimbo direito", async () => {
    await carimbarFoto("file:///original.jpg", dadosPadrao);
    const opcoes = (Marker.markText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const textoDireito = opcoes.watermarkTexts[1].text as string;
    // Verifica formato DD/MM/AAAA HH:MM (ano atual)
    expect(textoDireito).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  });

  it("usa saveFormat jpg e quality 90", async () => {
    await carimbarFoto("file:///original.jpg", dadosPadrao);
    const opcoes = (Marker.markText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opcoes.saveFormat).toBe("jpg");
    expect(opcoes.quality).toBe(90);
  });

  it("posiciona carimbo esquerdo em bottomLeft", async () => {
    await carimbarFoto("file:///original.jpg", dadosPadrao);
    const opcoes = (Marker.markText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opcoes.watermarkTexts[0].position.position).toBe("bottomLeft");
  });

  it("posiciona carimbo direito em bottomRight", async () => {
    await carimbarFoto("file:///original.jpg", dadosPadrao);
    const opcoes = (Marker.markText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opcoes.watermarkTexts[1].position.position).toBe("bottomRight");
  });

  it("propaga o erro quando Marker.markText rejeita", async () => {
    (Marker.markText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Nativo falhou"));
    await expect(carimbarFoto("file:///original.jpg", dadosPadrao)).rejects.toThrow("Nativo falhou");
  });

  it("funciona com coordenadas positivas (hemisfério norte)", async () => {
    const dadosNorte: DadosCarimbo = { ...dadosPadrao, latitude: 48.8566, longitude: 2.3522 };
    await carimbarFoto("file:///original.jpg", dadosNorte);
    const opcoes = (Marker.markText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const textoDireito = opcoes.watermarkTexts[1].text as string;
    expect(textoDireito).toContain("48.8566");
    expect(textoDireito).toContain("2.3522");
  });

  it("formata coordenadas com 4 casas decimais", async () => {
    const dados: DadosCarimbo = { ...dadosPadrao, latitude: -13.123456789, longitude: -39.987654321 };
    await carimbarFoto("file:///original.jpg", dados);
    const opcoes = (Marker.markText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const textoDireito = opcoes.watermarkTexts[1].text as string;
    expect(textoDireito).toContain("-13.1235"); // arredondado para 4 casas
    expect(textoDireito).toContain("-39.9877");
  });
});
