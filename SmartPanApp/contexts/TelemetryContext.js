import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTelemetry } from '../hooks/useTelemetry';

const BEEP_SOUND = require('../assets/sounds/beep.wav');

// Pan-temp safety: alert when ≥ THRESHOLD; re-arm only after dropping below CLEAR.
const OVERTEMP_THRESHOLD_C = 130;
const OVERTEMP_CLEAR_C = 125;

const TelemetryContext = createContext(null);

export function TelemetryProvider({ children }) {
  const telemetry = useTelemetry();
  const [overtempActive, setOvertempActive] = useState(false);
  const [peakC, setPeakC] = useState(null);
  // armed = ready to fire on next rising edge into THRESHOLD
  const armedRef = useRef(true);
  const soundRef = useRef(null);

  const stopAlertSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (_) {}
      soundRef.current = null;
    }
    Vibration.cancel();
  }, []);

  const startAlertSound = useCallback(async () => {
    await stopAlertSound();
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        BEEP_SOUND,
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      soundRef.current = sound;
    } catch (_) {}
    Vibration.vibrate([0, 500, 200, 500, 200, 500], true);
  }, [stopAlertSound]);

  // Watch panC: rising edge into threshold → fire; falling edge below CLEAR → re-arm
  useEffect(() => {
    const c = telemetry.panC;
    if (!Number.isFinite(c)) return;
    if (armedRef.current && c >= OVERTEMP_THRESHOLD_C) {
      armedRef.current = false;
      setPeakC(c);
      setOvertempActive(true);
      startAlertSound();
    } else if (!armedRef.current && c < OVERTEMP_CLEAR_C) {
      armedRef.current = true;
    }
    // Track peak while modal is up so the user sees how hot it actually got
    if (overtempActive && Number.isFinite(c)) {
      setPeakC((prev) => (prev == null || c > prev ? c : prev));
    }
  }, [telemetry.panC, overtempActive, startAlertSound]);

  const dismissOvertemp = useCallback(async () => {
    setOvertempActive(false);
    setPeakC(null);
    await stopAlertSound();
  }, [stopAlertSound]);

  // Cleanup on unmount
  useEffect(() => () => { stopAlertSound(); }, [stopAlertSound]);

  return (
    <TelemetryContext.Provider value={telemetry}>
      {children}
      <Modal visible={overtempActive} transparent animationType="fade" onRequestClose={dismissOvertemp}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Ionicons name="warning" size={64} color="#FFF" />
            <Text style={styles.title}>TURN DOWN THE STOVE</Text>
            <Text style={styles.subtitle}>
              Pan temperature exceeded {OVERTEMP_THRESHOLD_C}°C.
            </Text>
            {peakC != null && (
              <Text style={styles.peak}>Peak: {Math.round(peakC)}°C</Text>
            )}
            <TouchableOpacity style={styles.btn} onPress={dismissOvertemp} activeOpacity={0.85}>
              <Text style={styles.btnText}>I've turned it down</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </TelemetryContext.Provider>
  );
}

export function useTelemetryContext() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    throw new Error('useTelemetryContext must be used inside <TelemetryProvider>');
  }
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#C0392B',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 14,
    borderWidth: 2,
    borderColor: '#fff',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    color: '#FFE5E0',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  peak: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 6,
  },
  btn: {
    marginTop: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
  },
  btnText: {
    color: '#C0392B',
    fontSize: 16,
    fontWeight: '700',
  },
});
