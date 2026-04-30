import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';

const CHART_WINDOW_SECS = 120;
const MAX_JUMP_C = 8;          // physical max rate of change for a meat probe
const MIN_PLAUSIBLE_C = 0;
const MAX_PLAUSIBLE_C = 200;
const MIN_Y_RANGE_C = 12;      // keep flat-line traces from going full-bleed

export default function MeatTempChart({ meatC, width = 320, height = 140 }) {
  const samplesRef = useRef([]);
  const seriesRef = useRef([]);
  const lastAcceptedRef = useRef(null);
  const tStartRef = useRef(null);
  const [, force] = useState(0);

  // Capture every reading the hook emits
  useEffect(() => {
    if (Number.isFinite(meatC)) samplesRef.current.push(meatC);
  }, [meatC]);

  // 1 Hz aggregate + outlier filter
  useEffect(() => {
    const id = setInterval(() => {
      if (tStartRef.current == null) tStartRef.current = Date.now();
      const elapsedSec = Math.floor((Date.now() - tStartRef.current) / 1000);

      const samples = samplesRef.current;
      samplesRef.current = [];
      if (samples.length === 0) return;

      const candidate = samples.reduce((a, b) => a + b, 0) / samples.length;
      let accepted;

      if (candidate < MIN_PLAUSIBLE_C || candidate > MAX_PLAUSIBLE_C) {
        accepted = lastAcceptedRef.current;
      } else if (lastAcceptedRef.current == null) {
        accepted = candidate;
      } else if (Math.abs(candidate - lastAcceptedRef.current) > MAX_JUMP_C) {
        const series = seriesRef.current;
        const ravg = series.length > 0
          ? series.reduce((s, p) => s + p.t, 0) / series.length
          : lastAcceptedRef.current;
        accepted = 0.5 * (lastAcceptedRef.current + ravg);
      } else {
        accepted = candidate;
      }

      if (accepted == null) return;
      lastAcceptedRef.current = accepted;
      seriesRef.current = [
        ...seriesRef.current,
        { x: elapsedSec, t: accepted },
      ].slice(-CHART_WINDOW_SECS);
      force((k) => k + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const series = seriesRef.current;
  const padX = 32;
  const padR = 10;
  const padY = 14;
  const innerW = Math.max(1, width - padX - padR);
  const innerH = Math.max(1, height - padY * 2);

  const view = useMemo(() => {
    if (series.length === 0) {
      return { ready: false };
    }
    const temps = series.map((p) => p.t);
    let yMin = Math.min(...temps);
    let yMax = Math.max(...temps);
    if (yMax - yMin < MIN_Y_RANGE_C) {
      const mid = (yMin + yMax) / 2;
      yMin = mid - MIN_Y_RANGE_C / 2;
      yMax = mid + MIN_Y_RANGE_C / 2;
    }
    const xMin = series[0].x;
    const xMax = Math.max(xMin + 1, series[series.length - 1].x);
    const sx = (x) => padX + ((x - xMin) / (xMax - xMin)) * innerW;
    const sy = (t) => padY + (1 - (t - yMin) / (yMax - yMin)) * innerH;
    let path = `M ${sx(series[0].x)} ${sy(series[0].t)}`;
    for (let i = 1; i < series.length; i++) {
      path += ` L ${sx(series[i].x)} ${sy(series[i].t)}`;
    }
    const ticks = [yMax, (yMin + yMax) / 2, yMin];
    return { ready: true, yMin, yMax, xMin, xMax, path, ticks };
  }, [series, innerW, innerH]);

  if (!view.ready) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>Waiting for probe…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Svg width={width} height={height}>
        {view.ticks.map((t, i) => {
          const y = padY + (1 - (t - view.yMin) / (view.yMax - view.yMin)) * innerH;
          return (
            <React.Fragment key={i}>
              <Line x1={padX} y1={y} x2={width - padR} y2={y} stroke="#222" strokeWidth={1} />
              <SvgText x={padX - 4} y={y + 3} fontSize="9" fill="#666" textAnchor="end">
                {Math.round(t)}°
              </SvgText>
            </React.Fragment>
          );
        })}
        <Path d={view.path} stroke="#FF6B35" strokeWidth={2} fill="none" />
      </Svg>
      <View style={styles.xAxisRow}>
        <Text style={styles.axisLabel}>{view.xMin}s</Text>
        <Text style={styles.titleLabel}>Probe Temp</Text>
        <Text style={styles.axisLabel}>{view.xMax}s</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  placeholder: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  placeholderText: { color: '#555', fontSize: 13 },
  xAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginTop: 2,
  },
  axisLabel: { color: '#666', fontSize: 10, fontWeight: '600' },
  titleLabel: { color: '#888', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
});
