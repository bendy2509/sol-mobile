/**
 * Phase 4 of docs/PLAN_DB.md: the operations ledger is the source of truth.
 *
 * Member rows keep running totals (balance, paid hands, hands received, paid-until date) so the
 * screens stay fast. Those totals must always equal what the ledger says: the current-cycle
 * operations replayed by reconstructClientFinancialTimeline (the same replay the reversal uses).
 * This module compares the two; db/ledgerRepository.ts reads, reports and repairs.
 */
export interface ClientTotals {
  currentBalance: number;
  totalPaidAmount: number;
  paidHandsCount: number;
  receivedHandsCount: number;
  hasReceivedHand: boolean;
  paidUntilDate: string | null;
}

export type TotalsField = keyof ClientTotals;

export interface TotalsDifference {
  field: TotalsField;
  stored: ClientTotals[TotalsField];
  ledger: ClientTotals[TotalsField];
}

/** Below one centime two amounts are equal (REAL storage rounding). */
const MONEY_TOLERANCE = 0.005;
const MONEY_FIELDS: TotalsField[] = ['currentBalance', 'totalPaidAmount'];

function same(field: TotalsField, a: ClientTotals[TotalsField], b: ClientTotals[TotalsField]): boolean {
  if (MONEY_FIELDS.includes(field)) return Math.abs(Number(a || 0) - Number(b || 0)) < MONEY_TOLERANCE;
  if (field === 'paidUntilDate') return (a || null) === (b || null);
  if (field === 'hasReceivedHand') return Boolean(a) === Boolean(b);
  return Number(a || 0) === Number(b || 0);
}

/** Fields where the stored totals disagree with the ledger replay (empty = consistent). */
export function diffClientTotals(stored: ClientTotals, ledger: ClientTotals): TotalsDifference[] {
  const fields: TotalsField[] = ['currentBalance', 'totalPaidAmount', 'paidHandsCount', 'receivedHandsCount', 'hasReceivedHand', 'paidUntilDate'];
  return fields.filter((f) => !same(f, stored[f], ledger[f])).map((f) => ({ field: f, stored: stored[f], ledger: ledger[f] }));
}
