import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DONENESS } from '../constants/meatData';
import { calcCookTimePerSide, formatTime } from '../utils/cookingCalculator';

export default function DonenessScreen({ navigation, route }) {
  const { meat, thicknessInches } = route.params;
  const [selected, setSelected] = useState(null);

  const handleStart = () => {
    if (!selected) return;
    const secondsPerSide = calcCookTimePerSide(meat.id, selected.id, thicknessInches);
    navigation.navigate('CookingGuide', {
      meat,
      thicknessInches,
      doneness: selected,
      secondsPerSide,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Doneness</Text>
          <Text style={styles.subtitle}>{meat.icon} {meat.label} · {thicknessInches}"</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {meat.donenessOptions.map((id) => {
          const d = DONENESS[id];
          const secs = calcCookTimePerSide(meat.id, id, thicknessInches);
          const isSelected = selected?.id === id;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => setSelected(d)}
              activeOpacity={0.8}
            >
              {/* Color bar */}
              <View style={[styles.colorBar, { backgroundColor: d.color }]} />

              <View style={styles.cardContent}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardLabel}>{d.label}</Text>
                  <Text style={[styles.cardTemp, { color: d.color }]}>{d.tempF}°F</Text>
                </View>
                <Text style={styles.cardDesc}>{d.description}</Text>
                <View style={styles.cardTimeBadge}>
                  <Ionicons name="time-outline" size={13} color="#888" />
                  <Text style={styles.cardTimeText}>
                    {formatTime(secs)} per side
                  </Text>
                </View>
              </View>

              {isSelected && (
                <Ionicons name="checkmark-circle" size={22} color="#FF6B35" style={styles.check} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Start Button */}
      <TouchableOpacity
        style={[styles.startBtn, !selected && styles.startBtnDisabled]}
        onPress={handleStart}
        disabled={!selected}
        activeOpacity={0.85}
      >
        <Ionicons name="flame" size={20} color="#fff" />
        <Text style={styles.startBtnText}>
          {selected ? `Cook to ${selected.label}` : 'Select a doneness'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    marginBottom: 24,
  },
  backBtn: { padding: 4 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 14, marginTop: 2 },
  scroll: { gap: 12, paddingBottom: 16 },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
  },
  cardSelected: {
    borderColor: '#FF6B35',
    backgroundColor: '#1e1208',
  },
  colorBar: {
    width: 6,
    alignSelf: 'stretch',
  },
  cardContent: {
    flex: 1,
    padding: 16,
    gap: 4,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: { color: '#fff', fontSize: 17, fontWeight: '700' },
  cardTemp: { fontSize: 17, fontWeight: '700' },
  cardDesc: { color: '#777', fontSize: 13 },
  cardTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  cardTimeText: { color: '#888', fontSize: 12 },
  check: { marginRight: 14 },
  startBtn: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 12,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
