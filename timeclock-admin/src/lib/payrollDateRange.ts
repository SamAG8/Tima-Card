export type DatePreset = 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';

export const PAYROLL_DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'THIS_WEEK', label: 'This Week' },
  { key: 'THIS_MONTH', label: 'This Month' },
  { key: 'LAST_MONTH', label: 'Last Month' },
  { key: 'CUSTOM', label: 'Custom' },
];

export function getPresetDateRange(preset: DatePreset): [string, string] {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  if (preset === 'THIS_WEEK') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return [start.toISOString().split('T')[0], today];
  }
  if (preset === 'THIS_MONTH') {
    return [`${today.slice(0, 8)}01`, today];
  }
  if (preset === 'LAST_MONTH') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return [first.toISOString().split('T')[0], last.toISOString().split('T')[0]];
  }
  return [`${today.slice(0, 8)}01`, today];
}
