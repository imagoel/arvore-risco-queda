/**
 * carimbar-foto.ts
 *
 * Aplica carimbo de dados nos pixels da foto antes de salvar/enviar ao servidor.
 * Equivalente ao comportamento do app "Timestamp Camera Free".
 *
 * Layout do carimbo (inferior da foto):
 * ┌─────────────────────┬──────────────────────┐
 * │ Ficus benjamina     │  16/03/2026 15:30    │
 * │ IRQ: 42% — Risco    │  -13.0583,-39.6025   │
 * │ Baixo               │                      │
 * └─────────────────────┴──────────────────────┘
 *
 * Dependência nativa: react-native-image-marker (requer rebuild do APK)
 * Não funciona no emulador web — use Platform.OS !== 'web' antes de chamar.
 */

import Marker, { Position, TextBackgroundType, ImageFormat } from "react-native-image-marker";

export interface DadosCarimbo {
  /** Nome científico da árvore, ex: "Ficus benjamina" */
  nomeCientifico: string;
  /**
   * Valor normalizado do IRQ (0-100), ex: 42.
   * Opcional — quando ausente, o carimbo mostra apenas o nome (sem IRQ).
   */
  irqNormalizado?: number;
  /**
   * Classificação textual do risco, ex: "Risco Baixo".
   * Opcional — usado apenas quando irqNormalizado está presente.
   */
  irqClassificacao?: string;
  /** Latitude decimal, ex: -13.0583 */
  latitude: number;
  /** Longitude decimal, ex: -39.6025 */
  longitude: number;
}

/**
 * Aplica carimbo de dados nos pixels da foto.
 *
 * @param fotoUri - URI local da foto original (file:///...)
 * @param dados   - Dados da árvore para exibir no carimbo
 * @returns URI local da foto carimbada (file:///...)
 *
 * @throws Propaga erros do react-native-image-marker — tratar com try/catch
 *         e usar a foto original como fallback em caso de falha.
 */
export async function carimbarFoto(
  fotoUri: string,
  dados: DadosCarimbo,
): Promise<string> {
  const agora = new Date();
  const dataFormatada = formatarDataBR(agora);
  const coordenadas = `${dados.latitude.toFixed(4)},${dados.longitude.toFixed(4)}`;

  // Inferior esquerdo: nome científico + IRQ (quando disponível)
  // Se IRQ ainda não foi calculado, mostra apenas o nome da árvore.
  const textoEsquerdo = dados.irqNormalizado != null
    ? `${dados.nomeCientifico}\nIRQ: ${dados.irqNormalizado}% — ${dados.irqClassificacao ?? ""}`
    : dados.nomeCientifico;

  // Inferior direito: data/hora + coordenadas GPS
  const textoDireito = `${dataFormatada}\n${coordenadas}`;

  // Fonte grande para ser legível em relatórios e visualizadores (KMZ/QGIS).
  // Fotos de câmera têm ~3000-4000px de largura; fontSize 80 ≈ 2-2.7% da largura,
  // similar ao Timestamp Camera Free.
  const FONT_SIZE = 80;

  const resultado = await Marker.markText({
    backgroundImage: {
      src: { uri: fotoUri },
      scale: 1,
    },
    watermarkTexts: [
      {
        text: textoEsquerdo,
        position: {
          position: Position.bottomLeft,
        },
        style: {
          color: "#FFFFFF",
          fontSize: FONT_SIZE,
          fontName: "Arial",
          bold: true,
          shadowStyle: {
            dx: 2,
            dy: 2,
            radius: 4,
            color: "#000000",
          },
          textBackgroundStyle: {
            paddingX: "2%",
            paddingY: "2%",
            type: TextBackgroundType.stretchX,
            color: "rgba(0,0,0,0.6)",
          },
        },
      },
      {
        text: textoDireito,
        position: {
          position: Position.bottomRight,
        },
        style: {
          color: "#FFFFFF",
          fontSize: FONT_SIZE,
          fontName: "Arial",
          bold: true,
          textAlign: "right",
          shadowStyle: {
            dx: 2,
            dy: 2,
            radius: 4,
            color: "#000000",
          },
          textBackgroundStyle: {
            paddingX: "2%",
            paddingY: "2%",
            type: TextBackgroundType.stretchX,
            color: "rgba(0,0,0,0.6)",
          },
        },
      },
    ],
    quality: 92,
    saveFormat: ImageFormat.jpg,
  });

  // react-native-image-marker pode retornar o path sem o prefixo file://
  // (ex: /data/user/0/.../image.jpg). O <Image> do React Native requer file:///...
  const uriNormalizada = resultado.startsWith("file://")
    ? resultado
    : `file://${resultado}`;

  return uriNormalizada;
}

/**
 * Formata uma data no padrão brasileiro: DD/MM/AAAA HH:MM
 * Exportada para facilitar testes unitários.
 */
export function formatarDataBR(date: Date): string {
  const dia = String(date.getDate()).padStart(2, "0");
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const ano = date.getFullYear();
  const hora = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${hora}:${min}`;
}
