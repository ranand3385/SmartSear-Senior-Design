import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  Vibration,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { calcCookTimePerSide, formatTime, BASE_PAN_TEMP } from '../utils/cookingCalculator';
import { useTelemetryContext } from '../contexts/TelemetryContext';
import MeatTempChart from '../components/MeatTempChart';

const BEEP_SOUND = require('../assets/sounds/beep.wav');

// Step IDs
const STEPS = {
  PREHEAT: 'PREHEAT',
  GREASE_PAN: 'GREASE_PAN',
  ADD_MEAT: 'ADD_MEAT',
  FAT_CAP_SEAR: 'FAT_CAP_SEAR', // steak-only — replaces ADD_MEAT for steak
  SIDE_1_TIMER: 'SIDE_1_TIMER',
  FLIP_MEAT: 'FLIP_MEAT',
  SIDE_2_TIMER: 'SIDE_2_TIMER',
  REST: 'REST',
  DONE: 'DONE',
};

const PREHEAT_TARGET_C = 90;

// Build step order based on meat type. Steak gets a fat-cap-sear step in
// place of ADD_MEAT so the user renders the fat cap before the flat sear.
function buildStepOrder(meatId) {
  const placement = meatId === 'steak' ? STEPS.FAT_CAP_SEAR : STEPS.ADD_MEAT;
  return [
    STEPS.PREHEAT,
    STEPS.GREASE_PAN,
    placement,
    STEPS.SIDE_1_TIMER,
    STEPS.FLIP_MEAT,
    STEPS.SIDE_2_TIMER,
    STEPS.REST,
    STEPS.DONE,
  ];
}

export default function CookingGuideScreen({ navigation, route }) {
  const { meat, doneness, thicknessInches } = route.params;
  const stepOrder = useMemo(() => buildStepOrder(meat.id), [meat.id]);

  const { panC, meatC, slopeCPerSec, connected } = useTelemetryContext();
  // Reactive cook time: scales with live pan temp, falls back to baseline when disconnected
  const livePanC = panC ?? BASE_PAN_TEMP;
  const secondsPerSide = useMemo(
    () => calcCookTimePerSide(meat.id, doneness.id, thicknessInches, livePanC),
    [meat.id, doneness.id, thicknessInches, livePanC]
  );
  // Snapshot so mid-cook pan-temp drift doesn't yank the running timer
  const secondsPerSideRef = useRef(secondsPerSide);
  useEffect(() => { secondsPerSideRef.current = secondsPerSide; }, [secondsPerSide]);

  // meatC mirror so the step-entry effect can read the latest probe value
  // without re-running on every BLE update.
  const meatCRef = useRef(meatC);
  useEffect(() => { meatCRef.current = meatC; }, [meatC]);
  // slope mirror used by the adaptive side-1 flip predictor
  const slopeCPerSecRef = useRef(slopeCPerSec);
  useEffect(() => { slopeCPerSecRef.current = slopeCPerSec; }, [slopeCPerSec]);

  // Probe early-end is "armed" only when the probe enters a cook step BELOW
  // the doneness target. Without this, side 2 instantly auto-ends because the
  // probe is already at/above target after side 1 — and we still need that
  // side to actually sear.
  const earlyEndArmedRef = useRef(false);

  const restSeconds = (meat.restMinutes ?? 3) * 60;

  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = stepOrder[stepIndex];

  const [timerSecs, setTimerSecs] = useState(secondsPerSide);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const intervalRef = useRef(null);
  const soundRef = useRef(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Stop and unload whatever is currently playing
  const stopSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (_) {}
      soundRef.current = null;
    }
  }, []);

  // Start looping jingle
  const startJingle = useCallback(async () => {
    await stopSound();
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        BEEP_SOUND,
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      soundRef.current = sound;
    } catch (_) {}
    Vibration.vibrate([0, 400, 150, 400, 150, 400]);
  }, [stopSound]);

  // Advance to next step with fade transition
  const nextStep = useCallback(() => {
    clearInterval(intervalRef.current);
    setTimerRunning(false);
    setTimerDone(false);
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    setStepIndex((i) => Math.min(i + 1, stepOrder.length - 1));
  }, [fadeAnim, stepOrder.length]);

  // Skip — same UX as natural timer expiry: jingle loops until user taps Continue
  const skipStep = useCallback(async () => {
    clearInterval(intervalRef.current);
    setTimerRunning(false);
    setTimerSecs(0);
    setTimerDone(true);
    await startJingle();
  }, [startJingle]);

  // Continue after jingle — stop sound, advance
  const continueStep = useCallback(async () => {
    await stopSound();
    nextStep();
  }, [stopSound, nextStep]);

  // Cleanup on unmount
  useEffect(() => () => { stopSound(); }, [stopSound]);

  // Timer logic. Both cook timers default to a plain 1 s/sec countdown from
  // the static `secondsPerSide` seed. Two probe-driven adjustments layer on:
  //   1. End early — if probe reaches the side's target temp, end immediately
  //      (gated by earlyEndArmedRef on side 2 to avoid auto-skipping a sear
  //      when probe was already past target on entry).
  //   2. Extend in the last 30 s — when ≤ 30 s remain, if probe isn't on track
  //      to reach target by timer end, extend the timer to the predicted ETA.
  //   SIDE 1 target = doneness.flipTempC, SIDE 2 target = doneness.tempC.
  //   REST: plain countdown.
  const MIN_SLOPE_C_PER_SEC = 0.03; // ignore noisy near-flat slopes (~1.6 °C/min)
  const ADJUST_WHEN_REMAINING_S = 30;

  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setTimerSecs((s) => {
          let next = s - 1;

          if (currentStep === STEPS.SIDE_1_TIMER || currentStep === STEPS.SIDE_2_TIMER) {
            const isSide2 = currentStep === STEPS.SIDE_2_TIMER;
            const target = isSide2 ? doneness.tempC : doneness.flipTempC;
            const cookActive = !isSide2 || earlyEndArmedRef.current; // side 2 falls back to plain countdown when not armed
            const m = meatCRef.current;
            const slope = slopeCPerSecRef.current;

            if (cookActive) {
              if (Number.isFinite(m) && m >= target) {
                next = 0; // probe reached target — end this side
              } else if (next > 0
                  && next <= ADJUST_WHEN_REMAINING_S
                  && Number.isFinite(m)
                  && Number.isFinite(slope)
                  && slope > MIN_SLOPE_C_PER_SEC) {
                const timeToTarget = (target - m) / slope;
                if (timeToTarget > next) next = Math.ceil(timeToTarget);
              }
            }
          }

          if (next <= 0) {
            clearInterval(intervalRef.current);
            setTimerRunning(false);
            setTimerDone(true);
            startJingle();
            return 0;
          }
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerRunning, currentStep, doneness.flipTempC, doneness.tempC, startJingle]);

  // Auto-advance from PREHEAT on a *rising edge* through the target temp.
  // We require panC to have been observed below the target at some point first,
  // so a hot pan at screen-entry doesn't instantly skip the preheat step.
  // (User can still tap "Skip preheat" to bypass manually.)
  const preheatAdvancedRef = useRef(false);
  const preheatSeenBelowRef = useRef(false);
  useEffect(() => {
    if (currentStep !== STEPS.PREHEAT) {
      preheatAdvancedRef.current = false;
      preheatSeenBelowRef.current = false;
      return;
    }
    if (preheatAdvancedRef.current) return;
    if (!Number.isFinite(panC)) return;

    if (panC < PREHEAT_TARGET_C) {
      preheatSeenBelowRef.current = true;
      return;
    }
    // panC >= target — only fire if we've seen "below" first (rising edge)
    if (preheatSeenBelowRef.current) {
      preheatAdvancedRef.current = true;
      nextStep();
    }
  }, [currentStep, panC, nextStep]);

// Reset timer when entering a timer step. Read secondsPerSide from ref so
  // a pan-temp update doesn't restart the countdown — we snapshot at step entry.
  // Arm the probe early-end on entry to SIDE 2 only, and only if probe is
  // currently below the doneness target (otherwise we'd auto-skip the sear).
  useEffect(() => {
    if (currentStep === STEPS.SIDE_1_TIMER) {
      setTimerSecs(secondsPerSideRef.current);
      setTimerDone(false);
      setTimerRunning(true);
      earlyEndArmedRef.current = false; // side 1 always runs full duration
    } else if (currentStep === STEPS.SIDE_2_TIMER) {
      setTimerSecs(secondsPerSideRef.current);
      setTimerDone(false);
      setTimerRunning(true);
      const m = meatCRef.current;
      earlyEndArmedRef.current =
        m == null || !Number.isFinite(m) || m < doneness.tempC;
    } else if (currentStep === STEPS.REST) {
      setTimerSecs(restSeconds);
      setTimerDone(false);
      setTimerRunning(true);
      earlyEndArmedRef.current = false;
    }
  }, [currentStep, restSeconds, doneness.tempC]);

  const handleQuit = () => {
    Alert.alert('Quit Cooking?', 'Are you sure you want to stop?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Quit',
        style: 'destructive',
        onPress: async () => { await stopSound(); navigation.navigate('Home'); },
      },
    ]);
  };

  // Progress bar percentage
  const progress = stepIndex / (stepOrder.length - 1);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleQuit} style={styles.quitBtn}>
          <Ionicons name="close" size={24} color="#888" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerMeat}>{meat.icon} {meat.label}</Text>
          <Text style={[styles.headerDoneness, { color: doneness.color }]}>
            {doneness.label}
          </Text>
        </View>
        <View style={styles.connPill}>
          <View style={[styles.connDot, { backgroundColor: connected ? '#4CAF50' : '#666' }]} />
          <Text style={styles.connText}>{connected ? 'BLE' : 'Offline'}</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Step Content */}
      <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
        <StepContent
          step={currentStep}
          meat={meat}
          doneness={doneness}
          timerSecs={timerSecs}
          timerRunning={timerRunning}
          panC={panC}
          onNext={nextStep}
        />
      </Animated.View>

      {/* Action Button — shown only on instruction steps (not timers) */}
      {(currentStep === STEPS.GREASE_PAN
          || currentStep === STEPS.ADD_MEAT
          || currentStep === STEPS.FAT_CAP_SEAR
          || currentStep === STEPS.FLIP_MEAT) && (
        <TouchableOpacity style={styles.confirmBtn} onPress={nextStep} activeOpacity={0.85}>
          <Ionicons name="checkmark" size={22} color="#fff" />
          <Text style={styles.confirmBtnText}>Done</Text>
        </TouchableOpacity>
      )}

      {/* PREHEAT — auto-advances at target temp; skip in case BLE is silent */}
      {currentStep === STEPS.PREHEAT && (
        <TouchableOpacity style={styles.skipBtn} onPress={nextStep} activeOpacity={0.7}>
          <Ionicons name="play-skip-forward-outline" size={18} color="#888" />
          <Text style={styles.skipBtnText}>Skip preheat</Text>
        </TouchableOpacity>
      )}

      {/* Temp strip + chart + Skip — shown on all timer steps */}
      {(currentStep === STEPS.SIDE_1_TIMER || currentStep === STEPS.SIDE_2_TIMER || currentStep === STEPS.REST) && (
        <>
          <MeatTempChart meatC={meatC} width={Dimensions.get('window').width - 40} height={140} />
          <View style={styles.tempStrip}>
            <View style={styles.tempCell}>
              <Text style={styles.tempStripLabel}>PROBE</Text>
              <Text style={[
                styles.tempStripValue,
                meatC != null && meatC <= 0 && styles.tempStripDisconnected,
              ]}>
                {meatC == null
                  ? '—'
                  : meatC <= 0
                    ? 'Disconnected'
                    : `${Math.round(meatC)}°C`}
              </Text>
            </View>
            <View style={styles.tempCellDivider} />
            <View style={styles.tempCell}>
              <Text style={styles.tempStripLabel}>PAN</Text>
              <Text style={[
                styles.tempStripValue,
                { color: '#4FC3F7' },
                panC != null && panC <= 0 && styles.tempStripDisconnected,
              ]}>
                {panC == null
                  ? '—'
                  : panC <= 0
                    ? 'Disconnected'
                    : `${Math.round(panC)}°C`}
              </Text>
            </View>
          </View>
          {timerDone ? (
            <TouchableOpacity style={styles.continueBtn} onPress={continueStep} activeOpacity={0.85}>
              <Ionicons name="checkmark" size={22} color="#fff" />
              <Text style={styles.continueBtnText}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.skipBtn} onPress={skipStep} activeOpacity={0.7}>
              <Ionicons name="play-skip-forward-outline" size={18} color="#888" />
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {currentStep === STEPS.DONE && (
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => navigation.navigate('Home')}
          activeOpacity={0.85}
        >
          <Text style={styles.doneBtnText}>Finish</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

// ─── Step Content Component ──────────────────────────────────────────────────

function StepContent({ step, meat, doneness, timerSecs, timerRunning, panC, onNext }) {
  switch (step) {
    case STEPS.PREHEAT:
      return (
        <>
          <InstructionCard
            icon="flame-outline"
            iconColor="#FF6B35"
            title="Preheating"
            body={`Heat your SmartPan until it reaches ${PREHEAT_TARGET_C}°C. We'll move on automatically once it's hot enough.`}
            tip="A properly preheated pan gives you a clean, even sear."
          />
          <PreheatPanel panC={panC} targetC={PREHEAT_TARGET_C} />
        </>
      );

    case STEPS.GREASE_PAN:
      return (
        <InstructionCard
          icon="water-outline"
          iconColor="#4FC3F7"
          title="Grease the pan"
          body={`Add a thin layer of oil or butter to your SmartPan before adding the ${meat.label.toLowerCase()}.`}
          tip="The oil should shimmer almost immediately on contact."
        />
      );

    case STEPS.ADD_MEAT:
      return (
        <InstructionCard
          icon="add-circle-outline"
          iconColor="#81C784"
          title={`Add the ${meat.label}`}
          body={`Place your ${meat.label.toLowerCase()} in the center of the pan. Press gently to ensure full contact with the surface.`}
          tip="Don't move the meat — let it sear undisturbed for best results."
        />
      );

    case STEPS.FAT_CAP_SEAR:
      return (
        <InstructionCard
          icon="layers-outline"
          iconColor="#F39C12"
          title="Sear fat cap & sides"
          body={
            "Hold the steak upright with tongs and start with the fat cap down — render until glossy and golden (30–60 s). " +
            "Then rotate and sear each remaining narrow side for 15–20 s, until all edges are browned."
          }
          tip="Crisping every edge first builds flavor and primes the surface before the flat sear."
        />
      );

    case STEPS.SIDE_1_TIMER:
      return <TimerCard title="Cooking Side 1" secs={timerSecs} running={timerRunning} />;

    case STEPS.FLIP_MEAT:
      return (
        <InstructionCard
          icon="swap-vertical-outline"
          iconColor="#FFB74D"
          title={`Flip the ${meat.label}`}
          body={`Use tongs to carefully flip your ${meat.label.toLowerCase()}. Avoid piercing the meat.`}
          tip="A good sear releases from the pan naturally — if it sticks, wait a few more seconds."
        />
      );

    case STEPS.SIDE_2_TIMER:
      return <TimerCard title="Cooking Side 2" secs={timerSecs} running={timerRunning} />;

    case STEPS.REST:
      return (
        <>
          <InstructionCard
            icon="time-outline"
            iconColor="#CE93D8"
            title="Remove & Rest"
            body={`Remove the ${meat.label.toLowerCase()} from the pan and let it rest. Resting locks in the juices.`}
            tip={`Target internal temp: ${doneness.tempC}°C`}
          />
          <View style={styles.restTimerWrapper}>
            <TimerCard title="Resting" secs={timerSecs} running={timerRunning} compact />
          </View>
        </>
      );

    case STEPS.DONE:
      return (
        <View style={styles.doneContainer}>
          <Text style={styles.doneEmoji}>{meat.icon}</Text>
          <Text style={styles.doneTitle}>Enjoy your meal!</Text>
          <Text style={styles.doneSub}>
            Your {meat.label.toLowerCase()} should be{' '}
            <Text style={[styles.donenessHighlight, { color: doneness.color }]}>
              {doneness.label.toLowerCase()}
            </Text>{' '}
            at {doneness.tempC}°C.
          </Text>
          <Text style={styles.doneSub2}>{doneness.description}</Text>
        </View>
      );

    default:
      return null;
  }
}

// ─── Instruction Card ────────────────────────────────────────────────────────

function InstructionCard({ icon, iconColor, title, body, tip }) {
  return (
    <View style={instrStyles.card}>
      <View style={[instrStyles.iconBg, { backgroundColor: iconColor + '22' }]}>
        <Ionicons name={icon} size={36} color={iconColor} />
      </View>
      <Text style={instrStyles.title}>{title}</Text>
      <Text style={instrStyles.body}>{body}</Text>
      {tip && (
        <View style={instrStyles.tipRow}>
          <Ionicons name="bulb-outline" size={14} color="#FF6B35" />
          <Text style={instrStyles.tipText}>{tip}</Text>
        </View>
      )}
    </View>
  );
}

const instrStyles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  iconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { color: '#999', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  tipText: { color: '#FF6B35', fontSize: 13 },
});

// ─── Preheat Panel (GREASE_PAN step) ─────────────────────────────────────────

function PreheatPanel({ panC, targetC = 110 }) {
  const valid = Number.isFinite(panC);
  const disconnected = valid && panC <= 0;
  const ready = valid && !disconnected && panC >= targetC;

  let valueText;
  if (!valid) valueText = '—';
  else if (disconnected) valueText = 'Disconnected';
  else valueText = `${Math.round(panC)}°C`;

  let statusText;
  if (!valid) statusText = `Heat pan to ${targetC}°C`;
  else if (disconnected) statusText = `Reconnect pan — target ${targetC}°C`;
  else if (ready) statusText = `Ready — pan at ${targetC}°C`;
  else statusText = `Heat pan to ${targetC}°C`;

  // Progress fill: 0 at ambient (20°C), 100% at target
  const AMBIENT = 20;
  const pct = !valid || disconnected
    ? 0
    : Math.max(0, Math.min(1, (panC - AMBIENT) / (targetC - AMBIENT)));

  return (
    <View style={preheatStyles.card}>
      <Text style={preheatStyles.label}>PAN TEMPERATURE</Text>
      <Text style={[
        preheatStyles.value,
        ready && preheatStyles.valueReady,
        disconnected && preheatStyles.valueDisconnected,
      ]}>
        {valueText}
      </Text>
      <View style={preheatStyles.progressTrack}>
        <View
          style={[
            preheatStyles.progressFill,
            { width: `${pct * 100}%` },
            ready && preheatStyles.progressFillReady,
          ]}
        />
      </View>
      <View style={preheatStyles.statusRow}>
        <Ionicons
          name={ready ? 'checkmark-circle' : 'flame-outline'}
          size={14}
          color={ready ? '#4CAF50' : '#FF6B35'}
        />
        <Text style={[preheatStyles.statusText, ready && preheatStyles.statusTextReady]}>
          {statusText}
        </Text>
      </View>
    </View>
  );
}

const preheatStyles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginTop: 14,
  },
  label: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  value: {
    color: '#4FC3F7',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
  },
  valueReady: { color: '#4CAF50' },
  valueDisconnected: { color: '#E74C3C', fontSize: 22 },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF6B35',
    borderRadius: 2,
  },
  progressFillReady: {
    backgroundColor: '#4CAF50',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusText: { color: '#FF6B35', fontSize: 13, fontWeight: '600' },
  statusTextReady: { color: '#4CAF50' },
});

// ─── Timer Card ──────────────────────────────────────────────────────────────

function TimerCard({ title, secs, running, compact = false }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (running) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 500, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [running, pulseAnim]);

  return (
    <View style={[timerStyles.card, compact && timerStyles.cardCompact]}>
      <Text style={timerStyles.label}>{title}</Text>
      <Animated.Text
        style={[
          timerStyles.time,
          compact && timerStyles.timeCompact,
          { transform: [{ scale: pulseAnim }] },
        ]}
      >
        {formatTime(secs)}
      </Animated.Text>
      {!compact && (
        <View style={timerStyles.statusRow}>
          <View style={[timerStyles.dot, { backgroundColor: running ? '#4CAF50' : '#555' }]} />
          <Text style={timerStyles.statusText}>{running ? 'Running' : 'Done'}</Text>
        </View>
      )}
    </View>
  );
}

const timerStyles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardCompact: {
    padding: 20,
    marginTop: 14,
  },
  label: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  time: {
    color: '#FF6B35',
    fontSize: 72,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  timeCompact: { fontSize: 42 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#666', fontSize: 13 },
});

// ─── Main styles ─────────────────────────────────────────────────────────────

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
    justifyContent: 'space-between',
    paddingTop: 16,
    marginBottom: 16,
  },
  quitBtn: { padding: 4 },
  headerCenter: { alignItems: 'center' },
  connPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  connDot: { width: 6, height: 6, borderRadius: 3 },
  connText: { color: '#888', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  headerMeat: { color: '#fff', fontSize: 16, fontWeight: '600' },
  headerDoneness: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  progressTrack: {
    height: 4,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    marginBottom: 28,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF6B35',
    borderRadius: 2,
  },
  stepContainer: { flex: 1, justifyContent: 'center' },
  restTimerWrapper: { marginTop: 0 },
  confirmBtn: {
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
  confirmBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  tempStrip: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 10,
    overflow: 'hidden',
  },
  tempCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 3,
  },
  tempCellDivider: {
    width: 1,
    backgroundColor: '#2a2a2a',
  },
  tempStripLabel: {
    color: '#666',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  tempStripValue: {
    color: '#FF6B35',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tempStripDisconnected: {
    color: '#E74C3C',
    fontSize: 14,
    letterSpacing: 0,
  },
  continueBtn: {
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
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  skipBtn: {
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  skipBtnText: { color: '#888', fontSize: 15, fontWeight: '500' },
  doneBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  doneContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  doneEmoji: { fontSize: 72 },
  doneTitle: { color: '#fff', fontSize: 28, fontWeight: '700' },
  doneSub: { color: '#999', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  donenessHighlight: { fontWeight: '700' },
  doneSub2: { color: '#666', fontSize: 14 },
});
