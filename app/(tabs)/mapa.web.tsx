import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ScreenContainer } from "@/components/screen-container";

export default function MapaScreenWeb() {
  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={styles.container}>
        <Text style={styles.icon}>🗺️</Text>
        <Text style={styles.title}>Mapa disponível no dispositivo</Text>
        <Text style={styles.subtitle}>
          A tela de mapa com geolocalização funciona no aplicativo instalado
          no celular (iOS ou Android). Escaneie o QR Code com o Expo Go para
          testar no seu dispositivo.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A2E22",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#52796F",
    textAlign: "center",
    lineHeight: 22,
  },
});
