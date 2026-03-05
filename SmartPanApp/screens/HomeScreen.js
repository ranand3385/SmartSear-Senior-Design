import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// DEMO VALUES — replace with actual BLE reads when hardware is ready
const PAN_TEMPERATURE = 375;
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
        <Text style={styles.tempLabel}>PAN TEMPERATURE</Text>

        {IS_CONNECTED ? (
          <Text style={styles.tempValue}>{PAN_TEMPERATURE}°F</Text>
        ) : (
          <>
            <Text style={styles.tempValueDim}>-- °F</Text>
            <Animated.View style={[styles.statusDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.statusText}>Pan not connected</Text>
            <Text style={styles.statusSub}>BLE connection coming soon</Text>
          </>
        )}
      </View>

      {/* Spacer */}
      <View style={{ flex: 1 }} />

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
    marginBottom: 40,
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
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    gap: 10,
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
    fontSize: 72,
    fontWeight: '700',
    letterSpacing: -2,
  },
  tempValueDim: {
    color: '#333',
    fontSize: 72,
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
