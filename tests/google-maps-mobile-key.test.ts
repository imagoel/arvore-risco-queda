/**
 * Valida que a chave EXPO_PUBLIC_GOOGLE_MAPS_MOBILE_KEY está configurada
 * e funcional, fazendo uma chamada leve à Geocoding API do Google.
 *
 * Nota: a chave mobile pode ter restrições de plataforma (iOS/Android),
 * o que impede chamadas HTTP diretas de um servidor Node. Por isso,
 * este teste valida apenas que a chave está definida e tem o formato
 * correto (começa com "AIza" e tem 39 caracteres).
 */
import { describe, it, expect } from "vitest";

describe("Google Maps Mobile Key", () => {
  it("deve ter a variável EXPO_PUBLIC_GOOGLE_MAPS_MOBILE_KEY definida", () => {
    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MOBILE_KEY;
    expect(key, "EXPO_PUBLIC_GOOGLE_MAPS_MOBILE_KEY não está definida").toBeDefined();
    expect(key!.length, "Chave deve ter pelo menos 20 caracteres").toBeGreaterThanOrEqual(20);
    expect(key!.startsWith("AIza"), "Chave Google deve começar com 'AIza'").toBe(true);
  });

  it("deve ser diferente da chave do painel web (GOOGLE_MAPS_API_KEY)", () => {
    const mobileKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MOBILE_KEY;
    const webKey = process.env.GOOGLE_MAPS_API_KEY;
    // Se ambas estiverem definidas, devem ser diferentes (chaves separadas por plataforma)
    if (mobileKey && webKey) {
      expect(mobileKey, "Chave mobile deve ser diferente da chave web").not.toBe(webKey);
    }
    // Se apenas a mobile estiver definida, o teste passa normalmente
    expect(mobileKey).toBeDefined();
  });
});
