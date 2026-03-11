import React, { useState } from "react";
import {
  ScrollView,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface RiskResult {
  index: number;
  label: string;
  color: string;
  bgColor: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(val: string): number {
  const n = parseFloat(val.replace(",", "."));
  return isNaN(n) ? 0 : n;
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

  // IRQ = (((DiametroCopa² * (π/4)) * 0.5) * (AlturaGeral - AlturaRamificacao))
  //       * ((DAP / DCOLO) * AnguloInclinacao * 1)
  //       + ((ColoDiag1 + ColoDiag2 + ColoDiag3) * 800)
  //       + (RamificacaoV * (-800))
  //       + (CorpoFrutificacao * (-800))

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

function classifyRisk(irq: number): RiskResult {
  if (irq < 0) {
    return { index: irq, label: "Baixo", color: "#1B4332", bgColor: "#D8F3DC" };
  } else if (irq <= 5000) {
    return { index: irq, label: "Moderado", color: "#7B4F00", bgColor: "#FEF3C7" };
  } else if (irq <= 15000) {
    return { index: irq, label: "Alto", color: "#7C2D12", bgColor: "#FFEDD5" };
  } else {
    return { index: irq, label: "Muito Alto", color: "#7F1D1D", bgColor: "#FEE2E2" };
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return (
    <Text style={styles.sectionTitle}>{title}</Text>
  );
}

function FieldInput({
  label,
  unit,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  unit?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLabelContainer}>
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
        {unit ? <Text style={[styles.fieldUnit, { color: colors.muted }]}>{unit}</Text> : null}
      </View>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            color: colors.foreground,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder ?? "0"}
        placeholderTextColor={colors.muted}
        returnKeyType="done"
      />
    </View>
  );
}

function CheckboxField({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[
        styles.checkboxRow,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      onPress={() => {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onToggle();
      }}
      activeOpacity={0.75}
    >
      <View
        style={[
          styles.checkbox,
          {
            borderColor: value ? "#2D6A4F" : colors.border,
            backgroundColor: value ? "#2D6A4F" : colors.surface,
          },
        ]}
      >
        {value && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={[styles.checkboxLabel, { color: colors.foreground }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

const emptyForm: FormState = {
  diametroCopa: "",
  alturaGeral: "",
  alturaRamificacao: "",
  dap: "",
  dcolo: "",
  anguloInclinacao: "",
  coloDiag1: "",
  coloDiag2: "",
  coloDiag3: "",
  ramificacaoV: false,
  corpoFrutificacao: false,
};

export default function HomeScreen() {
  const colors = useColors();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [result, setResult] = useState<RiskResult | null>(null);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setResult(null);
  }

  function handleCalcular() {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const irq = calcularRisco(form);
    setResult(classifyRisk(irq));
  }

  function handleLimpar() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setForm(emptyForm);
    setResult(null);
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: "#2D6A4F" }]}>
            Risco de Queda de Árvore
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
            Índice de Risco — IRQ
          </Text>
        </View>

        {/* Card: Dimensões da Árvore */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SectionTitle title="Dimensões da Árvore" />
          <FieldInput
            label="Diâmetro da Copa"
            unit="m"
            value={form.diametroCopa}
            onChangeText={(v) => setField("diametroCopa", v)}
          />
          <FieldInput
            label="Altura Geral"
            unit="m"
            value={form.alturaGeral}
            onChangeText={(v) => setField("alturaGeral", v)}
          />
          <FieldInput
            label="Altura da 1ª Ramificação"
            unit="m"
            value={form.alturaRamificacao}
            onChangeText={(v) => setField("alturaRamificacao", v)}
          />
        </View>

        {/* Card: Parâmetros do Tronco */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SectionTitle title="Parâmetros do Tronco" />
          <FieldInput
            label="DAP"
            unit="cm"
            value={form.dap}
            onChangeText={(v) => setField("dap", v)}
          />
          <FieldInput
            label="DCOLO"
            unit="cm"
            value={form.dcolo}
            onChangeText={(v) => setField("dcolo", v)}
          />
          <FieldInput
            label="Ângulo de Inclinação"
            unit="°"
            value={form.anguloInclinacao}
            onChangeText={(v) => setField("anguloInclinacao", v)}
          />
        </View>

        {/* Card: Diagnóstico do Colo */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SectionTitle title="Colo Diagnosticado (Soma)" />
          <FieldInput
            label="Colo Diagnóstico 1"
            value={form.coloDiag1}
            onChangeText={(v) => setField("coloDiag1", v)}
            placeholder="0"
          />
          <FieldInput
            label="Colo Diagnóstico 2"
            value={form.coloDiag2}
            onChangeText={(v) => setField("coloDiag2", v)}
            placeholder="0"
          />
          <FieldInput
            label="Colo Diagnóstico 3"
            value={form.coloDiag3}
            onChangeText={(v) => setField("coloDiag3", v)}
            placeholder="0"
          />
        </View>

        {/* Card: Fatores de Risco */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SectionTitle title="Fatores de Risco" />
          <CheckboxField
            label="Ramificação em V"
            value={form.ramificacaoV}
            onToggle={() => setField("ramificacaoV", !form.ramificacaoV)}
          />
          <CheckboxField
            label="Corpo de Frutificação"
            value={form.corpoFrutificacao}
            onToggle={() => setField("corpoFrutificacao", !form.corpoFrutificacao)}
          />
        </View>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.btnSecondary, { borderColor: colors.border }]}
            onPress={handleLimpar}
            activeOpacity={0.75}
          >
            <Text style={[styles.btnSecondaryText, { color: colors.muted }]}>Limpar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={handleCalcular}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>Calcular Risco</Text>
          </TouchableOpacity>
        </View>

        {/* Result */}
        {result !== null && (
          <View
            style={[
              styles.resultCard,
              { backgroundColor: result.bgColor, borderColor: result.color },
            ]}
          >
            <Text style={[styles.resultLabel, { color: result.color }]}>
              Índice de Risco de Queda
            </Text>
            <Text style={[styles.resultIndex, { color: result.color }]}>
              {result.index.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <View style={[styles.riskBadge, { backgroundColor: result.color }]}>
              <Text style={styles.riskBadgeText}>Risco {result.label}</Text>
            </View>
            <Text style={[styles.resultFormula, { color: result.color }]}>
              IRQ = (((Ø copa² × π/4) × 0,5) × (Alt. Geral − Alt. Ramif.)){"\n"}
              × ((DAP / DCOLO) × Ângulo){"\n"}
              + (Colo Diag. × 800){"\n"}
              − (Ramif. V × 800) − (Corpo Frutif. × 800)
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  header: {
    alignItems: "center",
    paddingVertical: 12,
    gap: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2D6A4F",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  fieldLabelContainer: {
    flex: 1,
    gap: 1,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  fieldUnit: {
    fontSize: 12,
  },
  input: {
    width: 110,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: "500",
    textAlign: "right",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  checkboxLabel: {
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: "#2D6A4F",
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  btnSecondary: {
    width: 90,
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
  },
  resultCard: {
    borderRadius: 20,
    borderWidth: 2,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  resultLabel: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  resultIndex: {
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: -1,
  },
  riskBadge: {
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  riskBadgeText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  resultFormula: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 8,
    opacity: 0.7,
  },
});
