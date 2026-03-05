import AsyncStorage from '@react-native-async-storage/async-storage';

const GOALS_KEY = '@smartpan_goals';

export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

export const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 225,
  fat: 65,
};

// ─── Date helpers ────────────────────────────────────────────────────────────

export function todayKey() {
  return new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
}

function storageKey(dateKey) {
  return `@smartpan_log_${dateKey}`;
}

// ─── Food log ────────────────────────────────────────────────────────────────

/**
 * Load the food log for a given date.
 * Returns { Breakfast: [], Lunch: [], Dinner: [], Snacks: [] }
 */
export async function loadLog(dateKey = todayKey()) {
  try {
    const raw = await AsyncStorage.getItem(storageKey(dateKey));
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { Breakfast: [], Lunch: [], Dinner: [], Snacks: [] };
}

/**
 * Add a food entry to a meal.
 * entry: { id, name, brand, calories, protein, carbs, fat, servingLabel, servings }
 */
export async function addFoodEntry(meal, entry, dateKey = todayKey()) {
  const log = await loadLog(dateKey);
  log[meal] = [...(log[meal] ?? []), { ...entry, id: Date.now().toString() }];
  await AsyncStorage.setItem(storageKey(dateKey), JSON.stringify(log));
  return log;
}

/**
 * Remove a food entry by id from a meal.
 */
export async function removeFoodEntry(meal, entryId, dateKey = todayKey()) {
  const log = await loadLog(dateKey);
  log[meal] = (log[meal] ?? []).filter((e) => e.id !== entryId);
  await AsyncStorage.setItem(storageKey(dateKey), JSON.stringify(log));
  return log;
}

// ─── Totals ──────────────────────────────────────────────────────────────────

export function computeTotals(log) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const meal of MEALS) {
    for (const entry of log[meal] ?? []) {
      totals.calories += entry.calories ?? 0;
      totals.protein += entry.protein ?? 0;
      totals.carbs += entry.carbs ?? 0;
      totals.fat += entry.fat ?? 0;
    }
  }
  totals.calories = Math.round(totals.calories);
  totals.protein = Math.round(totals.protein * 10) / 10;
  totals.carbs = Math.round(totals.carbs * 10) / 10;
  totals.fat = Math.round(totals.fat * 10) / 10;
  return totals;
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export async function loadGoals() {
  try {
    const raw = await AsyncStorage.getItem(GOALS_KEY);
    if (raw) return { ...DEFAULT_GOALS, ...JSON.parse(raw) };
  } catch (_) {}
  return DEFAULT_GOALS;
}

export async function saveGoals(goals) {
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}
