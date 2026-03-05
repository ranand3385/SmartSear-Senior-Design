import AsyncStorage from '@react-native-async-storage/async-storage';

const RECIPES_KEY = '@smartpan_recipes';

/**
 * Load all saved recipes. Returns array sorted newest first.
 */
export async function loadRecipes() {
  try {
    const raw = await AsyncStorage.getItem(RECIPES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

/**
 * Save a new recipe.
 */
export async function saveRecipe(recipe) {
  const recipes = await loadRecipes();
  const newRecipe = { ...recipe, id: Date.now().toString(), createdAt: new Date().toISOString() };
  const updated = [newRecipe, ...recipes];
  await AsyncStorage.setItem(RECIPES_KEY, JSON.stringify(updated));
  return newRecipe;
}

/**
 * Update an existing recipe by id.
 */
export async function updateRecipe(recipe) {
  const recipes = await loadRecipes();
  const updated = recipes.map((r) => (r.id === recipe.id ? { ...recipe } : r));
  await AsyncStorage.setItem(RECIPES_KEY, JSON.stringify(updated));
}

/**
 * Delete a recipe by id.
 */
export async function deleteRecipe(id) {
  const recipes = await loadRecipes();
  const updated = recipes.filter((r) => r.id !== id);
  await AsyncStorage.setItem(RECIPES_KEY, JSON.stringify(updated));
}

/**
 * Compute total macros for a recipe's ingredients array.
 */
export function computeRecipeTotals(ingredients = []) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const ing of ingredients) {
    totals.calories += ing.calories ?? 0;
    totals.protein += ing.protein ?? 0;
    totals.carbs += ing.carbs ?? 0;
    totals.fat += ing.fat ?? 0;
  }
  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
  };
}
