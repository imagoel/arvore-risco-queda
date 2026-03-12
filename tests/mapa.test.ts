import { describe, it, expect } from "vitest";

// ─── Replicating marker logic from the map screen ─────────────────────────────

interface TreeMarker {
  id: string;
  latitude: number;
  longitude: number;
  nomeCientifico: string;
  descricao: string;
  fotoUri: string | null;
  criadoEm: string;
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

function makeMarker(overrides: Partial<TreeMarker> = {}): TreeMarker {
  return {
    id: "1",
    latitude: -12.9714,
    longitude: -38.5014,
    nomeCientifico: "Ficus benjamina",
    descricao: "Árvore com inclinação leve",
    fotoUri: null,
    criadoEm: "12/03/2026 10:00",
    ...overrides,
  };
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
