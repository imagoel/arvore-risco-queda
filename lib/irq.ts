// ─── Shared IRQ types and helpers ────────────────────────────────────────────
// Used by both the calculator screen and the map screen

export interface RiskResult {
  index: number;
  label: "Baixo" | "Moderado" | "Alto" | "Muito Alto";
  color: string;
  bgColor: string;
  borderColor: string;
  pinColor: string; // Color for map marker pin
}

export function classifyRisk(irq: number): RiskResult {
  if (irq < 0) {
    return {
      index: irq,
      label: "Baixo",
      color: "#166534",
      bgColor: "#DCFCE7",
      borderColor: "#16A34A",
      pinColor: "#16A34A",
    };
  } else if (irq <= 5000) {
    return {
      index: irq,
      label: "Moderado",
      color: "#854D0E",
      bgColor: "#FEF9C3",
      borderColor: "#CA8A04",
      pinColor: "#CA8A04",
    };
  } else if (irq <= 15000) {
    return {
      index: irq,
      label: "Alto",
      color: "#9A3412",
      bgColor: "#FFEDD5",
      borderColor: "#EA580C",
      pinColor: "#EA580C",
    };
  } else {
    return {
      index: irq,
      label: "Muito Alto",
      color: "#991B1B",
      bgColor: "#FEE2E2",
      borderColor: "#DC2626",
      pinColor: "#DC2626",
    };
  }
}

export function formatIRQ(irq: number): string {
  return irq.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
