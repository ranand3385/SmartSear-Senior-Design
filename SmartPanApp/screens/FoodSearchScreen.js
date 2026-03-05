import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { searchFoodByQuery, searchFoodByBarcode } from '../utils/foodApi';

export default function FoodSearchScreen({ navigation, route }) {
  const { meal, mode } = route.params;
  const detailScreen = mode === 'recipe' ? 'FoodDetailRecipe' : 'FoodDetail';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const searchTimeout = useRef(null);
  // Use a ref so the guard is synchronous — state updates are async and
  // the camera fires onBarcodeScanned multiple times per frame.
  const scannedRef = useRef(false);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => runSearch(query), 500);
    return () => clearTimeout(searchTimeout.current);
  }, [query]);

  const runSearch = async (q) => {
    setLoading(true);
    setError(null);
    try {
      const foods = await searchFoodByQuery(q);
      setResults(foods);
    } catch (e) {
      setError('Search failed. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScan = async ({ data }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;   // block all subsequent callbacks immediately
    setScanning(false);
    setLoading(true);
    try {
      const food = await searchFoodByBarcode(data);
      navigation.navigate(detailScreen, { food, meal, mode });
    } catch {
      Alert.alert(
        'Not Found',
        'This barcode wasn\'t found in the database. Try searching by name.',
        [{
          text: 'OK',
          onPress: () => { scannedRef.current = false; },
        }]
      );
    } finally {
      setLoading(false);
    }
  };

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Camera Permission', 'Camera access is required to scan barcodes.');
        return;
      }
    }
    scannedRef.current = false;
    setScanning(true);
  };

  // ── Scanner View ────────────────────────────────────────────────────────────
  if (scanning) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          onBarcodeScanned={handleBarcodeScan}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
        />
        {/* Overlay */}
        <View style={scanStyles.overlay}>
          <TouchableOpacity style={scanStyles.closeBtn} onPress={() => setScanning(false)}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
          <View style={scanStyles.frame} />
          <Text style={scanStyles.hint}>Align barcode within the frame</Text>
        </View>
      </View>
    );
  }

  // ── Search View ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Add to {meal}</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search foods..."
              placeholderTextColor="#444"
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => query.trim() && runSearch(query)}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
                <Ionicons name="close-circle" size={18} color="#666" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
            <Ionicons name="barcode-outline" size={24} color="#FF6B35" />
          </TouchableOpacity>
        </View>

        {/* States */}
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color="#FF6B35" size="large" />
          </View>
        )}

        {error && !loading && (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={40} color="#555" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !error && results.length === 0 && query.length > 0 && (
          <View style={styles.center}>
            <Ionicons name="search-outline" size={40} color="#555" />
            <Text style={styles.emptyText}>No results for "{query}"</Text>
          </View>
        )}

        {!loading && !error && results.length === 0 && query.length === 0 && (
          <View style={styles.center}>
            <Ionicons name="nutrition-outline" size={48} color="#333" />
            <Text style={styles.hintText}>Search by name or scan a barcode</Text>
          </View>
        )}

        {/* Results */}
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.fdcId ?? item.name)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.resultItem}
              onPress={() => navigation.navigate(detailScreen, { food: item, meal, mode })}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.foodName} numberOfLines={2}>{item.name}</Text>
                {item.brand && <Text style={styles.foodBrand} numberOfLines={1}>{item.brand}</Text>}
                <Text style={styles.foodServing}>{item.servingSize}</Text>
                <View style={styles.macroPillRow}>
                  <Text style={[styles.macroPill, { color: '#4FC3F7' }]}>P {item.protein}g</Text>
                  <Text style={[styles.macroPill, { color: '#81C784' }]}>C {item.carbs}g</Text>
                  <Text style={[styles.macroPill, { color: '#FFB74D' }]}>F {item.fat}g</Text>
                </View>
              </View>
              <View style={styles.foodMacros}>
                <Text style={styles.foodCals}>{item.calories}</Text>
                <Text style={styles.foodCalsUnit}>cal</Text>
                <Ionicons name="chevron-forward" size={16} color="#444" style={{ marginTop: 6 }} />
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
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
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  scanBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  errorText: { color: '#e74c3c', fontSize: 14, textAlign: 'center' },
  emptyText: { color: '#555', fontSize: 14 },
  hintText: { color: '#444', fontSize: 14, textAlign: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  foodName: { color: '#fff', fontSize: 14, fontWeight: '500', lineHeight: 20 },
  foodBrand: { color: '#666', fontSize: 12, marginTop: 2 },
  foodServing: { color: '#555', fontSize: 11, marginTop: 2 },
  macroPillRow: { flexDirection: 'row', gap: 8, marginTop: 5 },
  macroPill: { fontSize: 11, fontWeight: '600' },
  foodMacros: { alignItems: 'flex-end' },
  foodCalsUnit: { color: '#888', fontSize: 10, marginTop: -2 },
  foodCals: { color: '#FF6B35', fontSize: 14, fontWeight: '700' },
  separator: { height: 1, backgroundColor: '#1e1e1e' },
});

const scanStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: { position: 'absolute', top: 56, right: 20 },
  frame: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderColor: '#FF6B35',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#fff',
    fontSize: 14,
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
});
