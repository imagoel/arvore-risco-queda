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
import { classifyRisk, formatIRQ, calcularRisco, type IRQFormState } from "@/lib/irq";

// FormState é o mesmo que IRQFormState exportado de lib/irq.ts
type FormState = IRQFormState;

// ─── Sub-components ──────────────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder=""
        placeholderTextColor="#AAAAAA"
        returnKeyType="done"
        underlineColorAndroid="transparent"
      />
      <View style={styles.inputUnderline} />
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
  return (
    <TouchableOpacity
      style={styles.checkboxRow}
      onPress={() => {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onToggle();
      }}
      activeOpacity={0.75}
    >
      <View style={[styles.checkbox, value && styles.checkboxChecked]}>
        {value && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
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
  coloDiagnosticado: "",
  ramificacaoV: false,
  corpoFrutificacao: false,
};

export default function HomeScreen() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [result, setResult] = useState<ReturnType<typeof classifyRisk> | null>(null);

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
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header com borda vermelha */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>RISCO DE QUEDA DE ÁRVORE</Text>
          <Text style={styles.headerSubtitle}>Índice de Risco — IRQ</Text>
        </View>

        {/* Campos */}
        <FieldInput
          label="Diâmetro da Copa"
          value={form.diametroCopa}
          onChangeText={(v) => setField("diametroCopa", v)}
        />
        <FieldInput
          label="Altura Geral"
          value={form.alturaGeral}
          onChangeText={(v) => setField("alturaGeral", v)}
        />
        <FieldInput
          label="Altura da 1ª Ramificação"
          value={form.alturaRamificacao}
          onChangeText={(v) => setField("alturaRamificacao", v)}
        />
        <FieldInput
          label="DAP"
          value={form.dap}
          onChangeText={(v) => setField("dap", v)}
        />
        <FieldInput
          label="DCOLO"
          value={form.dcolo}
          onChangeText={(v) => setField("dcolo", v)}
        />
        <FieldInput
          label="Ângulo de Inclinação"
          value={form.anguloInclinacao}
          onChangeText={(v) => setField("anguloInclinacao", v)}
        />
        <FieldInput
          label="Colo Diagnosticado (Soma)"
          value={form.coloDiagnosticado}
          onChangeText={(v) => setField("coloDiagnosticado", v)}
        />

        {/* Checkboxes */}
        <View style={styles.checkboxSection}>
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

        {/* Botões */}
        <TouchableOpacity
          style={styles.btnCalcular}
          onPress={handleCalcular}
          activeOpacity={0.85}
        >
          <Text style={styles.btnCalcularText}>Calcular Risco</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnLimpar}
          onPress={handleLimpar}
          activeOpacity={0.75}
        >
          <Text style={styles.btnLimparText}>Limpar</Text>
        </TouchableOpacity>

        {/* Resultado */}
        {result !== null && (
          <View
            style={[
              styles.resultCard,
              { backgroundColor: result.bgColor, borderColor: result.borderColor },
            ]}
          >
            <Text style={[styles.resultLabel, { color: result.color }]}>
              Índice de Risco de Queda
            </Text>
            <Text style={[styles.resultIndex, { color: result.color }]}>
              {result.normalized}%
            </Text>
            <View style={[styles.riskBadge, { backgroundColor: result.borderColor }]}>
              <Text style={styles.riskBadgeText}>{result.label}</Text>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const PURPLE = "#5B2EBE";
const PURPLE_LIGHT = "#7C4DFF";

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // Header
  header: {
    borderWidth: 2,
    borderColor: "#CC0000",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 24,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111111",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333333",
    textAlign: "center",
    marginTop: 4,
  },

  // Fields
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 6,
    fontWeight: "400",
  },
  input: {
    fontSize: 18,
    color: "#111111",
    paddingVertical: 4,
    paddingHorizontal: 0,
    fontWeight: "400",
    backgroundColor: "transparent",
  },
  inputUnderline: {
    height: 1,
    backgroundColor: "#CCCCCC",
    marginTop: 2,
  },

  // Checkboxes
  checkboxSection: {
    gap: 14,
    marginBottom: 28,
    marginTop: 8,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkboxChecked: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  checkboxLabel: {
    fontSize: 17,
    color: "#111111",
    fontWeight: "400",
  },

  // Buttons
  btnCalcular: {
    backgroundColor: PURPLE,
    borderRadius: 50,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: PURPLE_LIGHT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnCalcularText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  btnLimpar: {
    borderRadius: 50,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#CCCCCC",
    marginBottom: 24,
  },
  btnLimparText: {
    color: "#666666",
    fontSize: 16,
    fontWeight: "500",
  },

  // Result
  resultCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 24,
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  resultLabel: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  resultIndex: {
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: -1,
  },
  riskBadge: {
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginTop: 4,
  },
  riskBadgeText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
