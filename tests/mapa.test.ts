import { describe, it, expect } from "vitest";
import { classifyRisk } from "../lib/irq";

// ─── Marker types (mirrored from mapa.native.tsx) ────────────────────────────

interface TreeMarker {
  id: string;
  latitude: number;
  longitude: number;
  nomeCientifico: string;
  descricao: string;
  fotoUri: string | null;
  criadoEm: string;
  irq: number | null;
  riskLabel: string | null;
  riskColor: string | null;
}

function makeMarker(overrides: Partial<TreeMarker> = {}): TreeMarker {
  return {
    id: "1",
    latitude: -12.9714,
    longitude: -38.5014,
    nomeCientifico: "Ficus benjamina",
    descricao: "Árvore com inclinação leve",
    fotoUri: null,
    criadoEm: "12/03/2026 10:00",
    irq: null,
    riskLabel: null,
    riskColor: null,
    ...overrides,
  };
}

function addMarker(markers: TreeMarker[], newMarker: TreeMarker): TreeMarker[] {
  return [...markers, newMarker];
}

function editMarker(
  markers: TreeMarker[],
  id: string,
  updates: Partial<Pick<TreeMarker, "nomeCientifico" | "descricao" | "fotoUri">>
): TreeMarker[] {
  return markers.map((m) => (m.id === id ? { ...m, ...updates } : m));
}

function deleteMarker(markers: TreeMarker[], id: string): TreeMarker[] {
  return markers.filter((m) => m.id !== id);
}

function applyIRQ(markers: TreeMarker[], id: string, irq: number): TreeMarker[] {
  const result = classifyRisk(irq);
  return markers.map((m) =>
    m.id === id
      ? { ...m, irq: result.index, riskLabel: result.label, riskColor: result.pinColor }
      : m
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Lógica de marcadores do mapa", () => {
  it("adiciona um marcador à lista vazia", () => {
    const marker = makeMarker();
    const result = addMarker([], marker);
    expect(result).toHaveLength(1);
    expect(result[0].nomeCientifico).toBe("Ficus benjamina");
  });

  it("adiciona múltiplos marcadores", () => {
    const m1 = makeMarker({ id: "1" });
    const m2 = makeMarker({ id: "2", nomeCientifico: "Mangifera indica" });
    const result = addMarker(addMarker([], m1), m2);
    expect(result).toHaveLength(2);
  });

  it("edita o nome científico de um marcador existente", () => {
    const marker = makeMarker({ id: "1" });
    const result = editMarker([marker], "1", { nomeCientifico: "Mangifera indica" });
    expect(result[0].nomeCientifico).toBe("Mangifera indica");
  });

  it("edita a descrição de um marcador existente", () => {
    const marker = makeMarker({ id: "1" });
    const result = editMarker([marker], "1", { descricao: "Tronco com cavidade" });
    expect(result[0].descricao).toBe("Tronco com cavidade");
  });

  it("salva fotoUri ao criar marcador com foto", () => {
    const marker = makeMarker({ id: "1", fotoUri: "file:///path/to/photo.jpg" });
    const result = addMarker([], marker);
    expect(result[0].fotoUri).toBe("file:///path/to/photo.jpg");
  });

  it("fotoUri é null quando marcador criado sem foto", () => {
    const marker = makeMarker({ id: "1" });
    const result = addMarker([], marker);
    expect(result[0].fotoUri).toBeNull();
  });

  it("atualiza fotoUri ao editar marcador", () => {
    const marker = makeMarker({ id: "1", fotoUri: null });
    const result = editMarker([marker], "1", { fotoUri: "file:///nova-foto.jpg" });
    expect(result[0].fotoUri).toBe("file:///nova-foto.jpg");
  });

  it("remove fotoUri ao editar marcador com null", () => {
    const marker = makeMarker({ id: "1", fotoUri: "file:///foto.jpg" });
    const result = editMarker([marker], "1", { fotoUri: null });
    expect(result[0].fotoUri).toBeNull();
  });

  it("não altera outros marcadores ao editar", () => {
    const m1 = makeMarker({ id: "1" });
    const m2 = makeMarker({ id: "2", nomeCientifico: "Mangifera indica" });
    const result = editMarker([m1, m2], "1", { nomeCientifico: "Novo nome" });
    expect(result[1].nomeCientifico).toBe("Mangifera indica");
  });

  it("remove um marcador pelo id", () => {
    const m1 = makeMarker({ id: "1" });
    const m2 = makeMarker({ id: "2" });
    const result = deleteMarker([m1, m2], "1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("não altera a lista ao tentar remover id inexistente", () => {
    const marker = makeMarker({ id: "1" });
    const result = deleteMarker([marker], "999");
    expect(result).toHaveLength(1);
  });

  it("preserva coordenadas ao editar apenas o nome", () => {
    const marker = makeMarker({ id: "1", latitude: -12.9714, longitude: -38.5014 });
    const result = editMarker([marker], "1", { nomeCientifico: "Outro nome" });
    expect(result[0].latitude).toBe(-12.9714);
    expect(result[0].longitude).toBe(-38.5014);
  });
});

describe("IRQ vinculado ao marcador", () => {
  // Novas faixas (baseadas em IRQ normalizado 0–100):
  //   0–25   → Risco Muito Baixo  (#4FC3F7)
  //  26–50   → Risco Baixo        (#66BB6A)
  //  51–75   → Alerta - Monitorar (#FFA726)
  //  76–100  → Alerta - Supressão (#EF5350)

  it("aplica Risco Muito Baixo (irq negativo) com pino azul claro", () => {
    const list = [makeMarker({ id: "1" })];
    const updated = applyIRQ(list, "1", -500);
    expect(updated[0].riskLabel).toBe("Risco Muito Baixo");
    expect(updated[0].riskColor).toBe("#4FC3F7");
    expect(updated[0].irq).toBe(-500);
  });

  it("aplica Risco Muito Baixo (irq = 0, normalizado = 0) com pino azul claro", () => {
    const list = [makeMarker({ id: "1" })];
    const updated = applyIRQ(list, "1", 0);
    expect(updated[0].riskLabel).toBe("Risco Muito Baixo");
    expect(updated[0].riskColor).toBe("#4FC3F7");
  });

  it("aplica Risco Muito Baixo (irq = 2500, normalizado = 25) com pino azul claro", () => {
    const list = [makeMarker({ id: "1" })];
    const updated = applyIRQ(list, "1", 2500);
    expect(updated[0].riskLabel).toBe("Risco Muito Baixo");
    expect(updated[0].riskColor).toBe("#4FC3F7");
  });

  it("aplica Risco Baixo (irq = 5000, normalizado = 50) com pino verde", () => {
    const list = [makeMarker({ id: "1" })];
    const updated = applyIRQ(list, "1", 5000);
    expect(updated[0].riskLabel).toBe("Risco Baixo");
    expect(updated[0].riskColor).toBe("#66BB6A");
  });

  it("aplica Alerta - Monitorar (irq = 7500, normalizado = 75) com pino laranja", () => {
    const list = [makeMarker({ id: "1" })];
    const updated = applyIRQ(list, "1", 7500);
    expect(updated[0].riskLabel).toBe("Alerta - Monitorar Árvore");
    expect(updated[0].riskColor).toBe("#FFA726");
  });

  it("aplica Alerta - Supressão (irq = 10000, normalizado = 100) com pino vermelho", () => {
    const list = [makeMarker({ id: "1" })];
    const updated = applyIRQ(list, "1", 10000);
    expect(updated[0].riskLabel).toBe("Alerta - Supressão da Árvore");
    expect(updated[0].riskColor).toBe("#EF5350");
  });

  it("aplica Alerta - Supressão (irq > 10000, normalizado limitado em 100) com pino vermelho", () => {
    const list = [makeMarker({ id: "1" })];
    const updated = applyIRQ(list, "1", 50000);
    expect(updated[0].riskLabel).toBe("Alerta - Supressão da Árvore");
    expect(updated[0].riskColor).toBe("#EF5350");
  });

  it("não altera outros marcadores ao aplicar IRQ", () => {
    const list = [makeMarker({ id: "1" }), makeMarker({ id: "2" })];
    const updated = applyIRQ(list, "1", 8000);
    // irq 8000 → normalizado 80 → Alerta - Supressão da Árvore
    expect(updated[0].riskLabel).toBe("Alerta - Supressão da Árvore");
    expect(updated[1].irq).toBeNull();
  });

  it("preserva nome científico e foto ao aplicar IRQ", () => {
    const list = [makeMarker({ id: "1", nomeCientifico: "Mangifera indica", fotoUri: "file:///mango.jpg" })];
    const updated = applyIRQ(list, "1", 8000);
    expect(updated[0].nomeCientifico).toBe("Mangifera indica");
    expect(updated[0].fotoUri).toBe("file:///mango.jpg");
  });

  it("limite de risco em irq = 2600 (normalizado 26) é Risco Baixo", () => {
    const list = [makeMarker({ id: "1" })];
    const updated = applyIRQ(list, "1", 2600);
    expect(updated[0].riskLabel).toBe("Risco Baixo");
  });

  it("limite de risco em irq = 7600 (normalizado 76) é Alerta - Supressão", () => {
    const list = [makeMarker({ id: "1" })];
    const updated = applyIRQ(list, "1", 7600);
    expect(updated[0].riskLabel).toBe("Alerta - Supressão da Árvore");
    expect(updated[0].riskColor).toBe("#EF5350");
  });
});
