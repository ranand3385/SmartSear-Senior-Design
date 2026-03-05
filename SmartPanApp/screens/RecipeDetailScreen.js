import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, SafeAreaView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { deleteRecipe, computeRecipeTotals } from '../utils/recipeStorage';

const MACRO_COLORS = {
  calories: '#FF6B35',
  protein: '#4FC3F7',
  carbs: '#81C784',
  fat: '#FFB74D',
};

export default function RecipeDetailScreen({ navigation, route }) {
  const { recipe } = route.params;
  const totals = computeRecipeTotals(recipe.ingredients);

  const handleDelete = () => {
    Alert.alert('Delete Recipe', `Delete "${recipe.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRecipe(recipe.id);
          navigation.navigate('RecipesList');
        },
      },
    ]);
  };

  const date = new Date(recipe.createdAt).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('CreateRecipe', { recipe })}
          >
            <Ionicons name="pencil-outline" size={18} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={18} color="#e74c3c" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <Text style={styles.recipeName}>{recipe.name}</Text>
        <Text style={styles.recipeDate}>{date}</Text>

        {/* Macro Summary */}
        <View style={styles.macroCard}>
          <View style={styles.macroGrid}>
            {[
              { key: 'calories', label: 'Calories', unit: '' },
              { key: 'protein', label: 'Protein', unit: 'g' },
              { key: 'carbs', label: 'Carbs', unit: 'g' },
              { key: 'fat', label: 'Fat', unit: 'g' },
            ].map(({ key, label, unit }) => (
              <View key={key} style={styles.macroCell}>
                <Text style={[styles.macroValue, { color: MACRO_COLORS[key] }]}>
                  {totals[key]}{unit}
                </Text>
                <Text style={styles.macroLabel}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.macroNote}>Total for all ingredients</Text>
        </View>

        {/* Ingredients */}
        <Text style={styles.sectionTitle}>INGREDIENTS</Text>
        <View style={styles.ingredientCard}>
          {recipe.ingredients.map((ing, idx) => (
            <View
              key={ing.id ?? idx}
              style={[styles.ingRow, idx < recipe.ingredients.length - 1 && styles.ingBorder]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.ingName} numberOfLines={1}>{ing.name}</Text>
                {ing.brand && <Text style={styles.ingBrand} numberOfLines={1}>{ing.brand}</Text>}
                <Text style={styles.ingServing}>{ing.servingLabel}</Text>
              </View>
              <View style={styles.ingMacros}>
                <Text style={styles.ingCals}>{Math.round(ing.calories)} cal</Text>
                <View style={styles.ingMacroRow}>
                  <Text style={[styles.ingMacro, { color: MACRO_COLORS.protein }]}>P {ing.protein}g</Text>
                  <Text style={[styles.ingMacro, { color: MACRO_COLORS.carbs }]}>C {ing.carbs}g</Text>
                  <Text style={[styles.ingMacro, { color: MACRO_COLORS.fat }]}>F {ing.fat}g</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Notes */}
        {recipe.notes?.trim() ? (
          <>
            <Text style={styles.sectionTitle}>INSTRUCTIONS & NOTES</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{recipe.notes}</Text>
            </View>
          </>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>
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
  headerActions: { flexDirection: 'row', gap: 4 },
  editBtn: { padding: 8 },
  scroll: { paddingHorizontal: 16 },
  recipeName: { color: '#fff', fontSize: 26, fontWeight: '700', lineHeight: 32, marginBottom: 4 },
  recipeDate: { color: '#555', fontSize: 13, marginBottom: 20 },

  macroCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 24,
  },
  macroGrid: { flexDirection: 'row' },
  macroCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: '#2a2a2a',
  },
  macroValue: { fontSize: 18, fontWeight: '700' },
  macroLabel: { color: '#666', fontSize: 11, marginTop: 3 },
  macroNote: { color: '#444', fontSize: 11, textAlign: 'center', marginTop: 12 },

  sectionTitle: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 10,
  },
  ingredientCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
    marginBottom: 24,
  },
  ingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  ingBorder: { borderBottomWidth: 1, borderBottomColor: '#222' },
  ingName: { color: '#fff', fontSize: 14, fontWeight: '500' },
  ingBrand: { color: '#666', fontSize: 11, marginTop: 1 },
  ingServing: { color: '#555', fontSize: 11, marginTop: 2 },
  ingMacros: { alignItems: 'flex-end' },
  ingCals: { color: '#FF6B35', fontSize: 13, fontWeight: '700' },
  ingMacroRow: { flexDirection: 'row', gap: 6, marginTop: 3 },
  ingMacro: { fontSize: 10, fontWeight: '600' },

  notesCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  notesText: { color: '#ccc', fontSize: 14, lineHeight: 22 },
});
