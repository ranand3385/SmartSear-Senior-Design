import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addFoodEntry } from '../utils/macroStorage';

const MACRO_COLORS = {
  calories: '#FF6B35',
  protein: '#4FC3F7',
  carbs: '#81C784',
  fat: '#FFB74D',
};

const SERVING_PRESETS = [0.5, 1, 1.5, 2, 3];

export default function FoodDetailScreen({ navigation, route }) {
  const { food, meal, mode } = route.params;
  const isRecipeMode = mode === 'recipe';
  const [servings, setServings] = useState(1);
  const [customServings, setCustomServings] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const effectiveServings = useCustom ? parseFloat(customServings) || 1 : servings;

  // Scale macros by servings
  const scaled = {
    calories: Math.round(food.calories * effectiveServings),
    protein: Math.round(food.protein * effectiveServings * 10) / 10,
    carbs: Math.round(food.carbs * effectiveServings * 10) / 10,
    fat: Math.round(food.fat * effectiveServings * 10) / 10,
  };

  const servingLabel = `${effectiveServings === 1 ? '' : `${effectiveServings}x `}${food.servingSize}`;

  const handleAdd = async () => {
    if (effectiveServings <= 0 || isNaN(effectiveServings)) {
      Alert.alert('Invalid serving', 'Please enter a valid serving amount.');
      return;
    }
    const entry = { name: food.name, brand: food.brand ?? null, servingLabel, ...scaled };

    if (isRecipeMode) {
      // Return ingredient to CreateRecipeScreen via navigation params
      navigation.navigate('CreateRecipe', { ingredient: entry });
    } else {
      await addFoodEntry(meal, entry);
      navigation.navigate('MacrosHome');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>Add to {meal}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Food Info */}
          <View style={styles.foodCard}>
            <Text style={styles.foodName}>{food.name}</Text>
            {food.brand && <Text style={styles.foodBrand}>{food.brand}</Text>}
            <Text style={styles.foodServing}>Per serving: {food.servingSize}</Text>
          </View>

          {/* Macro Summary */}
          <View style={styles.macroGrid}>
            {[
              { key: 'calories', label: 'Calories', unit: '' },
              { key: 'protein', label: 'Protein', unit: 'g' },
              { key: 'carbs', label: 'Carbs', unit: 'g' },
              { key: 'fat', label: 'Fat', unit: 'g' },
            ].map(({ key, label, unit }) => (
              <View key={key} style={styles.macroCell}>
                <Text style={[styles.macroValue, { color: MACRO_COLORS[key] }]}>
                  {scaled[key]}{unit}
                </Text>
                <Text style={styles.macroLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Serving Selector */}
          <Text style={styles.sectionLabel}>SERVINGS</Text>

          <View style={styles.presetRow}>
            {SERVING_PRESETS.map((p) => {
              const active = !useCustom && servings === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.presetBtn, active && styles.presetBtnActive]}
                  onPress={() => { setServings(p); setUseCustom(false); setCustomServings(''); }}
                >
                  <Text style={[styles.presetText, active && styles.presetTextActive]}>{p}x</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.customRow}>
            <Text style={styles.customLabel}>Custom:</Text>
            <TextInput
              style={[styles.customInput, useCustom && styles.customInputActive]}
              keyboardType="decimal-pad"
              placeholder="e.g. 2.5"
              placeholderTextColor="#444"
              value={customServings}
              onFocus={() => setUseCustom(true)}
              onChangeText={(v) => { setCustomServings(v); setUseCustom(true); }}
            />
            <Text style={styles.customUnit}>servings</Text>
          </View>

          {/* Per-serving breakdown */}
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>Nutritional Info (per serving)</Text>
            {[
              { label: 'Calories', value: `${food.calories} kcal` },
              { label: 'Protein', value: `${food.protein}g` },
              { label: 'Carbohydrates', value: `${food.carbs}g` },
              { label: 'Fat', value: `${food.fat}g` },
            ].map(({ label, value }) => (
              <View key={label} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{label}</Text>
                <Text style={styles.breakdownValue}>{value}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Add Button */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={22} color="#fff" />
            <Text style={styles.addBtnText}>
              {isRecipeMode
                ? `Add ${scaled.calories} cal to Recipe`
                : `Add ${scaled.calories} cal to ${meal}`}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 20 },

  foodCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 4,
  },
  foodName: { color: '#fff', fontSize: 17, fontWeight: '700', lineHeight: 24 },
  foodBrand: { color: '#888', fontSize: 13 },
  foodServing: { color: '#555', fontSize: 12, marginTop: 4 },

  macroGrid: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 20,
    overflow: 'hidden',
  },
  macroCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: '#2a2a2a',
  },
  macroValue: { fontSize: 18, fontWeight: '700' },
  macroLabel: { color: '#666', fontSize: 11, marginTop: 2 },

  sectionLabel: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 10,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  presetBtn: {
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: '#1a1a1a',
  },
  presetBtnActive: { borderColor: '#FF6B35', backgroundColor: '#2a1508' },
  presetText: { color: '#aaa', fontSize: 15, fontWeight: '600' },
  presetTextActive: { color: '#FF6B35' },

  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  customLabel: { color: '#666', fontSize: 14 },
  customInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#fff',
    fontSize: 15,
  },
  customInputActive: { borderColor: '#FF6B35' },
  customUnit: { color: '#555', fontSize: 13 },

  breakdownCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 10,
  },
  breakdownTitle: { color: '#666', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownLabel: { color: '#888', fontSize: 14 },
  breakdownValue: { color: '#fff', fontSize: 14, fontWeight: '500' },

  footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  addBtn: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
