/**
 * Classify worked hours vs a standard day (no per-worker schedule in API yet).
 * Early: clearly short day; Late: overtime / long day.
 */
export const TARGET_SHIFT_HOURS = 8;
const EARLY_MAX_HOURS = 7.25;
const LATE_MIN_HOURS = 9.25;

export type ShiftBand = 'early' | 'late' | 'normal';

export function classifyShiftHours(hoursWorked: number): ShiftBand {
  if (hoursWorked < EARLY_MAX_HOURS) return 'early';
  if (hoursWorked > LATE_MIN_HOURS) return 'late';
  return 'normal';
}
