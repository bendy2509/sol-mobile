// Node built-ins without @types/node (the app's tsconfig has no Node types)
declare const process: { env: Record<string, string | undefined>; exit(code: number): never };

// Haiti's time zone, so « 21:30 local » is a different UTC day (set before any Date is built)
process.env.TZ = 'America/Port-au-Prince';

import {
  calculateClientPaymentStatus,
  calculateCoverageDate,
  calculateCycleContributionLimits,
  calculateCycleTotalHands,
  calculateMemberDuePerRound,
  calculateMemberTotalCyclePot,
  calculatePotAmount,
  reconstructClientFinancialTimeline,
} from '../services/financialService';
import { ClientTotals, diffClientTotals } from '../services/ledgerConsistency';
import { localDateString, localDayOf } from '../lib/dates';
import { Transaction } from '../types';

console.log('==================================================');
console.log('TEST SUITE: LEDGER AS SOURCE OF TRUTH + LOCAL DAYS');
console.log('==================================================\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${name}`);
    failed++;
  }
}

let seq = 0;
const tx = (type: Transaction['type'], amount: number, at: string, extra: Partial<Transaction> = {}): Transaction =>
  ({
    id: `tx-${++seq}-0000-0000`,
    clientId: 'k1',
    collectorId: 'c1',
    amount,
    handsCovered: type === 'SOL_CONTRIBUTION' ? amount / 250 : 1,
    type,
    paymentMethod: 'CASH',
    createdAtLocal: at,
    syncStatus: 'SYNCED',
    ...extra,
  }) as Transaction;

const replay = (txs: Transaction[], handsCount = 1) =>
  reconstructClientFinancialTimeline({ transactions: txs, unitAmount: 250, frequency: 'DAILY', cycleStartDate: '2026-10-20', handsCount });

// 1. Local days
assert(localDayOf('2026-10-23T01:30:00.000Z') === '2026-10-22', '21:30 in Haiti (01:30 UTC next day) is still the local day');
assert(localDayOf('2026-10-22T15:00:00.000Z') === '2026-10-22', 'An afternoon operation keeps its day');
assert(localDayOf('2026-10-22') === '2026-10-22', 'A value that is already a day is kept');
assert(localDateString(new Date('2026-10-23T01:30:00.000Z')) === '2026-10-22', 'Today at 21:30 local is not « tomorrow »');

// 2. Ledger replay = expected totals
const c1 = tx('SOL_CONTRIBUTION', 500, '2026-10-20T14:00:00.000Z'); // 2 hands on the 20th
const c2 = tx('SOL_CONTRIBUTION', 250, '2026-10-23T01:30:00.000Z'); // 1 hand, evening of the 22nd
const p1 = tx('SOL_PAYOUT', 1000, '2026-10-22T16:00:00.000Z');
const base = replay([c1, c2, p1]);
assert(base.totalPaidAmount === 750 && base.paidHandsCount === 3, 'Total paid and hands are the sum of the contributions');
assert(base.currentBalance === 250, 'Balance follows the timeline: 500 paid, 1 000 paid out (floored at 0), then 250 paid');
assert(replay([c1, p1]).currentBalance === 0, 'A payout larger than the balance never makes it negative');
assert(base.receivedHandsCount === 1 && base.hasReceivedHand, 'The payout counts as a hand received');
assert(base.handReceivedDate === '2026-10-22', 'The hand-received date is the local day of the payout');
const expectedUntil = calculateCoverageDate({
  todayStr: '2026-10-22',
  handsCovered: 1,
  frequency: 'DAILY',
  currentPaidUntilDate: calculateCoverageDate({ todayStr: '2026-10-20', handsCovered: 2, frequency: 'DAILY', currentPaidUntilDate: null }).paidUntilDate,
}).paidUntilDate;
assert(base.paidUntilDate === expectedUntil, 'Paid-until replays coverage from each operation’s local day');

// 3. Order does not matter, reversals cancel
assert(JSON.stringify(replay([p1, c2, c1])) === JSON.stringify(base), 'Replay sorts operations: input order does not change the totals');
const reversedC2 = { ...c2, isReversed: true };
const reversal = tx('REVERSAL', 250, '2026-10-23T12:00:00.000Z', { note: `ANNULATION GESTIONNAIRE [Réf #${c2.id.slice(0, 8)}] : erreur` });
const afterReversal = replay([c1, reversedC2, reversal, p1]);
assert(afterReversal.totalPaidAmount === 500 && afterReversal.paidHandsCount === 2, 'A reversed contribution no longer counts');
assert(replay([c1, c2, reversal, p1]).totalPaidAmount === 500, 'The REVERSAL note alone identifies the cancelled operation');

// 4. Comparing stored totals with the ledger
const asTotals = (r: ReturnType<typeof replay>): ClientTotals => ({
  currentBalance: r.currentBalance,
  totalPaidAmount: r.totalPaidAmount,
  paidHandsCount: r.paidHandsCount,
  receivedHandsCount: r.receivedHandsCount,
  hasReceivedHand: r.hasReceivedHand,
  paidUntilDate: r.paidUntilDate,
});
const ledger = asTotals(base);
assert(diffClientTotals(ledger, ledger).length === 0, 'Identical totals: no difference');
assert(diffClientTotals({ ...ledger, totalPaidAmount: 750.004 }, ledger).length === 0, 'A sub-centime rounding gap is not a difference');
const drift = diffClientTotals({ ...ledger, paidHandsCount: 10, totalPaidAmount: 2500 }, ledger);
assert(drift.length === 2 && drift.some((d) => d.field === 'paidHandsCount' && d.stored === 10 && d.ledger === 3), 'Drifted counters are reported with stored and ledger values (« 10/4 mains »)');
assert(diffClientTotals({ ...ledger, paidUntilDate: null }, ledger)[0]?.field === 'paidUntilDate', 'A missing coverage date is reported');
assert(diffClientTotals({ ...ledger, hasReceivedHand: 1 as unknown as boolean }, ledger).length === 0, 'SQLite 0/1 flags compare as booleans');

// 5. Status of an evening payment, with local days on both sides
const eveningPaidUntil = calculateCoverageDate({ todayStr: localDayOf('2026-10-23T01:30:00.000Z'), handsCovered: 1, frequency: 'DAILY', currentPaidUntilDate: null }).paidUntilDate;
const status = calculateClientPaymentStatus({ todayStr: '2026-10-22', paidUntilDate: eveningPaidUntil, hasPaidToday: true, currentBalance: 250, unitAmount: 250 });
assert(status.status === 'PAID_TODAY', 'Paid at 21:30: the member shows « Payé aujourd’hui » that evening, not « en avance »');

// 6. The sol rule, with the manager's own example: 500 G a hand, Bendy 1 hand, Servilus 3 hands
const members = [{ handsCount: 1 }, { handsCount: 3 }];
const totalHands = calculateCycleTotalHands(members);
assert(totalHands === 4, 'Bendy (1) + Servilus (3) = 4 hands in the sol');
assert(calculatePotAmount(totalHands, 500) === 2000, 'Each hand drawn receives 4 × 500 G = 2 000 G');
const bendy = calculateCycleContributionLimits({ currentPaidHands: 0, totalCycleHands: totalHands, memberHandsCount: 1, unitAmount: 500 });
assert(bendy.maxAllowedHands === 4 && bendy.maxPotAmount === 2000, 'Bendy pays 4 hands = 2 000 G over the cycle');
assert(calculateMemberTotalCyclePot(1, totalHands, 500) === 2000, 'Bendy receives 2 000 G: what he pays');
const servilus = calculateCycleContributionLimits({ currentPaidHands: 0, totalCycleHands: totalHands, memberHandsCount: 3, unitAmount: 500 });
assert(servilus.maxAllowedHands === 12 && servilus.maxPotAmount === 6000, 'Servilus pays 3 × 2 000 G = 6 000 G over the cycle');
assert(calculateMemberTotalCyclePot(3, totalHands, 500) === 6000, 'Servilus receives 3 hands × 2 000 G = 6 000 G: what he pays');
assert(calculateMemberDuePerRound(3, 500) === 1500, 'Servilus pays 1 500 G per round (3 hands)');
const capped = calculateCycleContributionLimits({ currentPaidHands: 4, totalCycleHands: totalHands, memberHandsCount: 1, unitAmount: 500 });
assert(capped.isCycleCompleted && capped.remainingHands === 0, 'Once Bendy has paid his 2 000 G, no further collection is accepted');

// 7. A member just enrolled, nothing paid yet
const fresh = calculateClientPaymentStatus({ todayStr: '2026-10-22', paidUntilDate: null, hasPaidToday: false, currentBalance: 0, unitAmount: 500 });
assert(fresh.status === 'UNPAID_TODAY', 'A member who never paid is « À encaisser », not « Payé aujourd’hui » nor « en retard »');
const firstPayment = calculateCoverageDate({ todayStr: '2026-10-22', handsCovered: 1, frequency: 'DAILY', currentPaidUntilDate: null });
assert(firstPayment.paidUntilDate === '2026-10-22', 'The first payment of a new member covers today, not tomorrow');
const oldBehaviour = calculateCoverageDate({ todayStr: '2026-10-22', handsCovered: 1, frequency: 'DAILY', currentPaidUntilDate: '2026-10-22' });
assert(oldBehaviour.paidUntilDate === '2026-10-23', '(Why it mattered: a false « covered today » pushed that payment to tomorrow)');

// 8. Today's hand is « À encaisser », late only from the next day (manager's rule)
const dueToday = calculateClientPaymentStatus({ todayStr: '2026-10-22', paidUntilDate: '2026-10-21', hasPaidToday: false, currentBalance: 500, unitAmount: 500 });
assert(dueToday.status === 'UNPAID_TODAY' && dueToday.overdueRoundsCount === 0, 'Covered until yesterday: « À encaisser » during the day');
const lateSinceYesterday = calculateClientPaymentStatus({ todayStr: '2026-10-22', paidUntilDate: '2026-10-20', hasPaidToday: false, currentBalance: 0, unitAmount: 500 });
assert(lateSinceYesterday.status === 'OVERDUE' && lateSinceYesterday.overdueRoundsCount === 2, 'Yesterday’s hand unpaid: « En retard · 2 tours » (yesterday and today)');
const paidThisMorning = calculateClientPaymentStatus({ todayStr: '2026-10-22', paidUntilDate: '2026-10-22', hasPaidToday: true, currentBalance: 500, unitAmount: 500 });
assert(paidThisMorning.status === 'PAID_TODAY', 'Paid today: « Payé aujourd’hui »');

console.log('\n==================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================');
process.exit(failed > 0 ? 1 : 0);
