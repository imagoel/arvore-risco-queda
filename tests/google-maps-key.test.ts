import { describe, it, expect } from "vitest";

describe("Google Maps API Key", () => {
  it("deve estar definida no ambiente", () => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    expect(key).toBeDefined();
    expect(key?.length).toBeGreaterThan(10);
    // Formato típico de API key do Google: AIza...
    expect(key).toMatch(/^AIza/);
  });
});
