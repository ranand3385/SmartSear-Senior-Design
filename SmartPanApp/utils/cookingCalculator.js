import { COOK_TIME_PER_INCH } from '../constants/meatData';

/**
 * Calculate cook time per side in seconds.
 * @param {string} meatId  - e.g. 'steak'
 * @param {string} donenessId - e.g. 'medium_rare'
 * @param {number} thicknessInches - e.g. 1.5
 * @returns {number} seconds per side
 */
export function calcCookTimePerSide(meatId, donenessId, thicknessInches) {
  const meatTimes = COOK_TIME_PER_INCH[meatId];
  if (!meatTimes) return 180; // fallback 3 min
  const minutesPerInch = meatTimes[donenessId] ?? Object.values(meatTimes)[0];
  const totalMinutes = minutesPerInch * thicknessInches;
  return Math.round(totalMinutes * 60);
}

/**
 * Format seconds into MM:SS string.
 */
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
