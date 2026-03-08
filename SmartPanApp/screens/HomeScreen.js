import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MEAT_TYPES, DONENESS } from '../constants/meatData';

// DEMO VALUES — replace with actual BLE reads when hardware is ready
const PAN_TEMPERATURE = 375;
const PROBE_TEMPERATURE = 142;
const IS_CONNECTED = true;

export default function HomeScreen({ navigation }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulsing animation for the "not connected" indicator
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="flame" size={28} color="#FF6B35" />
        <Text style={styles.headerTitle}>SmartPan</Text>
      </View>

      {/* Temperature Card */}
      <View style={styles.tempCard}>
        <Text style={styles.tempLabel}>PROBE TEMPERATURE</Text>

        {IS_CONNECTED ? (
          <>
            <Text style={styles.tempValue}>{PROBE_TEMPERATURE}°F</Text>
            <View style={styles.divider} />
            <Text style={styles.probeLabel}>PAN TEMPERATURE</Text>
            <Text style={styles.probeValue}>{PAN_TEMPERATURE}°F</Text>
          </>
        ) : (
          <>
            <Text style={styles.tempValueDim}>-- °F</Text>
            <Animated.View style={[styles.statusDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.statusText}>Pan not connected</Text>
            <Text style={styles.statusSub}>BLE connection coming soon</Text>
          </>
        )}
      </View>

      {/* Doneness Reference Chart */}
      <DonenessChart />

      {/* Start Cooking Button */}
      <TouchableOpacity
        style={styles.startButton}
        onPress={() => navigation.navigate('MeatSelection')}
        activeOpacity={0.85}
      >
        <Ionicons name="flame" size={22} color="#fff" />
        <Text style={styles.startButtonText}>Start Cooking</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─── Doneness Accordion ───────────────────────────────────────────────────────

function DonenessChart() {
  const [openId, setOpenId] = useState(null);

  return (
    <ScrollView style={chartStyles.container} showsVerticalScrollIndicator={false}>
      <Text style={chartStyles.title}>INTERNAL TEMP GUIDE</Text>

      {MEAT_TYPES.map((meat, idx) => {
        const isOpen = openId === meat.id;
        const isLast = idx === MEAT_TYPES.length - 1;
        return (
          <View key={meat.id}>
            <TouchableOpacity
              style={[chartStyles.row, !isLast && !isOpen && chartStyles.rowBorder]}
              onPress={() => setOpenId(isOpen ? null : meat.id)}
              activeOpacity={0.7}
            >
              <Text style={chartStyles.rowLabel}>{meat.icon}  {meat.label}</Text>
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#555"
              />
            </TouchableOpacity>

            {isOpen && (
              <View style={[chartStyles.dropdown, !isLast && chartStyles.rowBorder]}>
                {meat.donenessOptions.map((id) => {
                  const d = DONENESS[id];
                  return (
                    <View key={id} style={chartStyles.donenessRow}>
                      <View style={[chartStyles.bullet, { backgroundColor: d.color }]} />
                      <Text style={chartStyles.donenessLabel}>{d.label}</Text>
                      <Text style={[chartStyles.donenessTemp, { color: d.color }]}>
                        {d.tempF}°F
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 18,
    marginTop: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  title: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#242424',
  },
  rowLabel: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '500',
  },
  dropdown: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  donenessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
  },
  bullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  donenessLabel: {
    flex: 1,
    color: '#aaa',
    fontSize: 13,
  },
  donenessTemp: {
    fontSize: 13,
    fontWeight: '600',
  },
});

// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 20,
    marginBottom: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tempCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 6,
  },
  tempLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  tempValue: {
    color: '#FF6B35',
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: -2,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#2a2a2a',
    marginVertical: 4,
  },
  probeLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  probeValue: {
    color: '#4FC3F7',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -1,
  },
  tempValueDim: {
    color: '#333',
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: -2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#444',
  },
  statusText: {
    color: '#555',
    fontSize: 15,
    fontWeight: '500',
  },
  statusSub: {
    color: '#333',
    fontSize: 12,
  },
  startButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
