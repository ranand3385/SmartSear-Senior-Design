import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MEAT_TYPES } from '../constants/meatData';

export default function MeatSelectionScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>What are you cooking?</Text>
      </View>

      <FlatList
        data={MEAT_TYPES}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Dimensions', { meat: item })}
            activeOpacity={0.8}
          >
            <Text style={styles.cardIcon}>{item.icon}</Text>
            <Text style={styles.cardLabel}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  grid: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  card: {
    flex: 0.48,
    backgroundColor: '#1a1a1a',
    borderRadius: 18,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardIcon: {
    fontSize: 44,
  },
  cardLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
