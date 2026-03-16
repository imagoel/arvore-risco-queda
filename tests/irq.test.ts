import { describe, it, expect } from "vitest";
import { calcularRisco, classifyRisk, normalizarIRQ, parseNum } from "../lib/irq";
import type { IRQFormState } from "../lib/irq";

// ─── Base form ────────────────────────────────────────────────────────────────

const baseForm: IRQFormState = {
  diametroCopa: "0",
  alturaGeral: "0",
  alturaRamificacao: "0",
  dap: "0",
  dcolo: "0",
  anguloInclinacao: "0",
  coloDiagnosticado: "0",
  ramificacaoV: false,
  corpoFrutificacao: false,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Cálculo do Índice de Risco de Queda (IRQ)", () => {
  it("retorna zero quando todos os campos são zero", () => {
    expect(calcularRisco(baseForm)).toBe(0);
  });

  it("aplica corretamente o fator de colo diagnóstico (soma)", () => {
    const form = { ...baseForm, coloDiagnosticado: "3" };
    // 3 × 800 = 2400
    expect(calcularRisco(form)).toBe(2400);
  });

  it("aumenta o IRQ quando Ramificação em V está marcada (sinal positivo)", () => {
    const formSem = { ...baseForm, coloDiagnosticado: "1" };
    const formCom = { ...formSem, ramificacaoV: true };
    expect(calcularRisco(formCom)).toBeGreaterThan(calcularRisco(formSem));
  });

  it("aumenta o IRQ quando Corpo de Frutificação está marcado (sinal positivo)", () => {
    const formSem = { ...baseForm, coloDiagnosticado: "1" };
    const formCom = { ...formSem, corpoFrutificacao: true };
    expect(calcularRisco(formCom)).toBeGreaterThan(calcularRisco(formSem));
  });

  it("Ramificação em V aumenta o IRQ em exatamente 800", () => {
    const formSem = { ...baseForm, coloDiagnosticado: "2" };
    const formCom = { ...formSem, ramificacaoV: true };
    // com rv: 1600 + 800 = 2400; sem rv: 1600 → diferença = 800
    expect(calcularRisco(formCom) - calcularRisco(formSem)).toBeCloseTo(800);
  });

  it("Corpo de Frutificação aumenta o IRQ em exatamente 800", () => {
    const formSem = { ...baseForm, coloDiagnosticado: "2" };
    const formCom = { ...formSem, corpoFrutificacao: true };
    // com cf: 1600 + 800 = 2400; sem cf: 1600 → diferença = 800
    expect(calcularRisco(formCom) - calcularRisco(formSem)).toBeCloseTo(800);
  });

  it("aceita valores com vírgula como separador decimal", () => {
    expect(parseNum("3,14")).toBeCloseTo(3.14);
    expect(parseNum("10,5")).toBeCloseTo(10.5);
  });

  it("retorna 0 para strings inválidas ou vazias", () => {
    expect(parseNum("")).toBe(0);
    expect(parseNum("abc")).toBe(0);
  });

  it("calcula corretamente com valores realistas de árvore", () => {
    const form: IRQFormState = {
      diametroCopa: "8",
      alturaGeral: "15",
      alturaRamificacao: "3",
      dap: "40",
      dcolo: "50",
      anguloInclinacao: "5",
      coloDiagnosticado: "0",
      ramificacaoV: false,
      corpoFrutificacao: false,
    };
    const irq = calcularRisco(form);
    expect(isFinite(irq)).toBe(true);
    expect(isNaN(irq)).toBe(false);
    expect(irq).toBeGreaterThan(0);
    // IRQ ≈ 1206 → normalizado ≈ 12 → Risco Muito Baixo
    expect(classifyRisk(irq).label).toBe("Risco Muito Baixo");
  });
});

describe("Normalização do IRQ (0–100)", () => {
  it("normaliza 0 para 0", () => {
    expect(normalizarIRQ(0)).toBe(0);
  });

  it("normaliza 10000 para 100", () => {
    expect(normalizarIRQ(10000)).toBe(100);
  });

  it("limita valores acima de 10000 em 100", () => {
    expect(normalizarIRQ(100000)).toBe(100);
    expect(normalizarIRQ(50000)).toBe(100);
  });

  it("normaliza 5000 para 50", () => {
    expect(normalizarIRQ(5000)).toBe(50);
  });

  it("normaliza valores negativos para ≤ 0", () => {
    expect(normalizarIRQ(-100)).toBeLessThanOrEqual(0);
  });
});

describe("Classificação de risco (novas faixas)", () => {
  it("classifica IRQ normalizado ≤ 25 como Risco Muito Baixo", () => {
    // IRQ bruto 0 → normalizado 0
    expect(classifyRisk(0).label).toBe("Risco Muito Baixo");
    // IRQ bruto 2500 → normalizado 25
    expect(classifyRisk(2500).label).toBe("Risco Muito Baixo");
  });

  it("classifica IRQ normalizado 26–50 como Risco Baixo", () => {
    // IRQ bruto 5000 → normalizado 50
    expect(classifyRisk(5000).label).toBe("Risco Baixo");
    // IRQ bruto 5001 → normalizado 50 (arredondado)
    expect(classifyRisk(5001).label).toBe("Risco Baixo");
  });

  it("classifica IRQ normalizado 51–75 como Alerta - Monitorar Árvore", () => {
    // IRQ bruto 7500 → normalizado 75
    expect(classifyRisk(7500).label).toBe("Alerta - Monitorar Árvore");
  });

  it("classifica IRQ normalizado > 75 como Alerta - Supressão da Árvore", () => {
    // IRQ bruto 10000 → normalizado 100
    expect(classifyRisk(10000).label).toBe("Alerta - Supressão da Árvore");
    expect(classifyRisk(100000).label).toBe("Alerta - Supressão da Árvore");
  });

  it("IRQ negativo classifica como Risco Muito Baixo", () => {
    expect(classifyRisk(-100).label).toBe("Risco Muito Baixo");
  });

  it("retorna pinColor correto para cada faixa", () => {
    expect(classifyRisk(0).pinColor).toBe("#4FC3F7");       // Risco Muito Baixo
    expect(classifyRisk(5000).pinColor).toBe("#66BB6A");    // Risco Baixo
    expect(classifyRisk(7500).pinColor).toBe("#FFA726");    // Alerta - Monitorar
    expect(classifyRisk(10000).pinColor).toBe("#EF5350");   // Alerta - Supressão
  });

  it("retorna normalized correto no RiskResult", () => {
    expect(classifyRisk(0).normalized).toBe(0);
    expect(classifyRisk(5000).normalized).toBe(50);
    expect(classifyRisk(10000).normalized).toBe(100);
  });
});
