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
  /** Valor normalizado do IRQ (0-100), ex: 42 */
  irqNormalizado: number;
  /** Classificação textual do risco, ex: "Risco Baixo" */
  irqClassificacao: string;
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

  // Inferior esquerdo: nome científico + IRQ
  const textoEsquerdo = `${dados.nomeCientifico}\nIRQ: ${dados.irqNormalizado}% \u2014 ${dados.irqClassificacao}`;

  // Inferior direito: data/hora + coordenadas GPS
  const textoDireito = `${dataFormatada}\n${coordenadas}`;

  const resultado = await Marker.markText({
    backgroundImage: {
      // Para URIs locais do dispositivo, passar como objeto { uri } (ImageSource)
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
          fontSize: 14,
          fontName: "Arial",
          bold: false,
          textBackgroundStyle: {
            paddingX: "3%",
            paddingY: "5%",
            type: TextBackgroundType.stretchX,
            color: "rgba(0,0,0,0.55)",
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
          fontSize: 14,
          fontName: "Arial",
          bold: false,
          textAlign: "right",
          textBackgroundStyle: {
            paddingX: "3%",
            paddingY: "5%",
            type: TextBackgroundType.stretchX,
            color: "rgba(0,0,0,0.55)",
          },
        },
      },
    ],
    quality: 90,
    saveFormat: ImageFormat.jpg,
  });

  return resultado;
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
