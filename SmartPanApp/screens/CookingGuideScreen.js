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
import { useTelemetry } from '../hooks/useTelemetry';
import MeatTempChart from '../components/MeatTempChart';

const BEEP_SOUND = require('../assets/sounds/beep.wav');

// Step IDs
const STEPS = {
  GREASE_PAN: 'GREASE_PAN',
  ADD_MEAT: 'ADD_MEAT',
  SIDE_1_TIMER: 'SIDE_1_TIMER',
  FLIP_MEAT: 'FLIP_MEAT',
  SIDE_2_TIMER: 'SIDE_2_TIMER',
  REST: 'REST',
  DONE: 'DONE',
};

const STEP_ORDER = [
  STEPS.GREASE_PAN,
  STEPS.ADD_MEAT,
  STEPS.SIDE_1_TIMER,
  STEPS.FLIP_MEAT,
  STEPS.SIDE_2_TIMER,
  STEPS.REST,
  STEPS.DONE,
];

export default function CookingGuideScreen({ navigation, route }) {
  const { meat, doneness, thicknessInches } = route.params;

  const { panF, meatF, slopeFPerSec, connected } = useTelemetry();
  // Reactive cook time: scales with live pan temp, falls back to baseline when disconnected
  const livePanF = panF ?? BASE_PAN_TEMP;
  const secondsPerSide = useMemo(
    () => calcCookTimePerSide(meat.id, doneness.id, thicknessInches, livePanF),
    [meat.id, doneness.id, thicknessInches, livePanF]
  );
  // Snapshot so mid-cook pan-temp drift doesn't yank the running timer
  const secondsPerSideRef = useRef(secondsPerSide);
  useEffect(() => { secondsPerSideRef.current = secondsPerSide; }, [secondsPerSide]);

  // meatF mirror so the step-entry effect can read the latest probe value
  // without re-running on every BLE update.
  const meatFRef = useRef(meatF);
  useEffect(() => { meatFRef.current = meatF; }, [meatF]);
  // slope mirror used by the adaptive side-1 flip predictor
  const slopeFPerSecRef = useRef(slopeFPerSec);
  useEffect(() => { slopeFPerSecRef.current = slopeFPerSec; }, [slopeFPerSec]);

  // Probe early-end is "armed" only when the probe enters a cook step BELOW
  // the doneness target. Without this, side 2 instantly auto-ends because the
  // probe is already at/above target after side 1 — and we still need that
  // side to actually sear.
  const earlyEndArmedRef = useRef(false);

  const restSeconds = (meat.restMinutes ?? 3) * 60;

  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = STEP_ORDER[stepIndex];

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
    setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  }, [fadeAnim]);

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

  // Timer logic — when it hits 0, start jingle and WAIT for user.
  // On SIDE 1 the timer ALSO adapts to probe slope: we predict time-to-target
  // and clamp the displayed timer to ~half of that, so the flip happens at the
  // temperature midpoint and the meat reaches doneness during side 2.
  // Timer only ever goes DOWN from this prediction — never up.
  const MIN_SLOPE_F_PER_SEC = 0.05; // ignore noisy near-flat slopes
  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setTimerSecs((s) => {
          let next = s - 1;

          if (currentStep === STEPS.SIDE_1_TIMER) {
            const m = meatFRef.current;
            const slope = slopeFPerSecRef.current;
            const target = doneness.tempF;
            if (Number.isFinite(m) && Number.isFinite(slope) && slope > MIN_SLOPE_F_PER_SEC) {
              if (m >= target) {
                next = 0; // probe already past target — flip now
              } else {
                const timeToTarget = (target - m) / slope;
                const desiredFlipIn = Math.max(0, Math.floor(timeToTarget * 0.5));
                if (desiredFlipIn < next) next = desiredFlipIn;
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
  }, [timerRunning, currentStep, doneness.tempF, startJingle]);

  // Probe-target early end — only on SIDE 2. Side 1 always runs the full
  // timer so the first side actually sears. On side 2 we cut the timer short
  // when the probe reaches the doneness target. Gated on `earlyEndArmedRef`
  // (set at step entry) so an already-hot probe doesn't instant-skip the sear.
  useEffect(() => {
    if (!timerRunning) return;
    if (currentStep !== STEPS.SIDE_2_TIMER) return;
    if (!earlyEndArmedRef.current) return;
    if (meatF == null || !Number.isFinite(meatF)) return;
    if (meatF >= doneness.tempF) {
      clearInterval(intervalRef.current);
      setTimerRunning(false);
      setTimerSecs(0);
      setTimerDone(true);
      startJingle();
      earlyEndArmedRef.current = false;
    }
  }, [meatF, currentStep, timerRunning, doneness.tempF, startJingle]);

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
      const m = meatFRef.current;
      earlyEndArmedRef.current =
        m == null || !Number.isFinite(m) || m < doneness.tempF;
    } else if (currentStep === STEPS.REST) {
      setTimerSecs(restSeconds);
      setTimerDone(false);
      setTimerRunning(true);
      earlyEndArmedRef.current = false;
    }
  }, [currentStep, restSeconds, doneness.tempF]);

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
  const progress = stepIndex / (STEP_ORDER.length - 1);

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
          onNext={nextStep}
        />
      </Animated.View>

      {/* Action Button — shown only on instruction steps (not timers) */}
      {(currentStep === STEPS.GREASE_PAN || currentStep === STEPS.ADD_MEAT || currentStep === STEPS.FLIP_MEAT) && (
        <TouchableOpacity style={styles.confirmBtn} onPress={nextStep} activeOpacity={0.85}>
          <Ionicons name="checkmark" size={22} color="#fff" />
          <Text style={styles.confirmBtnText}>Done</Text>
        </TouchableOpacity>
      )}

      {/* Temp strip + chart + Skip — shown on all timer steps */}
      {(currentStep === STEPS.SIDE_1_TIMER || currentStep === STEPS.SIDE_2_TIMER || currentStep === STEPS.REST) && (
        <>
          <MeatTempChart meatF={meatF} width={Dimensions.get('window').width - 40} height={140} />
          <View style={styles.tempStrip}>
            <View style={styles.tempCell}>
              <Text style={styles.tempStripLabel}>PROBE</Text>
              <Text style={styles.tempStripValue}>
                {meatF == null ? '—' : `${Math.round(meatF)}°F`}
              </Text>
            </View>
            <View style={styles.tempCellDivider} />
            <View style={styles.tempCell}>
              <Text style={styles.tempStripLabel}>PAN</Text>
              <Text style={[styles.tempStripValue, { color: '#4FC3F7' }]}>
                {panF == null ? '—' : `${Math.round(panF)}°F`}
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

function StepContent({ step, meat, doneness, timerSecs, timerRunning, onNext }) {
  switch (step) {
    case STEPS.GREASE_PAN:
      return (
        <InstructionCard
          icon="water-outline"
          iconColor="#4FC3F7"
          title="Grease the pan"
          body={`Add a thin layer of oil or butter to your SmartPan and let it heat up before adding the ${meat.label.toLowerCase()}.`}
          tip="A drop of water should sizzle and evaporate immediately when the pan is ready."
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
            tip={`Target internal temp: ${doneness.tempF}°F`}
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
            at {doneness.tempF}°F.
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
