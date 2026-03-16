import { useRef, useState, useEffect, useCallback } from "react";
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
import MapView, { Marker, Polygon, Polyline, MapPressEvent, Region, PROVIDER_GOOGLE, LatLng } from "react-native-maps";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { classifyRisk, formatIRQ, calcularRisco, type RiskResult, type IRQFormState } from "@/lib/irq";
import { sincronizarArvore, sincronizarRegiao, deletarArvoreRemota, deletarRegiaoRemota } from "@/lib/sync";
import type { IrqParametros } from "@/drizzle/schema";
import { useNetworkSync, marcarArvorePendente, marcarRegiaoPendente, type SyncStatus } from "@/hooks/use-network-sync";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { getApiBaseUrl } from "@/constants/oauth";

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

export interface RegionPolygon {
  id: string;
  coordinates: LatLng[];
  titulo: string;
  descricao: string;
  fotoUri: string | null;
  criadoEm: string;
}

interface MarkerModalState {
  visible: boolean;
  latitude: number;
  longitude: number;
  nomeCientifico: string;
  descricao: string;
  fotoUri: string | null;
  editingId: string | null;
}

interface RegionModalState {
  visible: boolean;
  titulo: string;
  descricao: string;
  fotoUri: string | null;
  editingId: string | null;
}

// "tree" = placing tree markers, "polygon" = drawing polygon vertices, "none" = view only
type MapMode = "tree" | "polygon" | "none";

const STORAGE_KEY = "@arvore_marcadores_v3";
const STORAGE_REGIONS_KEY = "@arvore_regioes_v1";
const PURPLE = "#5B2EBE";
const POLYGON_FILL = "rgba(91,46,190,0.18)";
const POLYGON_STROKE = "#5B2EBE";

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

/** Returns centroid of a polygon for label/tap detection */
function centroid(coords: LatLng[]): LatLng {
  const lat = coords.reduce((s, c) => s + c.latitude, 0) / coords.length;
  const lng = coords.reduce((s, c) => s + c.longitude, 0) / coords.length;
  return { latitude: lat, longitude: lng };
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

  // Tree markers
  const [markers, setMarkers] = useState<TreeMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<TreeMarker | null>(null);
  const [markerModal, setMarkerModal] = useState<MarkerModalState>({
    visible: false, latitude: 0, longitude: 0, nomeCientifico: "", descricao: "", fotoUri: null, editingId: null,
  });

  // Region polygons
  const [regions, setRegions] = useState<RegionPolygon[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<RegionPolygon | null>(null);
  const [regionModal, setRegionModal] = useState<RegionModalState>({
    visible: false, titulo: "", descricao: "", fotoUri: null, editingId: null,
  });

  // Drawing state
  const [mapMode, setMapMode] = useState<MapMode>("none");
  const [drawingCoords, setDrawingCoords] = useState<LatLng[]>([]);

  // Photo picker — shared between tree and region modals
  const [photoTarget, setPhotoTarget] = useState<"tree" | "region">("tree");
  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);

  // Sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [pendingCount, setPendingCount] = useState(0);

  // KMZ export
  const [exportingKmz, setExportingKmz] = useState(false);

  // Monitoramento de rede e sync automático de pendentes
  const { syncPending } = useNetworkSync({
    onStatusChange: (status) => setSyncStatus(status),
    onPendingCountChange: (count) => setPendingCount(count),
  });

  // IRQ
  const [irqModalVisible, setIrqModalVisible] = useState(false);
  const [irqMarkerId, setIrqMarkerId] = useState<string | null>(null);
  const [irqForm, setIrqForm] = useState<IRQFormState>(emptyIRQForm);
  const [irqResult, setIrqResult] = useState<RiskResult | null>(null);

  // ── Persist & load ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) setMarkers(JSON.parse(stored));
        const storedRegions = await AsyncStorage.getItem(STORAGE_REGIONS_KEY);
        if (storedRegions) setRegions(JSON.parse(storedRegions));
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(markers)).catch(() => {});
  }, [markers]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_REGIONS_KEY, JSON.stringify(regions)).catch(() => {});
  }, [regions]);

  // ── Location ────────────────────────────────────────────────────────────────
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
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
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

  // ── Photo handlers ──────────────────────────────────────────────────────────
  const handleTakePhoto = useCallback(async () => {
    setPhotoPickerVisible(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão necessária", "Permita o acesso à câmera para tirar uma foto.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1.0, exif: false });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      if (photoTarget === "tree") setMarkerModal((m) => ({ ...m, fotoUri: uri }));
      else setRegionModal((m) => ({ ...m, fotoUri: uri }));
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [photoTarget]);

  const handlePickGallery = useCallback(async () => {
    setPhotoPickerVisible(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão necessária", "Permita o acesso à galeria para selecionar uma foto.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 1.0, exif: false,
    });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      if (photoTarget === "tree") setMarkerModal((m) => ({ ...m, fotoUri: uri }));
      else setRegionModal((m) => ({ ...m, fotoUri: uri }));
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [photoTarget]);

  // ── Map press ───────────────────────────────────────────────────────────────
  const handleMapPress = useCallback((e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;

    if (mapMode === "polygon") {
      // Add vertex to drawing
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDrawingCoords((prev) => [...prev, { latitude, longitude }]);
      return;
    }

    if (mapMode === "tree") {
      // Close any open panels
      setSelectedMarker(null);
      setSelectedRegion(null);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setMarkerModal({ visible: true, latitude, longitude, nomeCientifico: "", descricao: "", fotoUri: null, editingId: null });
      return;
    }

    // "none" mode — dismiss panels
    setSelectedMarker(null);
    setSelectedRegion(null);
  }, [mapMode]);

  // ── Tree marker handlers ────────────────────────────────────────────────────
  const handleMarkerPress = useCallback((marker: TreeMarker) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRegion(null);
    setSelectedMarker(marker);
  }, []);

  const handleSaveMarker = useCallback(() => {
    if (!markerModal.nomeCientifico.trim()) {
      Alert.alert("Campo obrigatório", "Informe o nome científico da árvore.");
      return;
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let savedMarker: TreeMarker;
    if (markerModal.editingId) {
      setMarkers((prev) =>
        prev.map((m) => {
          if (m.id === markerModal.editingId) {
            savedMarker = { ...m, nomeCientifico: markerModal.nomeCientifico.trim(), descricao: markerModal.descricao.trim(), fotoUri: markerModal.fotoUri };
            return savedMarker;
          }
          return m;
        })
      );
    } else {
      savedMarker = {
        id: Date.now().toString(),
        latitude: markerModal.latitude,
        longitude: markerModal.longitude,
        nomeCientifico: markerModal.nomeCientifico.trim(),
        descricao: markerModal.descricao.trim(),
        fotoUri: markerModal.fotoUri,
        criadoEm: new Date().toLocaleString("pt-BR"),
        irq: null, riskLabel: null, riskColor: null,
      };
      setMarkers((prev) => [...prev, savedMarker]);
    }
    setMarkerModal((m) => ({ ...m, visible: false }));

    // Sincronizar com backend em background
    setSyncStatus("syncing");
    sincronizarArvore({
      id: savedMarker!.id,
      nomeCientifico: savedMarker!.nomeCientifico,
      descricao: savedMarker!.descricao,
      fotoUri: savedMarker!.fotoUri ?? undefined,
      latitude: savedMarker!.latitude,
      longitude: savedMarker!.longitude,
      irqValor: savedMarker!.irq ?? undefined,
      irqClassificacao: savedMarker!.riskLabel ?? undefined,
      pinColor: savedMarker!.riskColor ?? undefined,
    }).then((ok) => {
      if (!ok) {
        marcarArvorePendente(savedMarker!.id);
        setPendingCount((c) => c + 1);
      }
      setSyncStatus(ok ? "ok" : "error");
    }).catch(() => {
      marcarArvorePendente(savedMarker!.id);
      setPendingCount((c) => c + 1);
      setSyncStatus("error");
    });
  }, [markerModal]);

  const handleEditMarker = useCallback((marker: TreeMarker) => {
    setSelectedMarker(null);
    setMarkerModal({ visible: true, latitude: marker.latitude, longitude: marker.longitude, nomeCientifico: marker.nomeCientifico, descricao: marker.descricao, fotoUri: marker.fotoUri ?? null, editingId: marker.id });
  }, []);

  const handleDeleteMarker = useCallback((id: string) => {
    Alert.alert("Remover árvore", "Deseja remover este marcador do mapa?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: () => {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setMarkers((prev) => prev.filter((m) => m.id !== id));
        setSelectedMarker(null);
        // Remover do backend em background
        deletarArvoreRemota(id).catch(() => {});
      }},
    ]);
  }, []);

  // ── Polygon / region handlers ───────────────────────────────────────────────
  const handleStartDrawing = useCallback(() => {
    setSelectedMarker(null);
    setSelectedRegion(null);
    setDrawingCoords([]);
    setMapMode("polygon");
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleUndoVertex = useCallback(() => {
    setDrawingCoords((prev) => prev.slice(0, -1));
  }, []);

  const handleCancelDrawing = useCallback(() => {
    setDrawingCoords([]);
    setMapMode("none");
  }, []);

  const handleFinishPolygon = useCallback(() => {
    if (drawingCoords.length < 3) {
      Alert.alert("Polígono inválido", "Adicione pelo menos 3 pontos para fechar a região.");
      return;
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMapMode("none");
    // Open region modal to fill title/description/photo
    setRegionModal({ visible: true, titulo: "", descricao: "", fotoUri: null, editingId: null });
  }, [drawingCoords]);

  const handleSaveRegion = useCallback(() => {
    if (!regionModal.titulo.trim()) {
      Alert.alert("Campo obrigatório", "Informe o título da região.");
      return;
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (regionModal.editingId) {
      setRegions((prev) =>
        prev.map((r) =>
          r.id === regionModal.editingId
            ? { ...r, titulo: regionModal.titulo.trim(), descricao: regionModal.descricao.trim(), fotoUri: regionModal.fotoUri }
            : r
        )
      );
    } else {
      const newRegion: RegionPolygon = {
        id: Date.now().toString(),
        coordinates: drawingCoords,
        titulo: regionModal.titulo.trim(),
        descricao: regionModal.descricao.trim(),
        fotoUri: regionModal.fotoUri,
        criadoEm: new Date().toLocaleString("pt-BR"),
      };
      setRegions((prev) => [...prev, newRegion]);
      setDrawingCoords([]);
      // Sincronizar nova região com backend
      setSyncStatus("syncing");
      sincronizarRegiao({
        id: newRegion.id,
        titulo: newRegion.titulo,
        descricao: newRegion.descricao,
        fotoUri: newRegion.fotoUri ?? undefined,
        coordenadas: newRegion.coordinates,
      }).then((ok) => {
        if (!ok) {
          marcarRegiaoPendente(newRegion.id);
          setPendingCount((c) => c + 1);
        }
        setSyncStatus(ok ? "ok" : "error");
      }).catch(() => {
        marcarRegiaoPendente(newRegion.id);
        setPendingCount((c) => c + 1);
        setSyncStatus("error");
      });
    }
    setRegionModal((m) => ({ ...m, visible: false }));
  }, [regionModal, drawingCoords]);

  const handleRegionPress = useCallback((region: RegionPolygon) => {
    if (mapMode !== "none") return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMarker(null);
    setSelectedRegion(region);
  }, [mapMode]);

  const handleEditRegion = useCallback((region: RegionPolygon) => {
    setSelectedRegion(null);
    setRegionModal({ visible: true, titulo: region.titulo, descricao: region.descricao, fotoUri: region.fotoUri ?? null, editingId: region.id });
  }, []);

  const handleDeleteRegion = useCallback((id: string) => {
    Alert.alert("Remover região", "Deseja remover esta região demarcada?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: () => {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setRegions((prev) => prev.filter((r) => r.id !== id));
        setSelectedRegion(null);
        // Remover do backend em background
        deletarRegiaoRemota(id).catch(() => {});
      }},
    ]);
  }, []);

  // ── IRQ handlers ────────────────────────────────────────────────────────────
  const handleOpenIRQ = useCallback((marker: TreeMarker) => {
    setSelectedMarker(null);
    setIrqMarkerId(marker.id);
    setIrqForm(emptyIRQForm);
    setIrqResult(null);
    setIrqModalVisible(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleCalculateIRQ = useCallback(() => {
    const irq = calcularRisco(irqForm);
    const result = classifyRisk(irq);
    setIrqResult(result);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [irqForm]);

  const handleSaveIRQ = useCallback(() => {
    if (!irqResult) { Alert.alert("Calcule primeiro", "Pressione 'Calcular' antes de salvar."); return; }
    let updatedMarker: TreeMarker | undefined;
    setMarkers((prev) =>
      prev.map((m) => {
        if (m.id === irqMarkerId) {
          updatedMarker = { ...m, irq: irqResult.index, riskLabel: irqResult.label, riskColor: irqResult.pinColor };
          return updatedMarker;
        }
        return m;
      })
    );
    setIrqModalVisible(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Sincronizar IRQ atualizado com backend
    if (updatedMarker) {
      setSyncStatus("syncing");
      sincronizarArvore({
        id: updatedMarker.id,
        nomeCientifico: updatedMarker.nomeCientifico,
        descricao: updatedMarker.descricao,
        fotoUri: updatedMarker.fotoUri ?? undefined,
        latitude: updatedMarker.latitude,
        longitude: updatedMarker.longitude,
        irqValor: irqResult.index,
        irqClassificacao: irqResult.label,
        irqParametros: {
          diametroCopa: parseNum(irqForm.diametroCopa) || undefined,
          alturaGeral: parseNum(irqForm.alturaGeral) || undefined,
          alturaRamificacao: parseNum(irqForm.alturaRamificacao) || undefined,
          dap: parseNum(irqForm.dap) || undefined,
          dcolo: parseNum(irqForm.dcolo) || undefined,
          anguloInclinacao: parseNum(irqForm.anguloInclinacao) || undefined,
          coloDiagnosticado: parseNum(irqForm.coloDiagnosticado) || undefined,
          ramificacaoV: irqForm.ramificacaoV || undefined,
          corpoFrutificacao: irqForm.corpoFrutificacao || undefined,
        } satisfies IrqParametros,
        pinColor: irqResult.pinColor,
      }).then((ok) => {
        if (!ok) {
          marcarArvorePendente(updatedMarker!.id);
          setPendingCount((c) => c + 1);
        }
        setSyncStatus(ok ? "ok" : "error");
      }).catch(() => {
        marcarArvorePendente(updatedMarker!.id);
        setPendingCount((c) => c + 1);
        setSyncStatus("error");
      });
    }
  }, [irqResult, irqMarkerId, irqForm]);

  // ── Center ──────────────────────────────────────────────────────────────────
  const handleCenterUser = useCallback(() => {
    if (!userLocation) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current?.animateToRegion({ ...userLocation, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 600);
  }, [userLocation]);

  // ── Export KMZ ──────────────────────────────────────────────────────────────
  const handleExportKmz = useCallback(async () => {
    if (exportingKmz) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExportingKmz(true);
    try {
      const baseUrl = getApiBaseUrl();
      const kmzUrl = `${baseUrl}/api/kmz`;
      const today = new Date().toISOString().slice(0, 10);
      const localUri = FileSystem.documentDirectory + `risco-queda-${today}.kmz`;

      // Baixar o arquivo KMZ para o armazenamento local do app
      const downloadResult = await FileSystem.downloadAsync(kmzUrl, localUri);

      if (downloadResult.status !== 200) {
        Alert.alert("Erro", "Não foi possível gerar o arquivo KMZ. Verifique a conexão com o servidor.");
        return;
      }

      // Verificar se o sharing está disponível
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Indisponível", "O compartilhamento não está disponível neste dispositivo.");
        return;
      }

      // Abrir o share sheet nativo
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: "application/vnd.google-earth.kmz",
        dialogTitle: "Exportar mapa KMZ",
        UTI: "com.google.earth.kmz",
      });

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.warn("[KMZ] Erro ao exportar:", err);
      Alert.alert("Erro", "Falha ao exportar o arquivo KMZ.");
    } finally {
      setExportingKmz(false);
    }
  }, [exportingKmz]);

  const defaultRegion: Region = {
    latitude: userLocation?.latitude ?? -14.235,
    longitude: userLocation?.longitude ?? -51.9253,
    latitudeDelta: userLocation ? 0.005 : 30,
    longitudeDelta: userLocation ? 0.005 : 30,
  };

  const isDrawing = mapMode === "polygon";
  const isTreeMode = mapMode === "tree";

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
          {/* Tree markers */}
          {markers.map((marker) => (
            <Marker
              key={marker.id}
              coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
              onPress={() => handleMarkerPress(marker)}
              pinColor={marker.riskColor ?? "#2D6A4F"}
            />
          ))}

          {/* Saved region polygons */}
          {regions.map((region) => (
            <Polygon
              key={region.id}
              coordinates={region.coordinates}
              fillColor={POLYGON_FILL}
              strokeColor={POLYGON_STROKE}
              strokeWidth={2.5}
              tappable
              onPress={() => handleRegionPress(region)}
            />
          ))}

          {/* Drawing preview — polyline connecting vertices */}
          {isDrawing && drawingCoords.length >= 2 && (
            <Polyline
              coordinates={drawingCoords}
              strokeColor={POLYGON_STROKE}
              strokeWidth={2.5}
              lineDashPattern={[8, 4]}
            />
          )}

          {/* Drawing preview — closing line back to first vertex */}
          {isDrawing && drawingCoords.length >= 3 && (
            <Polyline
              coordinates={[drawingCoords[drawingCoords.length - 1], drawingCoords[0]]}
              strokeColor={POLYGON_STROKE}
              strokeWidth={1.5}
              lineDashPattern={[4, 6]}
            />
          )}

          {/* Vertex markers during drawing */}
          {isDrawing && drawingCoords.map((coord, i) => (
            <Marker
              key={`vertex-${i}`}
              coordinate={coord}
              anchor={{ x: 0.5, y: 0.5 }}
              pinColor={i === 0 ? "#DC2626" : POLYGON_STROKE}
            />
          ))}

          {/* Centroid markers for saved regions (tappable label) */}
          {regions.map((region) => (
            <Marker
              key={`region-label-${region.id}`}
              coordinate={centroid(region.coordinates)}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => handleRegionPress(region)}
            >
              <View style={styles.regionLabelMarker}>
                <Text style={styles.regionLabelText} numberOfLines={1}>{region.titulo}</Text>
              </View>
            </Marker>
          ))}
        </MapView>

        {/* Sync status indicator */}
        {syncStatus !== "idle" && (
          <View style={[
            styles.syncBadge,
            syncStatus === "ok" && { backgroundColor: "rgba(22,163,74,0.92)" },
            (syncStatus === "error" || syncStatus === "offline") && { backgroundColor: "rgba(220,38,38,0.92)" },
          ]}>
            {syncStatus === "syncing" && <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />}
            <Text style={styles.syncBadgeText}>
              {syncStatus === "syncing"
                ? "Sincronizando..."
                : syncStatus === "ok"
                ? "✓ Sincronizado"
                : syncStatus === "offline"
                ? `⚠ Sem conexão${pendingCount > 0 ? ` · ${pendingCount} pendente${pendingCount !== 1 ? "s" : ""}` : ""}`
                : `⚠ Falha${pendingCount > 0 ? ` · ${pendingCount} pendente${pendingCount !== 1 ? "s" : ""}` : " (salvo localmente)"}`}
            </Text>
            {(syncStatus === "error") && pendingCount > 0 && (
              <TouchableOpacity
                onPress={() => { setSyncStatus("syncing"); syncPending(); }}
                style={styles.syncRetryBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.syncRetryText}>↻</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

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

        {/* Hint banner */}
        {!loadingLocation && !locationError && !isDrawing && mapMode === "none" && (
          <View style={styles.hintBanner}>
            <Text style={styles.hintText}>Toque no mapa para marcar uma árvore</Text>
          </View>
        )}
        {!loadingLocation && !locationError && isTreeMode && (
          <View style={[styles.hintBanner, { backgroundColor: "rgba(45,106,79,0.92)" }]}>
            <Text style={[styles.hintText, { color: "#FFFFFF" }]}>Toque no mapa para marcar uma árvore</Text>
          </View>
        )}

        {/* Drawing toolbar */}
        {isDrawing && (
          <View style={styles.drawingToolbar}>
            <View style={styles.drawingInfo}>
              <Text style={styles.drawingInfoText}>
                {drawingCoords.length === 0
                  ? "Toque no mapa para adicionar pontos"
                  : `${drawingCoords.length} ponto${drawingCoords.length !== 1 ? "s" : ""} — toque para continuar`}
              </Text>
            </View>
            <View style={styles.drawingActions}>
              {drawingCoords.length > 0 && (
                <TouchableOpacity style={styles.drawingBtnUndo} onPress={handleUndoVertex} activeOpacity={0.8}>
                  <Text style={styles.drawingBtnUndoText}>↩ Desfazer</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.drawingBtnCancel} onPress={handleCancelDrawing} activeOpacity={0.8}>
                <Text style={styles.drawingBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawingBtnFinish, drawingCoords.length < 3 && { opacity: 0.45 }]}
                onPress={handleFinishPolygon}
                activeOpacity={0.85}
              >
                <Text style={styles.drawingBtnFinishText}>✓ Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Mode toggle buttons (bottom-left area) */}
        {!isDrawing && (
          <View style={styles.modeButtons}>
            <TouchableOpacity
              style={[styles.modeBtn, mapMode === "tree" && styles.modeBtnActive]}
              onPress={() => setMapMode(mapMode === "tree" ? "none" : "tree")}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeBtnText, mapMode === "tree" && styles.modeBtnTextActive]}>🌳 Árvore</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, styles.modeBtnRegion]}
              onPress={handleStartDrawing}
              activeOpacity={0.8}
            >
              <Text style={styles.modeBtnRegionText}>⬡ Região</Text>
            </TouchableOpacity>
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

        {/* Export KMZ button */}
        {!isDrawing && (
          <TouchableOpacity
            style={[styles.kmzBtn, exportingKmz && { opacity: 0.6 }]}
            onPress={handleExportKmz}
            activeOpacity={0.8}
            disabled={exportingKmz}
          >
            {exportingKmz
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.kmzBtnText}>KMZ</Text>
            }
          </TouchableOpacity>
        )}

        {/* Center button */}
        {userLocation && (
          <TouchableOpacity style={styles.centerBtn} onPress={handleCenterUser} activeOpacity={0.8}>
            <Text style={styles.centerBtnIcon}>◎</Text>
          </TouchableOpacity>
        )}

        {/* Count badges */}
        {(markers.length > 0 || regions.length > 0) && !isDrawing && (
          <View style={styles.countBadge}>
            {markers.length > 0 && (
              <Text style={styles.countText}>🌳 {markers.length}</Text>
            )}
            {regions.length > 0 && (
              <Text style={[styles.countText, markers.length > 0 && { marginLeft: 8 }]}>⬡ {regions.length}</Text>
            )}
          </View>
        )}
      </View>

      {/* ── Tree Detail Bottom Sheet ─────────────────────────────────────────── */}
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
                IRQ: {classifyRisk(selectedMarker.irq).normalized}%
              </Text>
              <View style={[styles.riskBadgePill, { backgroundColor: classifyRisk(selectedMarker.irq).borderColor }]}>
                <Text style={styles.riskBadgePillText}>{selectedMarker.riskLabel}</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.irqPromptBtn} onPress={() => handleOpenIRQ(selectedMarker)} activeOpacity={0.8}>
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
              <TouchableOpacity style={[styles.detailBtn, styles.detailBtnIRQ]} onPress={() => handleOpenIRQ(selectedMarker)} activeOpacity={0.8}>
                <Text style={styles.detailBtnIRQText}>Recalcular IRQ</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.detailBtn, styles.detailBtnEdit]} onPress={() => handleEditMarker(selectedMarker)} activeOpacity={0.8}>
              <Text style={styles.detailBtnEditText}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.detailBtn, styles.detailBtnDelete]} onPress={() => handleDeleteMarker(selectedMarker.id)} activeOpacity={0.8}>
              <Text style={styles.detailBtnDeleteText}>Remover</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Region Detail Bottom Sheet ───────────────────────────────────────── */}
      {selectedRegion && (
        <View style={styles.detailSheet}>
          <View style={styles.detailHandle} />
          {selectedRegion.fotoUri ? (
            <Image source={{ uri: selectedRegion.fotoUri }} style={styles.detailPhoto} resizeMode="cover" />
          ) : null}
          <View style={styles.detailHeader}>
            {!selectedRegion.fotoUri && (
              <View style={[styles.detailTreeIcon, { backgroundColor: "#EDE9FE" }]}>
                <Text style={styles.detailTreeEmoji}>⬡</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.detailName}>{selectedRegion.titulo}</Text>
              <Text style={styles.detailDate}>{selectedRegion.criadoEm} · {selectedRegion.coordinates.length} pontos</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedRegion(null)} style={styles.detailClose}>
              <Text style={styles.detailCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          {selectedRegion.descricao ? (
            <Text style={styles.detailDesc}>{selectedRegion.descricao}</Text>
          ) : (
            <Text style={styles.detailDescEmpty}>Sem descrição.</Text>
          )}
          <View style={styles.detailActions}>
            <TouchableOpacity style={[styles.detailBtn, styles.detailBtnEdit]} onPress={() => handleEditRegion(selectedRegion)} activeOpacity={0.8}>
              <Text style={styles.detailBtnEditText}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.detailBtn, styles.detailBtnDelete]} onPress={() => handleDeleteRegion(selectedRegion.id)} activeOpacity={0.8}>
              <Text style={styles.detailBtnDeleteText}>Remover</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Tree Add/Edit Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={markerModal.visible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={() => setMarkerModal((m) => ({ ...m, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalKAV} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
            <View style={styles.modalSheet}>
              <View style={styles.detailHandle} />
              <Text style={styles.modalTitle}>{markerModal.editingId ? "Editar Árvore" : "Cadastrar Árvore"}</Text>
              <Text style={styles.modalCoords}>{markerModal.latitude.toFixed(6)}, {markerModal.longitude.toFixed(6)}</Text>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScrollContent}>
                <Text style={styles.inputLabel}>Nome Científico *</Text>
                <TextInput
                  style={styles.textInput}
                  value={markerModal.nomeCientifico}
                  onChangeText={(v) => setMarkerModal((m) => ({ ...m, nomeCientifico: v }))}
                  placeholder="Ex: Ficus benjamina"
                  placeholderTextColor="#AAAAAA"
                  returnKeyType="next"
                  autoCapitalize="sentences"
                />
                <View style={styles.inputUnderline} />
                <Text style={[styles.inputLabel, { marginTop: 20 }]}>Descrição do Estado</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={markerModal.descricao}
                  onChangeText={(v) => setMarkerModal((m) => ({ ...m, descricao: v }))}
                  placeholder="Descreva brevemente o estado da árvore..."
                  placeholderTextColor="#AAAAAA"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  returnKeyType="done"
                  autoCapitalize="sentences"
                />
                <View style={styles.inputUnderline} />
                <Text style={[styles.inputLabel, { marginTop: 20 }]}>Foto da Árvore</Text>
                {markerModal.fotoUri ? (
                  <View style={styles.photoPreviewContainer}>
                    <Image source={{ uri: markerModal.fotoUri }} style={styles.photoPreview} resizeMode="cover" />
                    <View style={styles.photoActions}>
                      <TouchableOpacity style={styles.photoActionBtn} onPress={() => { setPhotoTarget("tree"); setPhotoPickerVisible(true); }} activeOpacity={0.8}>
                        <Text style={styles.photoActionText}>Trocar foto</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.photoActionBtn, styles.photoRemoveBtn]} onPress={() => setMarkerModal((m) => ({ ...m, fotoUri: null }))} activeOpacity={0.8}>
                        <Text style={styles.photoRemoveText}>Remover</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.photoPlaceholder} onPress={() => { setPhotoTarget("tree"); setPhotoPickerVisible(true); }} activeOpacity={0.8}>
                    <Text style={styles.photoPlaceholderIcon}>📷</Text>
                    <Text style={styles.photoPlaceholderText}>Adicionar foto</Text>
                  </TouchableOpacity>
                )}
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setMarkerModal((m) => ({ ...m, visible: false }))} activeOpacity={0.75}>
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalBtnSave} onPress={handleSaveMarker} activeOpacity={0.85}>
                    <Text style={styles.modalBtnSaveText}>{markerModal.editingId ? "Salvar" : "Cadastrar"}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Region Add/Edit Modal ────────────────────────────────────────────── */}
      <Modal
        visible={regionModal.visible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={() => setRegionModal((m) => ({ ...m, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalKAV} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
            <View style={styles.modalSheet}>
              <View style={styles.detailHandle} />
              <Text style={styles.modalTitle}>{regionModal.editingId ? "Editar Região" : "Cadastrar Região"}</Text>
              {!regionModal.editingId && (
                <Text style={styles.modalCoords}>{drawingCoords.length} pontos demarcados</Text>
              )}
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScrollContent}>
                <Text style={styles.inputLabel}>Título *</Text>
                <TextInput
                  style={styles.textInput}
                  value={regionModal.titulo}
                  onChangeText={(v) => setRegionModal((m) => ({ ...m, titulo: v }))}
                  placeholder="Ex: Área de preservação norte"
                  placeholderTextColor="#AAAAAA"
                  returnKeyType="next"
                  autoCapitalize="sentences"
                />
                <View style={styles.inputUnderline} />
                <Text style={[styles.inputLabel, { marginTop: 20 }]}>Descrição</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={regionModal.descricao}
                  onChangeText={(v) => setRegionModal((m) => ({ ...m, descricao: v }))}
                  placeholder="Descreva brevemente esta região..."
                  placeholderTextColor="#AAAAAA"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  returnKeyType="done"
                  autoCapitalize="sentences"
                />
                <View style={styles.inputUnderline} />
                <Text style={[styles.inputLabel, { marginTop: 20 }]}>Foto da Região</Text>
                {regionModal.fotoUri ? (
                  <View style={styles.photoPreviewContainer}>
                    <Image source={{ uri: regionModal.fotoUri }} style={styles.photoPreview} resizeMode="cover" />
                    <View style={styles.photoActions}>
                      <TouchableOpacity style={styles.photoActionBtn} onPress={() => { setPhotoTarget("region"); setPhotoPickerVisible(true); }} activeOpacity={0.8}>
                        <Text style={styles.photoActionText}>Trocar foto</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.photoActionBtn, styles.photoRemoveBtn]} onPress={() => setRegionModal((m) => ({ ...m, fotoUri: null }))} activeOpacity={0.8}>
                        <Text style={styles.photoRemoveText}>Remover</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.photoPlaceholder} onPress={() => { setPhotoTarget("region"); setPhotoPickerVisible(true); }} activeOpacity={0.8}>
                    <Text style={styles.photoPlaceholderIcon}>📷</Text>
                    <Text style={styles.photoPlaceholderText}>Adicionar foto</Text>
                  </TouchableOpacity>
                )}
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => { setRegionModal((m) => ({ ...m, visible: false })); if (!regionModal.editingId) setDrawingCoords([]); }} activeOpacity={0.75}>
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalBtnSave} onPress={handleSaveRegion} activeOpacity={0.85}>
                    <Text style={styles.modalBtnSaveText}>{regionModal.editingId ? "Salvar" : "Cadastrar"}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Photo Picker Action Sheet ────────────────────────────────────────── */}
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

      {/* ── IRQ Calculator Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={irqModalVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={() => setIrqModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalKAV} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
            <View style={[styles.modalSheet, { maxHeight: SCREEN_HEIGHT * 0.92 }]}>
              <View style={styles.detailHandle} />
              <Text style={styles.modalTitle}>Calcular Risco (IRQ)</Text>
              <Text style={[styles.modalCoords, { marginBottom: 12 }]}>Preencha os dados para calcular o índice</Text>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScrollContent}>
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
                    <Text style={[irqStyles.resultIndex, { color: irqResult.color }]}>{irqResult.normalized}%</Text>
                    <View style={[irqStyles.riskBadge, { backgroundColor: irqResult.borderColor }]}>
                      <Text style={irqStyles.riskBadgeText}>{irqResult.label}</Text>
                    </View>
                  </View>
                )}
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setIrqModalVisible(false)} activeOpacity={0.75}>
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtnSave, !irqResult && { opacity: 0.5 }]} onPress={handleSaveIRQ} activeOpacity={0.85}>
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

  // Drawing toolbar
  drawingToolbar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFFFFF", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 32, shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 6 },
  drawingInfo: { backgroundColor: "#F3F0FF", borderRadius: 10, padding: 10, marginBottom: 12, alignItems: "center" },
  drawingInfoText: { color: PURPLE, fontSize: 13, fontWeight: "600" },
  drawingActions: { flexDirection: "row", gap: 8 },
  drawingBtnUndo: { flex: 1, height: 44, borderRadius: 50, borderWidth: 1.5, borderColor: "#888", alignItems: "center", justifyContent: "center" },
  drawingBtnUndoText: { color: "#444", fontSize: 14, fontWeight: "600" },
  drawingBtnCancel: { flex: 1, height: 44, borderRadius: 50, borderWidth: 1.5, borderColor: "#DC2626", alignItems: "center", justifyContent: "center" },
  drawingBtnCancelText: { color: "#DC2626", fontSize: 14, fontWeight: "600" },
  drawingBtnFinish: { flex: 1.5, height: 44, borderRadius: 50, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center" },
  drawingBtnFinishText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },

  // Mode buttons
  modeButtons: { position: "absolute", bottom: 24, left: 16, flexDirection: "row", gap: 8 },
  modeBtn: { height: 40, paddingHorizontal: 14, borderRadius: 50, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4, borderWidth: 1.5, borderColor: "#E5E7EB" },
  modeBtnActive: { backgroundColor: "#2D6A4F", borderColor: "#2D6A4F" },
  modeBtnText: { fontSize: 13, fontWeight: "600", color: "#444" },
  modeBtnTextActive: { color: "#FFFFFF" },
  modeBtnRegion: { backgroundColor: PURPLE, borderColor: PURPLE },
  modeBtnRegionText: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },

  // Region label marker
  regionLabelMarker: { backgroundColor: "rgba(91,46,190,0.85)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 120 },
  regionLabelText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },

  legend: { position: "absolute", top: 16, right: 16, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 10, padding: 10, gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: "#444", fontWeight: "500" },

  centerBtn: { position: "absolute", bottom: 24, right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  centerBtnIcon: { fontSize: 22, color: PURPLE },
  kmzBtn: { position: "absolute", bottom: 80, right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center", shadowColor: PURPLE, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4, elevation: 5 },
  kmzBtnText: { fontSize: 11, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.5 },
  countBadge: { position: "absolute", bottom: 72, left: 16, backgroundColor: "#2D6A4F", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
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

  irqPromptBtn: { backgroundColor: "#F0FDF4", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#BBF7D0", alignItems: "center" },
  irqPromptText: { color: "#166534", fontSize: 14, fontWeight: "600" },
  riskBadgeContainer: { borderRadius: 12, borderWidth: 1.5, padding: 12, alignItems: "center", gap: 6 },
  riskBadgeLabel: { fontSize: 13, fontWeight: "700" },
  riskBadgePill: { borderRadius: 100, paddingHorizontal: 14, paddingVertical: 4 },
  riskBadgePillText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  modalKAV: { justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40, maxHeight: SCREEN_HEIGHT * 0.88 },
  modalScrollContent: { paddingBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#1A2E22", marginBottom: 4 },
  modalCoords: { fontSize: 12, color: "#AAAAAA", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", marginBottom: 20 },
  inputLabel: { fontSize: 14, color: "#666666", marginBottom: 6, fontWeight: "400" },
  textInput: { fontSize: 17, color: "#111111", paddingVertical: 4, paddingHorizontal: 0, backgroundColor: "transparent" },
  textArea: { minHeight: 80, fontSize: 15, lineHeight: 22 },
  inputUnderline: { height: 1, backgroundColor: "#CCCCCC", marginTop: 2 },

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

  modalButtons: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtnCancel: { flex: 1, height: 52, borderRadius: 50, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#CCCCCC" },
  modalBtnCancelText: { color: "#666666", fontSize: 16, fontWeight: "500" },
  modalBtnSave: { flex: 2, height: 52, borderRadius: 50, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center", shadowColor: PURPLE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  modalBtnSaveText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },

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
  syncBadge: { position: "absolute", top: 12, alignSelf: "center", flexDirection: "row", alignItems: "center", backgroundColor: "rgba(91,46,190,0.92)", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, zIndex: 30 },
  syncBadgeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  syncRetryBtn: { marginLeft: 8, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 12, width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  syncRetryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", lineHeight: 20 },
});
