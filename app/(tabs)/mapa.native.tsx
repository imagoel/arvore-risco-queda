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
  Image,
  Dimensions,
} from "react-native";
import MapView, { Marker, MapPressEvent, Region, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { classifyRisk, formatIRQ, type RiskResult } from "@/lib/irq";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TreeMarker {
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

interface ModalState {
  visible: boolean;
  latitude: number;
  longitude: number;
  nomeCientifico: string;
  descricao: string;
  fotoUri: string | null;
  editingId: string | null;
}

interface IRQFormState {
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

const STORAGE_KEY = "@arvore_marcadores_v3";
const PURPLE = "#5B2EBE";

const emptyIRQForm: IRQFormState = {
  diametroCopa: "",
  alturaGeral: "",
  alturaRamificacao: "",
  dap: "",
  dcolo: "",
  anguloInclinacao: "",
  coloDiagnosticado: "",
  ramificacaoV: false,
  corpoFrutificacao: false,
};

function parseNum(val: string): number {
  const n = parseFloat(val.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function calcularRisco(form: IRQFormState): number {
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
  return volumeCopa * fatorDap + coloDiag * 800 + rv * -800 + cf * -800;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function IRQFieldInput({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={irqStyles.fieldContainer}>
      <Text style={irqStyles.fieldLabel}>{label}</Text>
      <TextInput
        style={irqStyles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholderTextColor="#AAAAAA"
        returnKeyType="done"
        underlineColorAndroid="transparent"
      />
      <View style={irqStyles.inputUnderline} />
    </View>
  );
}

function IRQCheckbox({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={irqStyles.checkboxRow} onPress={onToggle} activeOpacity={0.75}>
      <View style={[irqStyles.checkbox, value && irqStyles.checkboxChecked]}>
        {value && <Text style={irqStyles.checkmark}>✓</Text>}
      </View>
      <Text style={irqStyles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

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
    fotoUri: null,
    editingId: null,
  });
  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);
  const [irqModalVisible, setIrqModalVisible] = useState(false);
  const [irqMarkerId, setIrqMarkerId] = useState<string | null>(null);
  const [irqForm, setIrqForm] = useState<IRQFormState>(emptyIRQForm);
  const [irqResult, setIrqResult] = useState<RiskResult | null>(null);

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
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(coords);
        mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 800);
      } catch {
        setLocationError("Não foi possível obter a localização.");
      } finally {
        setLoadingLocation(false);
      }
    })();
  }, []);

  // ── Photo: take with camera ─────────────────────────────────────────────────
  const handleTakePhoto = useCallback(async () => {
    setPhotoPickerVisible(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão necessária", "Permita o acesso à câmera para tirar uma foto.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 1.0,
      exif: false,
    });
    if (!result.canceled) {
      setModal((m) => ({ ...m, fotoUri: result.assets[0].uri }));
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // ── Photo: pick from gallery ────────────────────────────────────────────────
  const handlePickGallery = useCallback(async () => {
    setPhotoPickerVisible(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão necessária", "Permita o acesso à galeria para selecionar uma foto.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1.0,
      exif: false,
    });
    if (!result.canceled) {
      setModal((m) => ({ ...m, fotoUri: result.assets[0].uri }));
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // ── Handle map press → open modal to add marker ────────────────────────────
  const handleMapPress = useCallback((e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMarker(null);
    setModal({
      visible: true,
      latitude,
      longitude,
      nomeCientifico: "",
      descricao: "",
      fotoUri: null,
      editingId: null,
    });
  }, []);

  // ── Handle marker press → show detail ─────────────────────────────────────
  const handleMarkerPress = useCallback((marker: TreeMarker) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMarker(marker);
  }, []);

  // ── Save marker ─────────────────────────────────────────────────────────────
  const handleSaveMarker = useCallback(() => {
    if (!modal.nomeCientifico.trim()) {
      Alert.alert("Campo obrigatório", "Informe o nome científico da árvore.");
      return;
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (modal.editingId) {
      setMarkers((prev) =>
        prev.map((m) =>
          m.id === modal.editingId
            ? { ...m, nomeCientifico: modal.nomeCientifico.trim(), descricao: modal.descricao.trim(), fotoUri: modal.fotoUri }
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
        fotoUri: modal.fotoUri,
        criadoEm: new Date().toLocaleString("pt-BR"),
        irq: null,
        riskLabel: null,
        riskColor: null,
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
      fotoUri: marker.fotoUri ?? null,
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
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setMarkers((prev) => prev.filter((m) => m.id !== id));
          setSelectedMarker(null);
        },
      },
    ]);
  }, []);

  // ── Open IRQ modal for a marker ─────────────────────────────────────────────
  const handleOpenIRQ = useCallback((marker: TreeMarker) => {
    setSelectedMarker(null);
    setIrqMarkerId(marker.id);
    setIrqForm(emptyIRQForm);
    setIrqResult(null);
    setIrqModalVisible(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // ── Calculate IRQ in modal ──────────────────────────────────────────────────
  const handleCalculateIRQ = useCallback(() => {
    const irq = calcularRisco(irqForm);
    const result = classifyRisk(irq);
    setIrqResult(result);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [irqForm]);

  // ── Save IRQ to marker ──────────────────────────────────────────────────────
  const handleSaveIRQ = useCallback(() => {
    if (!irqResult) {
      Alert.alert("Calcule primeiro", "Pressione 'Calcular' antes de salvar.");
      return;
    }
    setMarkers((prev) =>
      prev.map((m) =>
        m.id === irqMarkerId
          ? { ...m, irq: irqResult.index, riskLabel: irqResult.label, riskColor: irqResult.pinColor }
          : m
      )
    );
    setIrqModalVisible(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [irqResult, irqMarkerId]);

  // ── Center on user ──────────────────────────────────────────────────────────
  const handleCenterUser = useCallback(() => {
    if (!userLocation) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current?.animateToRegion({ ...userLocation, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 600);
  }, [userLocation]);

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
          provider={PROVIDER_GOOGLE}
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
              pinColor={marker.riskColor ?? "#2D6A4F"}
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

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: "#16A34A" }]} />
            <Text style={styles.legendText}>Baixo</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: "#CA8A04" }]} />
            <Text style={styles.legendText}>Moderado</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: "#EA580C" }]} />
            <Text style={styles.legendText}>Alto</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: "#DC2626" }]} />
            <Text style={styles.legendText}>Muito Alto</Text>
          </View>
        </View>

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

          {selectedMarker.fotoUri ? (
            <Image source={{ uri: selectedMarker.fotoUri }} style={styles.detailPhoto} resizeMode="cover" />
          ) : null}

          <View style={styles.detailHeader}>
            {!selectedMarker.fotoUri && (
              <View style={styles.detailTreeIcon}>
                <Text style={styles.detailTreeEmoji}>🌳</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.detailName}>{selectedMarker.nomeCientifico}</Text>
              <Text style={styles.detailDate}>{selectedMarker.criadoEm}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedMarker(null)} style={styles.detailClose}>
              <Text style={styles.detailCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {selectedMarker.irq !== null && selectedMarker.riskLabel ? (
            <View style={[styles.riskBadgeContainer, { backgroundColor: classifyRisk(selectedMarker.irq).bgColor, borderColor: classifyRisk(selectedMarker.irq).borderColor }]}>
              <Text style={[styles.riskBadgeLabel, { color: classifyRisk(selectedMarker.irq).color }]}>
                IRQ: {formatIRQ(selectedMarker.irq)}
              </Text>
              <View style={[styles.riskBadgePill, { backgroundColor: classifyRisk(selectedMarker.irq).borderColor }]}>
                <Text style={styles.riskBadgePillText}>Risco {selectedMarker.riskLabel}</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.irqPromptBtn}
              onPress={() => handleOpenIRQ(selectedMarker)}
              activeOpacity={0.8}
            >
              <Text style={styles.irqPromptText}>📊 Calcular Índice de Risco (IRQ)</Text>
            </TouchableOpacity>
          )}

          {selectedMarker.descricao ? (
            <Text style={styles.detailDesc}>{selectedMarker.descricao}</Text>
          ) : (
            <Text style={styles.detailDescEmpty}>Sem descrição.</Text>
          )}
          <Text style={styles.detailCoords}>
            {selectedMarker.latitude.toFixed(6)}, {selectedMarker.longitude.toFixed(6)}
          </Text>
          <View style={styles.detailActions}>
            {selectedMarker.irq !== null && (
              <TouchableOpacity
                style={[styles.detailBtn, styles.detailBtnIRQ]}
                onPress={() => handleOpenIRQ(selectedMarker)}
                activeOpacity={0.8}
              >
                <Text style={styles.detailBtnIRQText}>Recalcular IRQ</Text>
              </TouchableOpacity>
            )}
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
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={() => setModal((m) => ({ ...m, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalKAV}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={0}
          >
            <View style={styles.modalSheet}>
              <View style={styles.detailHandle} />
              <Text style={styles.modalTitle}>
                {modal.editingId ? "Editar Árvore" : "Cadastrar Árvore"}
              </Text>
              <Text style={styles.modalCoords}>
                {modal.latitude.toFixed(6)}, {modal.longitude.toFixed(6)}
              </Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalScrollContent}
              >
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

                {/* Foto */}
                <Text style={[styles.inputLabel, { marginTop: 20 }]}>Foto da Árvore</Text>
                {modal.fotoUri ? (
                  <View style={styles.photoPreviewContainer}>
                    <Image source={{ uri: modal.fotoUri }} style={styles.photoPreview} resizeMode="cover" />
                    <View style={styles.photoActions}>
                      <TouchableOpacity style={styles.photoActionBtn} onPress={() => setPhotoPickerVisible(true)} activeOpacity={0.8}>
                        <Text style={styles.photoActionText}>Trocar foto</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.photoActionBtn, styles.photoRemoveBtn]} onPress={() => setModal((m) => ({ ...m, fotoUri: null }))} activeOpacity={0.8}>
                        <Text style={styles.photoRemoveText}>Remover</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.photoPlaceholder} onPress={() => setPhotoPickerVisible(true)} activeOpacity={0.8}>
                    <Text style={styles.photoPlaceholderIcon}>📷</Text>
                    <Text style={styles.photoPlaceholderText}>Adicionar foto</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModal((m) => ({ ...m, visible: false }))} activeOpacity={0.75}>
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalBtnSave} onPress={handleSaveMarker} activeOpacity={0.85}>
                    <Text style={styles.modalBtnSaveText}>{modal.editingId ? "Salvar" : "Cadastrar"}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Photo Picker Action Sheet ───────────────────────────────────────── */}
      <Modal
        visible={photoPickerVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={() => setPhotoPickerVisible(false)}
      >
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setPhotoPickerVisible(false)}>
          <View style={styles.pickerSheet}>
            <View style={styles.detailHandle} />
            <Text style={styles.pickerTitle}>Adicionar Foto</Text>
            <TouchableOpacity style={styles.pickerOption} onPress={handleTakePhoto} activeOpacity={0.8}>
              <Text style={styles.pickerOptionIcon}>📷</Text>
              <View>
                <Text style={styles.pickerOptionLabel}>Tirar Foto</Text>
                <Text style={styles.pickerOptionSub}>Usar a câmera do dispositivo</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.pickerDivider} />
            <TouchableOpacity style={styles.pickerOption} onPress={handlePickGallery} activeOpacity={0.8}>
              <Text style={styles.pickerOptionIcon}>🖼️</Text>
              <View>
                <Text style={styles.pickerOptionLabel}>Escolher da Galeria</Text>
                <Text style={styles.pickerOptionSub}>Selecionar uma foto existente</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setPhotoPickerVisible(false)} activeOpacity={0.8}>
              <Text style={styles.pickerCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── IRQ Calculator Modal ────────────────────────────────────────────── */}
      <Modal
        visible={irqModalVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={() => setIrqModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalKAV}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={0}
          >
            <View style={[styles.modalSheet, { maxHeight: SCREEN_HEIGHT * 0.92 }]}>
              <View style={styles.detailHandle} />
              <Text style={styles.modalTitle}>Calcular Risco (IRQ)</Text>
              <Text style={[styles.modalCoords, { marginBottom: 12 }]}>
                Preencha os dados para calcular o índice
              </Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalScrollContent}
              >
                <IRQFieldInput label="Diâmetro da Copa" value={irqForm.diametroCopa} onChangeText={(v) => setIrqForm((f) => ({ ...f, diametroCopa: v }))} />
                <IRQFieldInput label="Altura Geral" value={irqForm.alturaGeral} onChangeText={(v) => setIrqForm((f) => ({ ...f, alturaGeral: v }))} />
                <IRQFieldInput label="Altura da 1ª Ramificação" value={irqForm.alturaRamificacao} onChangeText={(v) => setIrqForm((f) => ({ ...f, alturaRamificacao: v }))} />
                <IRQFieldInput label="DAP" value={irqForm.dap} onChangeText={(v) => setIrqForm((f) => ({ ...f, dap: v }))} />
                <IRQFieldInput label="DCOLO" value={irqForm.dcolo} onChangeText={(v) => setIrqForm((f) => ({ ...f, dcolo: v }))} />
                <IRQFieldInput label="Ângulo de Inclinação" value={irqForm.anguloInclinacao} onChangeText={(v) => setIrqForm((f) => ({ ...f, anguloInclinacao: v }))} />
                <IRQFieldInput label="Colo Diagnosticado (Soma)" value={irqForm.coloDiagnosticado} onChangeText={(v) => setIrqForm((f) => ({ ...f, coloDiagnosticado: v }))} />

                <View style={irqStyles.checkboxSection}>
                  <IRQCheckbox label="Ramificação em V" value={irqForm.ramificacaoV} onToggle={() => setIrqForm((f) => ({ ...f, ramificacaoV: !f.ramificacaoV }))} />
                  <IRQCheckbox label="Corpo de Frutificação" value={irqForm.corpoFrutificacao} onToggle={() => setIrqForm((f) => ({ ...f, corpoFrutificacao: !f.corpoFrutificacao }))} />
                </View>

                <TouchableOpacity style={irqStyles.btnCalcular} onPress={handleCalculateIRQ} activeOpacity={0.85}>
                  <Text style={irqStyles.btnCalcularText}>Calcular</Text>
                </TouchableOpacity>

                {irqResult && (
                  <View style={[irqStyles.resultCard, { backgroundColor: irqResult.bgColor, borderColor: irqResult.borderColor }]}>
                    <Text style={[irqStyles.resultLabel, { color: irqResult.color }]}>Índice de Risco de Queda</Text>
                    <Text style={[irqStyles.resultIndex, { color: irqResult.color }]}>{formatIRQ(irqResult.index)}</Text>
                    <View style={[irqStyles.riskBadge, { backgroundColor: irqResult.borderColor }]}>
                      <Text style={irqStyles.riskBadgeText}>Risco {irqResult.label}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setIrqModalVisible(false)} activeOpacity={0.75}>
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtnSave, !irqResult && { opacity: 0.5 }]}
                    onPress={handleSaveIRQ}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalBtnSaveText}>Salvar no Marcador</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ─── IRQ Form Styles ──────────────────────────────────────────────────────────

const irqStyles = StyleSheet.create({
  fieldContainer: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, color: "#666666", marginBottom: 4, fontWeight: "400" },
  input: { fontSize: 16, color: "#111111", paddingVertical: 3, paddingHorizontal: 0, backgroundColor: "transparent" },
  inputUnderline: { height: 1, backgroundColor: "#CCCCCC", marginTop: 2 },
  checkboxSection: { gap: 12, marginBottom: 20, marginTop: 4 },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  checkbox: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: PURPLE, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  checkboxChecked: { backgroundColor: PURPLE, borderColor: PURPLE },
  checkmark: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", lineHeight: 18 },
  checkboxLabel: { fontSize: 15, color: "#111111", fontWeight: "400" },
  btnCalcular: { backgroundColor: PURPLE, borderRadius: 50, height: 50, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  btnCalcularText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  resultCard: { borderRadius: 14, borderWidth: 2, padding: 20, alignItems: "center", gap: 8, marginBottom: 8 },
  resultLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  resultIndex: { fontSize: 36, fontWeight: "800", letterSpacing: -1 },
  riskBadge: { borderRadius: 100, paddingHorizontal: 16, paddingVertical: 5, marginTop: 2 },
  riskBadgeText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});

// ─── Map Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.85)", alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 16, color: "#444", fontWeight: "500" },
  errorBanner: { position: "absolute", top: 16, left: 16, right: 16, backgroundColor: "#FEE2E2", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#DC2626" },
  errorText: { color: "#991B1B", fontSize: 14, textAlign: "center", fontWeight: "500" },
  hintBanner: { position: "absolute", top: 16, left: 16, right: 160, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 10, padding: 10, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  hintText: { color: "#444", fontSize: 12, fontWeight: "500" },

  legend: { position: "absolute", top: 16, right: 16, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 10, padding: 10, gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: "#444", fontWeight: "500" },

  centerBtn: { position: "absolute", bottom: 24, right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  centerBtnIcon: { fontSize: 22, color: PURPLE },
  countBadge: { position: "absolute", bottom: 24, left: 16, backgroundColor: "#2D6A4F", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  countText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  // Detail sheet
  detailSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, shadowColor: "#000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 8, gap: 8 },
  detailHandle: { width: 40, height: 4, backgroundColor: "#DDDDDD", borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  detailPhoto: { width: "100%", height: 160, borderRadius: 12, marginBottom: 4 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  detailTreeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#D8F3DC", alignItems: "center", justifyContent: "center" },
  detailTreeEmoji: { fontSize: 22 },
  detailName: { fontSize: 17, fontWeight: "700", color: "#1A2E22", fontStyle: "italic" },
  detailDate: { fontSize: 12, color: "#888", marginTop: 2 },
  detailClose: { padding: 4 },
  detailCloseText: { fontSize: 18, color: "#999", fontWeight: "600" },
  detailDesc: { fontSize: 15, color: "#444", lineHeight: 22 },
  detailDescEmpty: { fontSize: 14, color: "#AAAAAA", fontStyle: "italic" },
  detailCoords: { fontSize: 12, color: "#AAAAAA", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  detailActions: { flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" },
  detailBtn: { flex: 1, minWidth: 80, height: 44, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  detailBtnIRQ: { backgroundColor: "#1A2E22" },
  detailBtnIRQText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  detailBtnEdit: { backgroundColor: PURPLE },
  detailBtnEditText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  detailBtnDelete: { borderWidth: 1.5, borderColor: "#DC2626" },
  detailBtnDeleteText: { color: "#DC2626", fontWeight: "600", fontSize: 14 },

  // IRQ prompt
  irqPromptBtn: { backgroundColor: "#F0FDF4", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#BBF7D0", alignItems: "center" },
  irqPromptText: { color: "#166534", fontSize: 14, fontWeight: "600" },

  // Risk badge in detail
  riskBadgeContainer: { borderRadius: 12, borderWidth: 1.5, padding: 12, alignItems: "center", gap: 6 },
  riskBadgeLabel: { fontSize: 13, fontWeight: "700" },
  riskBadgePill: { borderRadius: 100, paddingHorizontal: 14, paddingVertical: 4 },
  riskBadgePillText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  // Modal — key fix: outer overlay is just a backdrop, KAV + sheet are separate
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalKAV: {
    // No flex:1 here — let the sheet define its own height
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.88,
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#1A2E22", marginBottom: 4 },
  modalCoords: { fontSize: 12, color: "#AAAAAA", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", marginBottom: 20 },
  inputLabel: { fontSize: 14, color: "#666666", marginBottom: 6, fontWeight: "400" },
  textInput: { fontSize: 17, color: "#111111", paddingVertical: 4, paddingHorizontal: 0, backgroundColor: "transparent" },
  textArea: { minHeight: 80, fontSize: 15, lineHeight: 22 },
  inputUnderline: { height: 1, backgroundColor: "#CCCCCC", marginTop: 2 },

  // Photo
  photoPlaceholder: { height: 120, borderRadius: 12, borderWidth: 1.5, borderColor: "#CCCCCC", borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#F9F9F9", marginTop: 4 },
  photoPlaceholderIcon: { fontSize: 32 },
  photoPlaceholderText: { fontSize: 15, color: "#888888", fontWeight: "500" },
  photoPreviewContainer: { marginTop: 4, gap: 8 },
  photoPreview: { width: "100%", height: 180, borderRadius: 12 },
  photoActions: { flexDirection: "row", gap: 10 },
  photoActionBtn: { flex: 1, height: 38, borderRadius: 50, borderWidth: 1.5, borderColor: PURPLE, alignItems: "center", justifyContent: "center" },
  photoActionText: { color: PURPLE, fontSize: 14, fontWeight: "600" },
  photoRemoveBtn: { borderColor: "#DC2626" },
  photoRemoveText: { color: "#DC2626", fontSize: 14, fontWeight: "600" },

  // Buttons
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtnCancel: { flex: 1, height: 52, borderRadius: 50, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#CCCCCC" },
  modalBtnCancelText: { color: "#666666", fontSize: 16, fontWeight: "500" },
  modalBtnSave: { flex: 2, height: 52, borderRadius: 50, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center", shadowColor: PURPLE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  modalBtnSaveText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },

  // Photo Picker
  pickerOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  pickerSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  pickerTitle: { fontSize: 18, fontWeight: "700", color: "#1A2E22", marginBottom: 20, textAlign: "center" },
  pickerOption: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14 },
  pickerOptionIcon: { fontSize: 28 },
  pickerOptionLabel: { fontSize: 16, fontWeight: "600", color: "#111111" },
  pickerOptionSub: { fontSize: 13, color: "#888888", marginTop: 2 },
  pickerDivider: { height: 1, backgroundColor: "#EEEEEE" },
  pickerCancelBtn: { marginTop: 20, height: 52, borderRadius: 50, borderWidth: 1.5, borderColor: "#CCCCCC", alignItems: "center", justifyContent: "center" },
  pickerCancelText: { color: "#666666", fontSize: 16, fontWeight: "500" },
});
