import { describe, it, expect } from "vitest";

// ─── Replicating the calculation logic from the app ───────────────────────────

function parseNum(val: string): number {
  const n = parseFloat(val.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

interface FormState {
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

function calcularRisco(form: FormState): number {
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
    rv * -800 +
    cf * -800
  );
}

function classifyRisk(irq: number): string {
  if (irq < 0) return "Baixo";
  if (irq <= 5000) return "Moderado";
  if (irq <= 15000) return "Alto";
  return "Muito Alto";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const baseForm: FormState = {
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

describe("Cálculo do Índice de Risco de Queda (IRQ)", () => {
  it("retorna zero quando todos os campos são zero", () => {
    expect(calcularRisco(baseForm)).toBe(0);
  });

  it("aplica corretamente o fator de colo diagnóstico (soma)", () => {
    const form = { ...baseForm, coloDiagnosticado: "3" };
    // 3 * 800 = 2400
    expect(calcularRisco(form)).toBe(2400);
  });

  it("reduz o IRQ quando Ramificação em V está marcada", () => {
    const formSem = { ...baseForm, coloDiagnosticado: "1" };
    const formCom = { ...formSem, ramificacaoV: true };
    expect(calcularRisco(formCom)).toBeLessThan(calcularRisco(formSem));
  });

  it("reduz o IRQ quando Corpo de Frutificação está marcado", () => {
    const formSem = { ...baseForm, coloDiagnosticado: "1" };
    const formCom = { ...formSem, corpoFrutificacao: true };
    expect(calcularRisco(formCom)).toBeLessThan(calcularRisco(formSem));
  });

  it("Ramificação em V reduz o IRQ em exatamente 800", () => {
    const formSem = { ...baseForm, coloDiagnosticado: "2" };
    const formCom = { ...formSem, ramificacaoV: true };
    expect(calcularRisco(formSem) - calcularRisco(formCom)).toBeCloseTo(800);
  });

  it("Corpo de Frutificação reduz o IRQ em exatamente 800", () => {
    const formSem = { ...baseForm, coloDiagnosticado: "2" };
    const formCom = { ...formSem, corpoFrutificacao: true };
    expect(calcularRisco(formSem) - calcularRisco(formCom)).toBeCloseTo(800);
  });

  it("classifica corretamente como Baixo quando IRQ < 0", () => {
    expect(classifyRisk(-100)).toBe("Baixo");
    expect(classifyRisk(-1)).toBe("Baixo");
  });

  it("classifica corretamente como Moderado quando IRQ está entre 0 e 5000", () => {
    expect(classifyRisk(0)).toBe("Moderado");
    expect(classifyRisk(2500)).toBe("Moderado");
    expect(classifyRisk(5000)).toBe("Moderado");
  });

  it("classifica corretamente como Alto quando IRQ está entre 5001 e 15000", () => {
    expect(classifyRisk(5001)).toBe("Alto");
    expect(classifyRisk(10000)).toBe("Alto");
    expect(classifyRisk(15000)).toBe("Alto");
  });

  it("classifica corretamente como Muito Alto quando IRQ > 15000", () => {
    expect(classifyRisk(15001)).toBe("Muito Alto");
    expect(classifyRisk(100000)).toBe("Muito Alto");
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
    const form: FormState = {
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
    expect(irq).toBeLessThan(5000);
    expect(classifyRisk(irq)).toBe("Moderado");
  });
});
