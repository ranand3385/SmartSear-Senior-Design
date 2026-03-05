import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, SafeAreaView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { loadRecipes, deleteRecipe, computeRecipeTotals } from '../utils/recipeStorage';

const MACRO_COLORS = { protein: '#4FC3F7', carbs: '#81C784', fat: '#FFB74D' };

export default function RecipesScreen({ navigation }) {
  const [recipes, setRecipes] = useState([]);

  useFocusEffect(
    useCallback(() => {
      loadRecipes().then(setRecipes);
    }, [])
  );

  const handleDelete = (recipe) => {
    Alert.alert('Delete Recipe', `Delete "${recipe.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRecipe(recipe.id);
          setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Recipes</Text>
          <Text style={styles.subtitle}>{recipes.length} saved</Text>
        </View>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => navigation.navigate('CreateRecipe', {})}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {recipes.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="book-outline" size={52} color="#333" />
          <Text style={styles.emptyTitle}>No recipes yet</Text>
          <Text style={styles.emptyHint}>Tap "New" to create your first recipe</Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const totals = computeRecipeTotals(item.ingredients);
            const date = new Date(item.createdAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric',
            });
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('RecipeDetail', { recipe: item })}
                activeOpacity={0.8}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#555" />
                  </TouchableOpacity>
                </View>

                <View style={styles.cardMeta}>
                  <Text style={styles.cardMetaText}>
                    {item.ingredients.length} ingredient{item.ingredients.length !== 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.cardDot}>·</Text>
                  <Text style={styles.cardMetaText}>{date}</Text>
                  {item.notes?.trim() && (
                    <>
                      <Text style={styles.cardDot}>·</Text>
                      <Ionicons name="document-text-outline" size={12} color="#555" />
                      <Text style={styles.cardMetaText}>Notes</Text>
                    </>
                  )}
                </View>

                <View style={styles.cardMacros}>
                  <Text style={styles.cardCals}>{totals.calories} cal</Text>
                  <View style={styles.cardMacroPills}>
                    <Text style={[styles.pill, { color: MACRO_COLORS.protein }]}>P {totals.protein}g</Text>
                    <Text style={[styles.pill, { color: MACRO_COLORS.carbs }]}>C {totals.carbs}g</Text>
                    <Text style={[styles.pill, { color: MACRO_COLORS.fat }]}>F {totals.fat}g</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

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
  title: { color: '#fff', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#666', fontSize: 13, marginTop: 2 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF6B35',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  newBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  emptyHint: { color: '#555', fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardName: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText: { color: '#555', fontSize: 12 },
  cardDot: { color: '#444', fontSize: 12 },
  cardMacros: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardCals: { color: '#FF6B35', fontSize: 15, fontWeight: '700' },
  cardMacroPills: { flexDirection: 'row', gap: 10 },
  pill: { fontSize: 12, fontWeight: '600' },
});
