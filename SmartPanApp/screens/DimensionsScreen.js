import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Thickness presets in inches
const THICKNESS_PRESETS = [
  { label: '½"', value: 0.5 },
  { label: '¾"', value: 0.75 },
  { label: '1"', value: 1.0 },
  { label: '1¼"', value: 1.25 },
  { label: '1½"', value: 1.5 },
  { label: '2"', value: 2.0 },
];

export default function DimensionsScreen({ navigation, route }) {
  const { meat } = route.params;
  const [thickness, setThickness] = useState(1.0);
  const [customInput, setCustomInput] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const effectiveThickness = useCustom
    ? parseFloat(customInput) || 1.0
    : thickness;

  const handlePreset = (val) => {
    setThickness(val);
    setUseCustom(false);
    setCustomInput('');
  };

  const handleNext = () => {
    if (effectiveThickness <= 0) return;
    navigation.navigate('Doneness', {
      meat,
      thicknessInches: effectiveThickness,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Dimensions</Text>
            <Text style={styles.subtitle}>{meat.icon} {meat.label}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.sectionLabel}>THICKNESS</Text>
          <Text style={styles.hint}>
            Select the approximate thickness of your {meat.label.toLowerCase()}.
            This determines cook time.
          </Text>

          {/* Preset Grid */}
          <View style={styles.presets}>
            {THICKNESS_PRESETS.map((p) => {
              const selected = !useCustom && thickness === p.value;
              return (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.presetBtn, selected && styles.presetBtnSelected]}
                  onPress={() => handlePreset(p.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.presetText, selected && styles.presetTextSelected]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom input */}
          <View style={styles.customRow}>
            <Text style={styles.customLabel}>Custom (inches):</Text>
            <TextInput
              style={[styles.customInput, useCustom && styles.customInputActive]}
              keyboardType="decimal-pad"
              placeholder="e.g. 1.75"
              placeholderTextColor="#444"
              value={customInput}
              onFocus={() => setUseCustom(true)}
              onChangeText={(val) => {
                setCustomInput(val);
                setUseCustom(true);
              }}
            />
          </View>

          {/* Preview */}
          <View style={styles.previewCard}>
            <Ionicons name="resize-outline" size={18} color="#FF6B35" />
            <Text style={styles.previewText}>
              Thickness: <Text style={styles.previewHighlight}>{effectiveThickness}"</Text>
            </Text>
          </View>
        </View>

        {/* Next Button */}
        <TouchableOpacity
          style={[styles.nextBtn, effectiveThickness <= 0 && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={effectiveThickness <= 0}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>Choose Doneness</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    marginBottom: 32,
  },
  backBtn: { padding: 4 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 14, marginTop: 2 },
  content: { flex: 1 },
  sectionLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  hint: {
    color: '#555',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  presetBtn: {
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    backgroundColor: '#1a1a1a',
  },
  presetBtnSelected: {
    borderColor: '#FF6B35',
    backgroundColor: '#2a1508',
  },
  presetText: { color: '#aaa', fontSize: 16, fontWeight: '600' },
  presetTextSelected: { color: '#FF6B35' },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  customLabel: { color: '#666', fontSize: 14 },
  customInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 16,
  },
  customInputActive: { borderColor: '#FF6B35' },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  previewText: { color: '#888', fontSize: 15 },
  previewHighlight: { color: '#FF6B35', fontWeight: '700' },
  nextBtn: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
