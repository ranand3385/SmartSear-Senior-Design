// ─── USDA FoodData Central + Open Food Facts API ────────────────────────────
const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY ?? 'DEMO_KEY';
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

// Nutrient IDs we care about
const NUTRIENT_IDS = {
  calories: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
};

/**
 * Extract macros from a USDA food nutrients array.
 * For Branded foods the API returns values per serving — no scaling needed.
 */
function extractNutrients(nutrients = []) {
  const result = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const n of nutrients) {
    const id = n.nutrientId ?? n.nutrient?.id;
    const value = n.value ?? n.amount ?? 0;
    if (id === NUTRIENT_IDS.calories) result.calories = Math.round(value);
    else if (id === NUTRIENT_IDS.protein) result.protein = Math.round(value * 10) / 10;
    else if (id === NUTRIENT_IDS.carbs) result.carbs = Math.round(value * 10) / 10;
    else if (id === NUTRIENT_IDS.fat) result.fat = Math.round(value * 10) / 10;
  }
  // If no calorie value was found but macros exist, derive it from the Atwater factors
  if (result.calories === 0 && (result.protein > 0 || result.carbs > 0 || result.fat > 0)) {
    result.calories = Math.round(result.protein * 4 + result.carbs * 4 + result.fat * 9);
  }
  return result;
}

/**
 * Build a human-readable serving label from USDA food fields.
 * Prefers householdServingFullText (e.g. "1 cup", "2 tbsp") over raw grams.
 */
function buildServingLabel(food) {
  const household = food.householdServingFullText?.trim();
  const size = food.servingSize;
  const unit = (food.servingSizeUnit ?? 'g').toLowerCase();

  if (household && size) return `${household} (${size}${unit})`;
  if (household) return household;
  if (size) return `${size}${unit}`;
  return '1 serving';
}

/**
 * Search USDA FoodData Central — Branded + Foundation.
 * Branded: nutrients per serving, real label serving sizes.
 * Foundation: highly accurate whole-food data, nutrients per 100g (labeled clearly).
 */
export async function searchFoodByQuery(query) {
  const params = new URLSearchParams({
    query,
    api_key: USDA_API_KEY,
    dataType: 'Branded,Foundation',
    pageSize: 30,
  });

  const res = await fetch(`${USDA_BASE}/foods/search?${params}`);
  if (!res.ok) throw new Error(`USDA search failed: ${res.status}`);
  const data = await res.json();

  return (data.foods ?? []).map((food) => {
    const isBranded = food.dataType === 'Branded';
    return {
      fdcId: food.fdcId,
      name: food.description,
      brand: food.brandOwner ?? food.brandName ?? null,
      // Foundation foods don't have a serving size — show per 100g clearly
      servingSize: isBranded ? buildServingLabel(food) : '100g',
      servingGrams: isBranded ? (food.servingSize ?? 100) : 100,
      ...extractNutrients(food.foodNutrients),
    };
  });
}

/**
 * Fetch a single food by FDC ID.
 */
export async function getFoodById(fdcId) {
  const res = await fetch(`${USDA_BASE}/food/${fdcId}?api_key=${USDA_API_KEY}`);
  if (!res.ok) throw new Error(`USDA fetch failed: ${res.status}`);
  const food = await res.json();

  return {
    fdcId: food.fdcId,
    name: food.description,
    brand: food.brandOwner ?? food.brandName ?? null,
    servingSize: buildServingLabel(food),
    servingGrams: food.servingSize ?? 100,
    ...extractNutrients(food.foodNutrients),
  };
}

/**
 * Look up a food by barcode.
 * Tries Open Food Facts first (best serving size data), falls back to USDA Branded.
 */
export async function searchFoodByBarcode(barcode) {
  // Try Open Food Facts first — it has the most complete serving size info
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    );
    const data = await res.json();

    if (data.status === 1 && data.product) {
      const p = data.product;
      const n = p.nutriments ?? {};

      // Prefer per-serving values; fall back to per-100g only if no serving defined
      const hasServing = p.serving_size && n['energy-kcal_serving'] != null;

      return {
        fdcId: null,
        name: p.product_name || p.generic_name || 'Unknown Product',
        brand: p.brands ?? null,
        servingSize: p.serving_size ?? '100g',
        servingGrams: parseFloat(p.serving_quantity) || 100,
        calories: Math.round(
          hasServing ? n['energy-kcal_serving'] : n['energy-kcal_100g'] ?? 0
        ),
        protein: Math.round(
          ((hasServing ? n['proteins_serving'] : n['proteins_100g']) ?? 0) * 10
        ) / 10,
        carbs: Math.round(
          ((hasServing ? n['carbohydrates_serving'] : n['carbohydrates_100g']) ?? 0) * 10
        ) / 10,
        fat: Math.round(
          ((hasServing ? n['fat_serving'] : n['fat_100g']) ?? 0) * 10
        ) / 10,
      };
    }
  } catch (_) {
    // fall through to USDA
  }

  // Fallback: USDA Branded search by GTIN/UPC
  const params = new URLSearchParams({
    query: barcode,
    api_key: USDA_API_KEY,
    dataType: 'Branded',
    pageSize: 1,
  });
  const res = await fetch(`${USDA_BASE}/foods/search?${params}`);
  if (!res.ok) throw new Error('Barcode not found in any database');
  const data = await res.json();
  if (!data.foods?.length) throw new Error('Barcode not found');

  const food = data.foods[0];
  return {
    fdcId: food.fdcId,
    name: food.description,
    brand: food.brandOwner ?? null,
    servingSize: buildServingLabel(food),
    servingGrams: food.servingSize ?? 100,
    ...extractNutrients(food.foodNutrients),
  };
}
