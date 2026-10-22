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
 * Note: the member-status rules still derive « today » and operation days the UTC way on both
 * sides of each comparison, which keeps them consistent with each other; moving them to local
 * days is scheduled with phase 4, under the financial test suites.
 */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
