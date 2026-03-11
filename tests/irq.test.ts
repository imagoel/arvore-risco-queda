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
  coloDiag1: string;
  coloDiag2: string;
  coloDiag3: string;
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
  const cd1 = parseNum(form.coloDiag1);
  const cd2 = parseNum(form.coloDiag2);
  const cd3 = parseNum(form.coloDiag3);
  const rv = form.ramificacaoV ? 1 : 0;
  const cf = form.corpoFrutificacao ? 1 : 0;

  const areaCopa = dc * dc * (Math.PI / 4);
  const volumeCopa = areaCopa * 0.5 * (ag - ar);
  const fatorDap = dcolo !== 0 ? (dap / dcolo) * ang * 1 : 0;
  const irq =
    volumeCopa * fatorDap +
    (cd1 + cd2 + cd3) * 800 +
    rv * -800 +
    cf * -800;

  return irq;
}

function classifyRisk(irq: number): string {
  if (irq < 0) return "Baixo";
  if (irq <= 5000) return "Moderado";
  if (irq <= 15000) return "Alto";
  return "Muito Alto";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Cálculo do Índice de Risco de Queda (IRQ)", () => {
  it("retorna zero quando todos os campos são zero", () => {
    const form: FormState = {
      diametroCopa: "0",
      alturaGeral: "0",
      alturaRamificacao: "0",
      dap: "0",
      dcolo: "0",
      anguloInclinacao: "0",
      coloDiag1: "0",
      coloDiag2: "0",
      coloDiag3: "0",
      ramificacaoV: false,
      corpoFrutificacao: false,
    };
    expect(calcularRisco(form)).toBe(0);
  });

  it("aplica corretamente o fator de colo diagnóstico", () => {
    const form: FormState = {
      diametroCopa: "0",
      alturaGeral: "0",
      alturaRamificacao: "0",
      dap: "0",
      dcolo: "0",
      anguloInclinacao: "0",
      coloDiag1: "1",
      coloDiag2: "1",
      coloDiag3: "1",
      ramificacaoV: false,
      corpoFrutificacao: false,
    };
    // (1+1+1) * 800 = 2400
    expect(calcularRisco(form)).toBe(2400);
  });

  it("reduz o IRQ quando Ramificação em V está marcada", () => {
    const formSem: FormState = {
      diametroCopa: "0",
      alturaGeral: "0",
      alturaRamificacao: "0",
      dap: "0",
      dcolo: "0",
      anguloInclinacao: "0",
      coloDiag1: "1",
      coloDiag2: "0",
      coloDiag3: "0",
      ramificacaoV: false,
      corpoFrutificacao: false,
    };
    const formCom: FormState = { ...formSem, ramificacaoV: true };
    expect(calcularRisco(formCom)).toBeLessThan(calcularRisco(formSem));
  });

  it("reduz o IRQ quando Corpo de Frutificação está marcado", () => {
    const formSem: FormState = {
      diametroCopa: "0",
      alturaGeral: "0",
      alturaRamificacao: "0",
      dap: "0",
      dcolo: "0",
      anguloInclinacao: "0",
      coloDiag1: "1",
      coloDiag2: "0",
      coloDiag3: "0",
      ramificacaoV: false,
      corpoFrutificacao: false,
    };
    const formCom: FormState = { ...formSem, corpoFrutificacao: true };
    expect(calcularRisco(formCom)).toBeLessThan(calcularRisco(formSem));
  });

  it("classifica corretamente como Baixo quando IRQ < 0", () => {
    expect(classifyRisk(-100)).toBe("Baixo");
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

  it("retorna 0 para strings inválidas", () => {
    expect(parseNum("")).toBe(0);
    expect(parseNum("abc")).toBe(0);
  });

  it("calcula corretamente com valores realistas de árvore", () => {
    const form: FormState = {
      diametroCopa: "8",     // 8m de diâmetro
      alturaGeral: "15",     // 15m de altura
      alturaRamificacao: "3", // 3m até 1ª ramificação
      dap: "40",             // 40cm DAP
      dcolo: "50",           // 50cm DCOLO
      anguloInclinacao: "5", // 5 graus
      coloDiag1: "0",
      coloDiag2: "0",
      coloDiag3: "0",
      ramificacaoV: false,
      corpoFrutificacao: false,
    };
    const irq = calcularRisco(form);
    // Verificar que o cálculo produz um número finito e não NaN
    expect(isFinite(irq)).toBe(true);
    expect(isNaN(irq)).toBe(false);
    // Com esses valores: areaCopa = 8² * π/4 ≈ 50.27
    // volumeCopa = 50.27 * 0.5 * (15-3) = 50.27 * 6 ≈ 301.6
    // fatorDap = (40/50) * 5 = 4
    // irq = 301.6 * 4 ≈ 1206.4
    expect(irq).toBeGreaterThan(0);
    expect(irq).toBeLessThan(5000);
    expect(classifyRisk(irq)).toBe("Moderado");
  });
});
