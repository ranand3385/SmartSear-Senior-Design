import { COOK_TIME_PER_INCH } from '../constants/meatData';

// Baseline pan temperature (°C) the COOK_TIME_PER_INCH constants were calibrated at
// 190 °C ≈ 375 °F — the previous baseline.
export const BASE_PAN_TEMP = 190;

/**
 * Calculate cook time per side in seconds, scaled for actual pan temperature.
 * Cook time scales inversely with pan temp — a cooler pan takes proportionally longer.
 *
 * @param {string} meatId          - e.g. 'steak'
 * @param {string} donenessId      - e.g. 'medium_rare'
 * @param {number} thicknessInches - e.g. 1.5
 * @param {number} panTempC        - actual pan surface temperature in °C (defaults to BASE_PAN_TEMP)
 * @returns {number} seconds per side
 */
export function calcCookTimePerSide(meatId, donenessId, thicknessInches, panTempC = BASE_PAN_TEMP) {
  const meatTimes = COOK_TIME_PER_INCH[meatId];
  if (!meatTimes) return 180; // fallback 3 min
  const minutesPerInch = meatTimes[donenessId] ?? Object.values(meatTimes)[0];
  const baseSeconds = Math.round(minutesPerInch * thicknessInches * 60);
  // Scale inversely: cooler pan → more time, hotter pan → less time
  return Math.round(baseSeconds * (BASE_PAN_TEMP / panTempC));
}

/**
 * Format seconds into MM:SS string.
 */
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
