import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, SafeAreaView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { saveRecipe, updateRecipe, computeRecipeTotals } from '../utils/recipeStorage';

const MACRO_COLORS = { protein: '#4FC3F7', carbs: '#81C784', fat: '#FFB74D' };

export default function CreateRecipeScreen({ navigation, route }) {
  // If editing an existing recipe, it's passed in via route.params.recipe
  const existing = route.params?.recipe ?? null;

  const [name, setName] = useState(existing?.name ?? '');
  const [ingredients, setIngredients] = useState(existing?.ingredients ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  // When FoodDetailScreen returns an ingredient (mode='recipe'), it lands here
  useEffect(() => {
    const ingredient = route.params?.ingredient;
    if (!ingredient) return;
    setIngredients((prev) => [...prev, { ...ingredient, id: Date.now().toString() }]);
    // Clear the param so re-focuses don't re-add
    navigation.setParams({ ingredient: undefined });
  }, [route.params?.ingredient]);

  const totals = computeRecipeTotals(ingredients);

  const handleRemoveIngredient = (id) => {
    setIngredients((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please give your recipe a name.');
      return;
    }
    if (ingredients.length === 0) {
      Alert.alert('No ingredients', 'Add at least one ingredient before saving.');
      return;
    }

    const recipeData = { name: name.trim(), ingredients, notes };

    if (existing) {
      await updateRecipe({ ...existing, ...recipeData });
    } else {
      await saveRecipe(recipeData);
    }

    navigation.navigate('RecipesList');
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
          <Text style={styles.title}>{existing ? 'Edit Recipe' : 'New Recipe'}</Text>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* Recipe Name */}
          <Text style={styles.label}>RECIPE NAME</Text>
          <TextInput
            style={styles.nameInput}
            placeholder="e.g. Chicken Stir Fry"
            placeholderTextColor="#444"
            value={name}
            onChangeText={setName}
            returnKeyType="done"
          />

          {/* Ingredients */}
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>INGREDIENTS</Text>
            <TouchableOpacity
              style={styles.addIngredientBtn}
              onPress={() => navigation.navigate('FoodSearchRecipe', { mode: 'recipe' })}
            >
              <Ionicons name="add" size={18} color="#FF6B35" />
              <Text style={styles.addIngredientText}>Add</Text>
            </TouchableOpacity>
          </View>

          {ingredients.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyIngredients}
              onPress={() => navigation.navigate('FoodSearchRecipe', { mode: 'recipe' })}
            >
              <Ionicons name="search" size={20} color="#555" />
              <Text style={styles.emptyIngredientsText}>Search or scan to add ingredients</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.ingredientList}>
              {ingredients.map((ing) => (
                <View key={ing.id} style={styles.ingredientRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ingName} numberOfLines={1}>{ing.name}</Text>
                    <Text style={styles.ingServing}>{ing.servingLabel}</Text>
                    <View style={styles.ingMacroRow}>
                      <Text style={styles.ingCals}>{Math.round(ing.calories)} cal</Text>
                      <Text style={[styles.ingMacro, { color: MACRO_COLORS.protein }]}>P {ing.protein}g</Text>
                      <Text style={[styles.ingMacro, { color: MACRO_COLORS.carbs }]}>C {ing.carbs}g</Text>
                      <Text style={[styles.ingMacro, { color: MACRO_COLORS.fat }]}>F {ing.fat}g</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveIngredient(ing.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={20} color="#555" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Macro total row */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalCals}>{totals.calories} cal</Text>
                <Text style={[styles.totalMacro, { color: MACRO_COLORS.protein }]}>P {totals.protein}g</Text>
                <Text style={[styles.totalMacro, { color: MACRO_COLORS.carbs }]}>C {totals.carbs}g</Text>
                <Text style={[styles.totalMacro, { color: MACRO_COLORS.fat }]}>F {totals.fat}g</Text>
              </View>
            </View>
          )}

          {/* Notes */}
          <Text style={[styles.label, { marginTop: 20 }]}>INSTRUCTIONS & NOTES</Text>
          <TextInput
            style={styles.notesInput}
            placeholder={'Add cooking instructions, tips, or any notes here...\n\ne.g.\n1. Preheat pan to medium-high\n2. Season chicken with salt and pepper\n3. Cook 6 min per side'}
            placeholderTextColor="#444"
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
          />

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  saveBtn: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 18,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  scroll: { paddingHorizontal: 16 },
  label: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
    marginTop: 4,
  },
  nameInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  addIngredientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  addIngredientText: { color: '#FF6B35', fontSize: 13, fontWeight: '600' },
  emptyIngredients: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderStyle: 'dashed',
    marginBottom: 8,
  },
  emptyIngredientsText: { color: '#555', fontSize: 14 },
  ingredientList: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    gap: 10,
  },
  ingName: { color: '#fff', fontSize: 14, fontWeight: '500' },
  ingServing: { color: '#555', fontSize: 11, marginTop: 2 },
  ingMacroRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ingCals: { color: '#FF6B35', fontSize: 12, fontWeight: '600' },
  ingMacro: { fontSize: 11, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: '#141414',
  },
  totalLabel: { color: '#666', fontSize: 12, fontWeight: '700', flex: 1 },
  totalCals: { color: '#FF6B35', fontSize: 13, fontWeight: '700' },
  totalMacro: { fontSize: 12, fontWeight: '700' },
  notesInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 14,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    minHeight: 200,
  },
});
