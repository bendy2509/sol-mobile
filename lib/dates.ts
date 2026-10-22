/**
 * Date convention (docs/PLAN_DB.md, phase 6):
 *
 * - Instants (created_at, created_at_local, applied_at…) are stored as ISO 8601 UTC strings
 *   (`new Date().toISOString()`).
 * - Calendar days (closure date, cycle start / end, paid-until…) are stored as `YYYY-MM-DD`
 *   in the manager's local time zone, and displayed as local days (lib/formatters.ts).
 *
 * `new Date().toISOString().split('T')[0]` is the UTC day: in Haiti (UTC−4/−5) it already reads
 * « tomorrow » from 20:00. Use localDateString() for a calendar day.
 *
 * Since phase 4 « today » and the day of an operation are both local days on every side of
 * each comparison (statuses, coverage, payouts), so a collection at 21:00 counts for that day.
 */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local calendar day of an instant (ISO string); a value that is already a day is kept. */
export function localDayOf(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.split('T')[0] : localDateString(date);
}
