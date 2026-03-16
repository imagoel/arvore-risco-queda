// ─── Shared IRQ types and helpers ────────────────────────────────────────────
// Used by both the calculator screen and the map screen

export interface IRQFormState {
  diametroCopa: string;
  alturaGeral: string;
  alturaRamificacao: string;
  dap: string;
  dcolo: string;
  anguloInclinacao: string;
  coloDiagnosticado: string;
  ramificacaoV: boolean;
  corpoFrutificacao: boolean;
}

export interface RiskResult {
  /** Valor bruto do IRQ (sem normalização) */
  index: number;
  /** Valor normalizado 0–100 */
  normalized: number;
  /** Classificação textual */
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  /** Cor do pino no mapa */
  pinColor: string;
}

export function parseNum(val: string): number {
  const n = parseFloat(val.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/**
 * Calcula o Índice de Risco de Queda (IRQ) bruto.
 *
 * IRQ = (VolumeCopa × FatorDAP)
 *       + (ColoDiagnosticado × 800)
 *       + (RamificaçãoEmV    × 800)   ← sinal positivo: aumenta risco
 *       + (CorpoFrutificação × 800)   ← sinal positivo: aumenta risco
 */
export function calcularRisco(form: IRQFormState): number {
  const dc = parseNum(form.diametroCopa);
  const ag = parseNum(form.alturaGeral);
  const ar = parseNum(form.alturaRamificacao);
  const dap = parseNum(form.dap);
  const dcolo = parseNum(form.dcolo);
  const ang = parseNum(form.anguloInclinacao);
  const coloDiag = parseNum(form.coloDiagnosticado);
  const rv = form.ramificacaoV ? 1 : 0;
  const cf = form.corpoFrutificacao ? 1 : 0;

  const areaCopa = dc * dc * (Math.PI / 4);
  const volumeCopa = areaCopa * 0.5 * (ag - ar);
  const fatorDap = dcolo !== 0 ? (dap / dcolo) * ang * 1 : 0;

  return (
    volumeCopa * fatorDap +
    coloDiag * 800 +
    rv * 800 +
    cf * 800
  );
}

/**
 * Normaliza o IRQ bruto para uma escala 0–100.
 * Limitado em 100 para valores muito altos.
 */
export function normalizarIRQ(irq: number): number {
  return Math.min(Math.round((irq / 10000) * 100), 100);
}

/**
 * Classifica o risco com base no IRQ normalizado (0–100).
 *
 * Faixas:
 *   0–25   → Risco Muito Baixo   (#4FC3F7 azul claro)
 *  26–50   → Risco Baixo         (#66BB6A verde)
 *  51–75   → Alerta - Monitorar  (#FFA726 laranja)
 *  76–100  → Alerta - Supressão  (#EF5350 vermelho)
 */
export function classifyRisk(irq: number): RiskResult {
  const normalized = normalizarIRQ(irq);

  if (normalized <= 25) {
    return {
      index: irq,
      normalized,
      label: "Risco Muito Baixo",
      color: "#01579B",
      bgColor: "#E1F5FE",
      borderColor: "#4FC3F7",
      pinColor: "#4FC3F7",
    };
  } else if (normalized <= 50) {
    return {
      index: irq,
      normalized,
      label: "Risco Baixo",
      color: "#1B5E20",
      bgColor: "#E8F5E9",
      borderColor: "#66BB6A",
      pinColor: "#66BB6A",
    };
  } else if (normalized <= 75) {
    return {
      index: irq,
      normalized,
      label: "Alerta - Monitorar Árvore",
      color: "#E65100",
      bgColor: "#FFF3E0",
      borderColor: "#FFA726",
      pinColor: "#FFA726",
    };
  } else {
    return {
      index: irq,
      normalized,
      label: "Alerta - Supressão da Árvore",
      color: "#B71C1C",
      bgColor: "#FFEBEE",
      borderColor: "#EF5350",
      pinColor: "#EF5350",
    };
  }
}

export function formatIRQ(irq: number): string {
  return irq.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
