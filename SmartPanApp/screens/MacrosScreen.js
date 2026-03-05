import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  loadLog,
  loadGoals,
  saveGoals,
  removeFoodEntry,
  computeTotals,
  MEALS,
  todayKey,
} from '../utils/macroStorage';

const MACRO_COLORS = {
  calories: '#FF6B35',
  protein: '#4FC3F7',
  carbs: '#81C784',
  fat: '#FFB74D',
};

export default function MacrosScreen({ navigation }) {
  const [log, setLog] = useState({ Breakfast: [], Lunch: [], Dinner: [], Snacks: [] });
  const [goals, setGoals] = useState({ calories: 2000, protein: 150, carbs: 225, fat: 65 });
  const [goalsModalVisible, setGoalsModalVisible] = useState(false);

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  useFocusEffect(
    useCallback(() => {
      loadLog(todayKey()).then(setLog);
      loadGoals().then(setGoals);
    }, [])
  );

  const totals = computeTotals(log);

  const handleDelete = (meal, entryId) => {
    Alert.alert('Remove food?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const updated = await removeFoodEntry(meal, entryId);
          setLog({ ...updated });
        },
      },
    ]);
  };

  const handleSaveGoals = async (newGoals) => {
    await saveGoals(newGoals);
    setGoals(newGoals);
    setGoalsModalVisible(false);
  };

  const caloriesPct = Math.min(totals.calories / goals.calories, 1);
  const remaining = Math.max(goals.calories - totals.calories, 0);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Nutrition</Text>
          <Text style={styles.headerDate}>{dateLabel}</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => setGoalsModalVisible(true)}
        >
          <Ionicons name="options-outline" size={22} color="#888" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Calories Card */}
        <View style={styles.caloriesCard}>
          <View style={styles.caloriesRow}>
            <View>
              <Text style={styles.caloriesNum}>{totals.calories.toLocaleString()}</Text>
              <Text style={styles.caloriesLabel}>calories eaten</Text>
            </View>
            <View style={styles.calDivider} />
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.caloriesNum, { color: remaining === 0 ? '#e74c3c' : '#fff' }]}>
                {remaining.toLocaleString()}
              </Text>
              <Text style={styles.caloriesLabel}>remaining</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {
              width: `${caloriesPct * 100}%`,
              backgroundColor: caloriesPct >= 1 ? '#e74c3c' : MACRO_COLORS.calories,
            }]} />
          </View>
          <Text style={styles.goalText}>Goal: {goals.calories.toLocaleString()} cal</Text>
        </View>

        {/* Macro Bars */}
        <View style={styles.macroRow}>
          {[
            { key: 'protein', label: 'Protein', unit: 'g' },
            { key: 'carbs', label: 'Carbs', unit: 'g' },
            { key: 'fat', label: 'Fat', unit: 'g' },
          ].map(({ key, label, unit }) => {
            const pct = Math.min(totals[key] / goals[key], 1);
            return (
              <View key={key} style={styles.macroCard}>
                <Text style={[styles.macroValue, { color: MACRO_COLORS[key] }]}>
                  {totals[key]}{unit}
                </Text>
                <View style={styles.macroTrack}>
                  <View style={[styles.macroFill, { width: `${pct * 100}%`, backgroundColor: MACRO_COLORS[key] }]} />
                </View>
                <Text style={styles.macroLabel}>{label}</Text>
                <Text style={styles.macroGoal}>/ {goals[key]}{unit}</Text>
              </View>
            );
          })}
        </View>

        {/* Meal Sections */}
        {MEALS.map((meal) => (
          <MealSection
            key={meal}
            meal={meal}
            entries={log[meal] ?? []}
            onAdd={() => navigation.navigate('FoodSearch', { meal })}
            onDelete={(id) => handleDelete(meal, id)}
          />
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Goals Modal */}
      <Modal
        visible={goalsModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setGoalsModalVisible(false)}
      >
        <GoalsEditor
          currentGoals={goals}
          onSave={handleSaveGoals}
          onClose={() => setGoalsModalVisible(false)}
        />
      </Modal>
    </SafeAreaView>
  );
}

// ─── Goals Editor ─────────────────────────────────────────────────────────────

function GoalsEditor({ currentGoals, onSave, onClose }) {
  const [protein, setProtein] = useState(String(currentGoals.protein));
  const [carbs, setCarbs] = useState(String(currentGoals.carbs));
  const [fat, setFat] = useState(String(currentGoals.fat));
  const [calorieOverride, setCalorieOverride] = useState('');
  const [useOverride, setUseOverride] = useState(false);

  const p = parseFloat(protein) || 0;
  const c = parseFloat(carbs) || 0;
  const f = parseFloat(fat) || 0;

  // Calories derived from macros (the nutritional math)
  const derivedCalories = Math.round(p * 4 + c * 4 + f * 9);
  const overrideCals = parseInt(calorieOverride) || 0;
  const finalCalories = useOverride && overrideCals > 0 ? overrideCals : derivedCalories;

  // Warn if override deviates more than 10% from macro math
  const deviation = useOverride && overrideCals > 0
    ? Math.abs(overrideCals - derivedCalories) / derivedCalories
    : 0;
  const showWarning = useOverride && deviation > 0.1;

  const handleSave = () => {
    if (p <= 0 || c <= 0 || f <= 0) {
      Alert.alert('Invalid Goals', 'All macro goals must be greater than 0.');
      return;
    }
    if (finalCalories <= 0) {
      Alert.alert('Invalid Goals', 'Calorie goal must be greater than 0.');
      return;
    }
    onSave({ calories: finalCalories, protein: p, carbs: c, fat: f });
  };

  return (
    <SafeAreaView style={modalStyles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={modalStyles.header}>
          <Text style={modalStyles.title}>Daily Goals</Text>
          <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
            <Ionicons name="close" size={24} color="#888" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modalStyles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={modalStyles.hint}>
            Set your daily macro targets. Calories are automatically calculated from your macros
            (protein × 4 + carbs × 4 + fat × 9).
          </Text>

          {/* Macro Inputs */}
          {[
            { label: 'Protein', unit: 'g', color: MACRO_COLORS.protein, value: protein, onChange: setProtein, cal: `${Math.round(p * 4)} cal` },
            { label: 'Carbohydrates', unit: 'g', color: MACRO_COLORS.carbs, value: carbs, onChange: setCarbs, cal: `${Math.round(c * 4)} cal` },
            { label: 'Fat', unit: 'g', color: MACRO_COLORS.fat, value: fat, onChange: setFat, cal: `${Math.round(f * 9)} cal` },
          ].map(({ label, unit, color, value, onChange, cal }) => (
            <View key={label} style={modalStyles.inputRow}>
              <View style={[modalStyles.colorDot, { backgroundColor: color }]} />
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.inputLabel}>{label}</Text>
                <Text style={modalStyles.inputCal}>{cal}</Text>
              </View>
              <TextInput
                style={modalStyles.input}
                keyboardType="decimal-pad"
                value={value}
                onChangeText={onChange}
                selectTextOnFocus
              />
              <Text style={modalStyles.inputUnit}>{unit}</Text>
            </View>
          ))}

          {/* Derived Calories */}
          <View style={modalStyles.derivedCard}>
            <View style={modalStyles.derivedRow}>
              <Ionicons name="flame" size={16} color="#FF6B35" />
              <Text style={modalStyles.derivedLabel}>Calories from macros</Text>
              <Text style={modalStyles.derivedValue}>{derivedCalories} cal</Text>
            </View>
            <View style={modalStyles.derivedBreakdown}>
              <Text style={modalStyles.derivedSub}>
                {Math.round(p * 4)} + {Math.round(c * 4)} + {Math.round(f * 9)} = {derivedCalories}
              </Text>
            </View>
          </View>

          {/* Optional calorie override */}
          <TouchableOpacity
            style={modalStyles.overrideToggle}
            onPress={() => { setUseOverride(!useOverride); setCalorieOverride(''); }}
          >
            <Ionicons
              name={useOverride ? 'checkbox' : 'square-outline'}
              size={20}
              color={useOverride ? '#FF6B35' : '#555'}
            />
            <Text style={modalStyles.overrideLabel}>Set custom calorie goal</Text>
          </TouchableOpacity>

          {useOverride && (
            <View style={modalStyles.inputRow}>
              <View style={[modalStyles.colorDot, { backgroundColor: '#FF6B35' }]} />
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.inputLabel}>Calorie Goal</Text>
              </View>
              <TextInput
                style={[modalStyles.input, showWarning && modalStyles.inputWarning]}
                keyboardType="number-pad"
                value={calorieOverride}
                onChangeText={setCalorieOverride}
                placeholder={String(derivedCalories)}
                placeholderTextColor="#444"
                selectTextOnFocus
                autoFocus
              />
              <Text style={modalStyles.inputUnit}>cal</Text>
            </View>
          )}

          {showWarning && (
            <View style={modalStyles.warningCard}>
              <Ionicons name="warning-outline" size={16} color="#FFB74D" />
              <Text style={modalStyles.warningText}>
                Your calorie goal is {Math.round(deviation * 100)}% off from your macro total
                ({derivedCalories} cal). This is unusual — double-check your numbers.
              </Text>
            </View>
          )}

          <Text style={modalStyles.finalGoal}>
            Final calorie goal: <Text style={{ color: '#FF6B35', fontWeight: '700' }}>{finalCalories} cal</Text>
          </Text>
        </ScrollView>

        {/* Save Button */}
        <View style={modalStyles.footer}>
          <TouchableOpacity style={modalStyles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={modalStyles.saveBtnText}>Save Goals</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Meal Section ─────────────────────────────────────────────────────────────

function MealSection({ meal, entries, onAdd, onDelete }) {
  const mealIcons = {
    Breakfast: 'sunny-outline',
    Lunch: 'partly-sunny-outline',
    Dinner: 'moon-outline',
    Snacks: 'cafe-outline',
  };
  const mealCals = entries.reduce((s, e) => s + (e.calories ?? 0), 0);

  return (
    <View style={mealStyles.section}>
      <View style={mealStyles.header}>
        <View style={mealStyles.headerLeft}>
          <Ionicons name={mealIcons[meal]} size={16} color="#888" />
          <Text style={mealStyles.mealName}>{meal}</Text>
          {mealCals > 0 && <Text style={mealStyles.mealCals}>{Math.round(mealCals)} cal</Text>}
        </View>
        <TouchableOpacity style={mealStyles.addBtn} onPress={onAdd}>
          <Ionicons name="add" size={20} color="#FF6B35" />
        </TouchableOpacity>
      </View>

      {entries.length === 0 ? (
        <Text style={mealStyles.empty}>Tap + to add food</Text>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={mealStyles.entry}>
            <View style={{ flex: 1 }}>
              <Text style={mealStyles.entryName} numberOfLines={1}>{entry.name}</Text>
              {entry.brand && <Text style={mealStyles.entryBrand} numberOfLines={1}>{entry.brand}</Text>}
              <Text style={mealStyles.entryServing}>{entry.servingLabel}</Text>
            </View>
            <View style={mealStyles.entryMacros}>
              <Text style={mealStyles.entryCals}>{Math.round(entry.calories)} cal</Text>
              <View style={mealStyles.entryMacroRow}>
                <Text style={[mealStyles.entryMacro, { color: MACRO_COLORS.protein }]}>P {entry.protein}g</Text>
                <Text style={[mealStyles.entryMacro, { color: MACRO_COLORS.carbs }]}>C {entry.carbs}g</Text>
                <Text style={[mealStyles.entryMacro, { color: MACRO_COLORS.fat }]}>F {entry.fat}g</Text>
              </View>
            </View>
            {/* Visible delete button */}
            <TouchableOpacity
              style={mealStyles.deleteBtn}
              onPress={() => onDelete(entry.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={16} color="#e74c3c" />
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '700' },
  headerDate: { color: '#666', fontSize: 13, marginTop: 2 },
  settingsBtn: { padding: 6 },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  caloriesCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 18,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  caloriesRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  caloriesNum: { color: '#fff', fontSize: 32, fontWeight: '700' },
  caloriesLabel: { color: '#666', fontSize: 12, marginTop: 2 },
  calDivider: { flex: 1 },
  progressTrack: {
    height: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: '100%', borderRadius: 4 },
  goalText: { color: '#555', fontSize: 12 },
  macroRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  macroCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 4,
  },
  macroValue: { fontSize: 18, fontWeight: '700' },
  macroTrack: { height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 2 },
  macroLabel: { color: '#aaa', fontSize: 11, fontWeight: '600' },
  macroGoal: { color: '#555', fontSize: 10 },
});

const mealStyles = StyleSheet.create({
  section: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealName: { color: '#ccc', fontSize: 14, fontWeight: '600' },
  mealCals: { color: '#555', fontSize: 12 },
  addBtn: { padding: 4 },
  empty: { color: '#444', fontSize: 13, paddingHorizontal: 16, paddingVertical: 12 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
    gap: 10,
  },
  entryName: { color: '#fff', fontSize: 14, fontWeight: '500' },
  entryBrand: { color: '#666', fontSize: 11, marginTop: 1 },
  entryServing: { color: '#555', fontSize: 11, marginTop: 2 },
  entryMacros: { alignItems: 'flex-end' },
  entryCals: { color: '#FF6B35', fontSize: 14, fontWeight: '700' },
  entryMacroRow: { flexDirection: 'row', gap: 6, marginTop: 3 },
  entryMacro: { fontSize: 10, fontWeight: '600' },
  deleteBtn: { paddingLeft: 8 },
});

const modalStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  closeBtn: { padding: 4 },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  hint: { color: '#666', fontSize: 13, lineHeight: 19, marginBottom: 24 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  inputLabel: { color: '#ccc', fontSize: 14, fontWeight: '500' },
  inputCal: { color: '#555', fontSize: 11, marginTop: 2 },
  input: {
    backgroundColor: '#252525',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    width: 72,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: '#333',
  },
  inputWarning: { borderColor: '#FFB74D' },
  inputUnit: { color: '#666', fontSize: 13, width: 16 },

  derivedCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 16,
  },
  derivedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  derivedLabel: { flex: 1, color: '#aaa', fontSize: 14 },
  derivedValue: { color: '#FF6B35', fontSize: 16, fontWeight: '700' },
  derivedBreakdown: { marginTop: 6 },
  derivedSub: { color: '#555', fontSize: 12 },

  overrideToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingVertical: 4,
  },
  overrideLabel: { color: '#888', fontSize: 14 },

  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#2a2000',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#4a3800',
    marginBottom: 12,
  },
  warningText: { flex: 1, color: '#FFB74D', fontSize: 13, lineHeight: 18 },

  finalGoal: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 8 },

  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  saveBtn: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
