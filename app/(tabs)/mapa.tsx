import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import MapView, { Marker, MapPressEvent, Region } from "react-native-maps";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TreeMarker {
  id: string;
  latitude: number;
  longitude: number;
  nomeCientifico: string;
  descricao: string;
  criadoEm: string;
}

interface ModalState {
  visible: boolean;
  latitude: number;
  longitude: number;
  nomeCientifico: string;
  descricao: string;
  editingId: string | null;
}

const STORAGE_KEY = "@arvore_marcadores";

const PURPLE = "#5B2EBE";

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function MapaScreen() {
  const mapRef = useRef<MapView>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [markers, setMarkers] = useState<TreeMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<TreeMarker | null>(null);
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    latitude: 0,
    longitude: 0,
    nomeCientifico: "",
    descricao: "",
    editingId: null,
  });

  // ── Load saved markers ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) setMarkers(JSON.parse(stored));
      } catch {
        // ignore
      }
    })();
  }, []);

  // ── Save markers whenever they change ──────────────────────────────────────
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(markers)).catch(() => {});
  }, [markers]);

  // ── Get user location ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoadingLocation(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setLocationError("Permissão de localização negada.");
          setLoadingLocation(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setUserLocation(coords);
        mapRef.current?.animateToRegion(
          {
            ...coords,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          },
          800
        );
      } catch {
        setLocationError("Não foi possível obter a localização.");
      } finally {
        setLoadingLocation(false);
      }
    })();
  }, []);

  // ── Handle map press → open modal to add marker ────────────────────────────
  const handleMapPress = useCallback((e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSelectedMarker(null);
    setModal({
      visible: true,
      latitude,
      longitude,
      nomeCientifico: "",
      descricao: "",
      editingId: null,
    });
  }, []);

  // ── Handle marker press → show detail / edit ───────────────────────────────
  const handleMarkerPress = useCallback((marker: TreeMarker) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedMarker(marker);
  }, []);

  // ── Save marker ─────────────────────────────────────────────────────────────
  const handleSaveMarker = useCallback(() => {
    if (!modal.nomeCientifico.trim()) {
      Alert.alert("Campo obrigatório", "Informe o nome científico da árvore.");
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (modal.editingId) {
      setMarkers((prev) =>
        prev.map((m) =>
          m.id === modal.editingId
            ? { ...m, nomeCientifico: modal.nomeCientifico.trim(), descricao: modal.descricao.trim() }
            : m
        )
      );
    } else {
      const newMarker: TreeMarker = {
        id: Date.now().toString(),
        latitude: modal.latitude,
        longitude: modal.longitude,
        nomeCientifico: modal.nomeCientifico.trim(),
        descricao: modal.descricao.trim(),
        criadoEm: new Date().toLocaleString("pt-BR"),
      };
      setMarkers((prev) => [...prev, newMarker]);
    }
    setModal((m) => ({ ...m, visible: false }));
  }, [modal]);

  // ── Edit marker ─────────────────────────────────────────────────────────────
  const handleEditMarker = useCallback((marker: TreeMarker) => {
    setSelectedMarker(null);
    setModal({
      visible: true,
      latitude: marker.latitude,
      longitude: marker.longitude,
      nomeCientifico: marker.nomeCientifico,
      descricao: marker.descricao,
      editingId: marker.id,
    });
  }, []);

  // ── Delete marker ───────────────────────────────────────────────────────────
  const handleDeleteMarker = useCallback((id: string) => {
    Alert.alert("Remover árvore", "Deseja remover este marcador do mapa?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () => {
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          setMarkers((prev) => prev.filter((m) => m.id !== id));
          setSelectedMarker(null);
        },
      },
    ]);
  }, []);

  // ── Center on user ──────────────────────────────────────────────────────────
  const handleCenterUser = useCallback(() => {
    if (!userLocation) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    mapRef.current?.animateToRegion(
      { ...userLocation, latitudeDelta: 0.005, longitudeDelta: 0.005 },
      600
    );
  }, [userLocation]);

  // ── Default region (Brazil center) ─────────────────────────────────────────
  const defaultRegion: Region = {
    latitude: userLocation?.latitude ?? -14.235,
    longitude: userLocation?.longitude ?? -51.9253,
    latitudeDelta: userLocation ? 0.005 : 30,
    longitudeDelta: userLocation ? 0.005 : 30,
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <View style={styles.container}>
        {/* Map */}
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={defaultRegion}
          showsUserLocation
          showsMyLocationButton={false}
          onPress={handleMapPress}
        >
          {markers.map((marker) => (
            <Marker
              key={marker.id}
              coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
              onPress={() => handleMarkerPress(marker)}
              pinColor="#2D6A4F"
            />
          ))}
        </MapView>

        {/* Loading overlay */}
        {loadingLocation && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={PURPLE} />
            <Text style={styles.loadingText}>Obtendo localização...</Text>
          </View>
        )}

        {/* Location error */}
        {locationError && !loadingLocation && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{locationError}</Text>
          </View>
        )}

        {/* Hint */}
        {!loadingLocation && !locationError && (
          <View style={styles.hintBanner}>
            <Text style={styles.hintText}>Toque no mapa para marcar uma árvore</Text>
          </View>
        )}

        {/* Center button */}
        {userLocation && (
          <TouchableOpacity style={styles.centerBtn} onPress={handleCenterUser} activeOpacity={0.8}>
            <Text style={styles.centerBtnIcon}>◎</Text>
          </TouchableOpacity>
        )}

        {/* Marker count badge */}
        {markers.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {markers.length} {markers.length === 1 ? "árvore" : "árvores"}
            </Text>
          </View>
        )}
      </View>

      {/* ── Detail Bottom Sheet ─────────────────────────────────────────────── */}
      {selectedMarker && (
        <View style={styles.detailSheet}>
          <View style={styles.detailHandle} />
          <View style={styles.detailHeader}>
            <View style={styles.detailTreeIcon}>
              <Text style={styles.detailTreeEmoji}>🌳</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailName}>{selectedMarker.nomeCientifico}</Text>
              <Text style={styles.detailDate}>{selectedMarker.criadoEm}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedMarker(null)} style={styles.detailClose}>
              <Text style={styles.detailCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          {selectedMarker.descricao ? (
            <Text style={styles.detailDesc}>{selectedMarker.descricao}</Text>
          ) : (
            <Text style={styles.detailDescEmpty}>Sem descrição.</Text>
          )}
          <Text style={styles.detailCoords}>
            {selectedMarker.latitude.toFixed(6)}, {selectedMarker.longitude.toFixed(6)}
          </Text>
          <View style={styles.detailActions}>
            <TouchableOpacity
              style={[styles.detailBtn, styles.detailBtnEdit]}
              onPress={() => handleEditMarker(selectedMarker)}
              activeOpacity={0.8}
            >
              <Text style={styles.detailBtnEditText}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.detailBtn, styles.detailBtnDelete]}
              onPress={() => handleDeleteMarker(selectedMarker.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.detailBtnDeleteText}>Remover</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Add / Edit Modal ────────────────────────────────────────────────── */}
      <Modal
        visible={modal.visible}
        animationType="slide"
        transparent
        onRequestClose={() => setModal((m) => ({ ...m, visible: false }))}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalSheet}>
            <View style={styles.detailHandle} />
            <Text style={styles.modalTitle}>
              {modal.editingId ? "Editar Árvore" : "Cadastrar Árvore"}
            </Text>
            <Text style={styles.modalCoords}>
              {modal.latitude.toFixed(6)}, {modal.longitude.toFixed(6)}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Nome Científico */}
              <Text style={styles.inputLabel}>Nome Científico *</Text>
              <TextInput
                style={styles.textInput}
                value={modal.nomeCientifico}
                onChangeText={(v) => setModal((m) => ({ ...m, nomeCientifico: v }))}
                placeholder="Ex: Ficus benjamina"
                placeholderTextColor="#AAAAAA"
                returnKeyType="next"
                autoCapitalize="sentences"
              />
              <View style={styles.inputUnderline} />

              {/* Descrição */}
              <Text style={[styles.inputLabel, { marginTop: 20 }]}>Descrição do Estado</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={modal.descricao}
                onChangeText={(v) => setModal((m) => ({ ...m, descricao: v }))}
                placeholder="Descreva brevemente o estado da árvore..."
                placeholderTextColor="#AAAAAA"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                returnKeyType="done"
                autoCapitalize="sentences"
              />
              <View style={styles.inputUnderline} />

              {/* Buttons */}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setModal((m) => ({ ...m, visible: false }))}
                  activeOpacity={0.75}
                >
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalBtnSave}
                  onPress={handleSaveMarker}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalBtnSaveText}>
                    {modal.editingId ? "Salvar" : "Cadastrar"}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  // Overlays
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: "#444",
    fontWeight: "500",
  },
  errorBanner: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DC2626",
  },
  errorText: {
    color: "#991B1B",
    fontSize: 14,
    textAlign: "center",
    fontWeight: "500",
  },
  hintBanner: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  hintText: {
    color: "#444",
    fontSize: 13,
    fontWeight: "500",
  },

  // Buttons
  centerBtn: {
    position: "absolute",
    bottom: 24,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  centerBtnIcon: {
    fontSize: 22,
    color: PURPLE,
  },
  countBadge: {
    position: "absolute",
    bottom: 24,
    left: 16,
    backgroundColor: "#2D6A4F",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  countText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  // Detail sheet
  detailSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    gap: 8,
  },
  detailHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#DDDDDD",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 8,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailTreeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D8F3DC",
    alignItems: "center",
    justifyContent: "center",
  },
  detailTreeEmoji: {
    fontSize: 22,
  },
  detailName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1A2E22",
    fontStyle: "italic",
  },
  detailDate: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  detailClose: {
    padding: 4,
  },
  detailCloseText: {
    fontSize: 18,
    color: "#999",
    fontWeight: "600",
  },
  detailDesc: {
    fontSize: 15,
    color: "#444",
    lineHeight: 22,
  },
  detailDescEmpty: {
    fontSize: 14,
    color: "#AAAAAA",
    fontStyle: "italic",
  },
  detailCoords: {
    fontSize: 12,
    color: "#AAAAAA",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  detailActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  detailBtn: {
    flex: 1,
    height: 44,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  detailBtnEdit: {
    backgroundColor: PURPLE,
  },
  detailBtnEditText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  detailBtnDelete: {
    borderWidth: 1.5,
    borderColor: "#DC2626",
  },
  detailBtnDeleteText: {
    color: "#DC2626",
    fontWeight: "600",
    fontSize: 15,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1A2E22",
    marginBottom: 4,
  },
  modalCoords: {
    fontSize: 12,
    color: "#AAAAAA",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 6,
    fontWeight: "400",
  },
  textInput: {
    fontSize: 17,
    color: "#111111",
    paddingVertical: 4,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
  },
  textArea: {
    minHeight: 80,
    fontSize: 15,
    lineHeight: 22,
  },
  inputUnderline: {
    height: 1,
    backgroundColor: "#CCCCCC",
    marginTop: 2,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 28,
  },
  modalBtnCancel: {
    flex: 1,
    height: 52,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#CCCCCC",
  },
  modalBtnCancelText: {
    color: "#666666",
    fontSize: 16,
    fontWeight: "500",
  },
  modalBtnSave: {
    flex: 2,
    height: 52,
    borderRadius: 50,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modalBtnSaveText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
});
