/**
 * Calculates days remaining from today until target end date
 */
export function calculateDaysRemaining(endDateStr: string): number {
  if (!endDateStr) return 0;
  try {
    // A 'YYYY-MM-DD' end date is a local calendar day: new Date() would read it as UTC midnight,
    // i.e. the evening before in Haiti, and count one day too few
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDateStr);
    const end = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    const now = new Date();

    const diffMs = end.getTime() - now.getTime();
    if (diffMs <= 0) return 0;

    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}
