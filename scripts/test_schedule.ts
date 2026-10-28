// Node built-ins without @types/node (the app's tsconfig has no Node types)
declare const process: { env: Record<string, string | undefined>; exit(code: number): never };

// Haiti's time zone: weekday and day boundaries must hold there (set before any Date is built)
process.env.TZ = 'America/Port-au-Prince';

import {
  buildCycleRounds,
  buildMemberSchedule,
  computeMemberSchedule,
  getCycleDates,
  paidUntilFromHands,
} from '../services/scheduleService';
import { calculateClientPaymentStatus, reconstructClientFinancialTimeline } from '../services/financialService';
import { calculateCycleEndDate } from '../lib/dateCalculations';
import { Transaction } from '../types';

console.log('==================================================');
console.log('TEST SUITE: SOL CALENDAR (ROUNDS, SCHEDULE, STATUS)');
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

// The manager's example: 500 G a hand, daily, Bendy 1 hand + SERVILUS 3 hands = 4 rounds
const START = '2026-10-20';
const rounds = buildCycleRounds(START, 'DAILY', 4);

// 1. Rounds and cycle dates
assert(rounds.join(',') === '2026-10-20,2026-10-21,2026-10-22,2026-10-23', 'One round per hand: 4 rounds from the 20th to the 23rd');
assert(getCycleDates(START, 'DAILY', 4).endDate === '2026-10-23', 'End date = day of the last round (start + 3 days)');
assert(calculateCycleEndDate(START, 4, 'DAILY') === '2026-10-23', 'calculateCycleEndDate gives the same end date');
assert(buildCycleRounds('2026-10-20', '8_DAYS', 3).join(',') === '2026-10-20,2026-10-28,2026-11-05', 'Every 8 days');
assert(buildCycleRounds('2026-01-31', 'MONTHLY', 3).join(',') === '2026-01-31,2026-02-28,2026-03-31', 'Monthly keeps the day, Feb 28 when the month is short');
// 2026-10-20 is a Tuesday: first Wednesday the 21st, then Saturday 24th, Wednesday 28th
assert(buildCycleRounds('2026-10-20', 'WED_SAT', 3).join(',') === '2026-10-21,2026-10-24,2026-10-28', 'Wednesday & Saturday read in Haiti time (no day shift)');
assert(calculateCycleEndDate('2026-10-20', 3, 'WED_SAT') === '2026-10-28', 'Wednesday & Saturday end date in Haiti time');
assert(buildCycleRounds('2026-10-24', 'WEEKLY_SAT', 2).join(',') === '2026-10-24,2026-10-31', 'A start on a Saturday is round 1');

// 2. SERVILUS (3 hands) pays 1 500 G = 3 hands on the 20th: round 1 paid
const s1 = buildMemberSchedule({ rounds, memberHands: 3, paidHands: 3, todayStr: '2026-10-20' });
assert(s1.rounds[0].state === 'PAID' && s1.paidUntilDate === '2026-10-20', 'SERVILUS pays 3 hands: the round of the 20th is paid');
assert(s1.nextDueDate === '2026-10-21', 'Next due date: the round of the 21st');
assert(calculateClientPaymentStatus({ todayStr: '2026-10-20', currentBalance: 1500, unitAmount: 500, schedule: { cycleStartDate: START, frequency: 'DAILY', totalCycleHands: 4, memberHands: 3, paidHands: 3 } }).status === 'PAID_TODAY', '« Payé aujourd’hui » on the 20th');

// 3. SERVILUS pays only 500 G (1 hand) on the 21st: partial, then late the next day
const partialToday = computeMemberSchedule({ cycleStartDate: START, frequency: 'DAILY', totalCycleHands: 4, memberHands: 3, paidHands: 4, todayStr: '2026-10-21' });
assert(partialToday.rounds[1].state === 'PARTIAL' && partialToday.rounds[1].paidHands === 1, 'The round of the 21st has 1 hand of 3: partial');
assert(partialToday.status.status === 'UNPAID_TODAY' && partialToday.status.missingHandsToday === 2 && partialToday.status.isPartialToday, 'Same day: « À encaisser », partial, 2 hands to collect');
assert(partialToday.paidUntilDate === '2026-10-20', 'Paid until stays the 20th: the 21st is not fully paid');
const partialNextDay = computeMemberSchedule({ cycleStartDate: START, frequency: 'DAILY', totalCycleHands: 4, memberHands: 3, paidHands: 4, todayStr: '2026-10-22' });
assert(partialNextDay.rounds[1].state === 'LATE', 'Next day the round of the 21st is late');
assert(partialNextDay.status.status === 'OVERDUE' && partialNextDay.status.lateHands === 2, '« En retard · 2 mains » for the 21st');
assert(partialNextDay.status.installmentsOverdue === 5, 'Owed up to the 22nd: 2 late hands + 3 hands of the day');

// 4. A 2-hand member who pays 1 hand pays that day's round for one hand only
const twoHands = computeMemberSchedule({ cycleStartDate: START, frequency: 'DAILY', totalCycleHands: 4, memberHands: 2, paidHands: 1, todayStr: '2026-10-20' });
assert(twoHands.status.status === 'UNPAID_TODAY' && twoHands.status.missingHandsToday === 1, '2 hands, 1 paid: « À encaisser », 1 hand left (not « Payé aujourd’hui »)');
assert(twoHands.paidUntilDate === null, 'Paid until: none (no round fully paid)');
const twoHandsLater = computeMemberSchedule({ cycleStartDate: START, frequency: 'DAILY', totalCycleHands: 4, memberHands: 2, paidHands: 1, todayStr: '2026-10-21' });
assert(twoHandsLater.status.status === 'OVERDUE' && twoHandsLater.status.lateHands === 1, 'Next day: the second hand is late');

// 5. Dues run from the cycle start: a member enrolled on day 3 owes days 1 to 3
const lateJoiner = computeMemberSchedule({ cycleStartDate: START, frequency: 'DAILY', totalCycleHands: 4, memberHands: 1, paidHands: 0, todayStr: '2026-10-22' });
assert(lateJoiner.status.status === 'OVERDUE' && lateJoiner.status.lateHands === 2 && lateJoiner.status.missingHandsToday === 1, 'Enrolled on the 22nd: the 20th and 21st are late, the 22nd is to collect');
const caughtUp = computeMemberSchedule({ cycleStartDate: START, frequency: 'DAILY', totalCycleHands: 4, memberHands: 1, paidHands: 3, todayStr: '2026-10-22' });
assert(caughtUp.status.status === 'PAID_TODAY' && caughtUp.paidUntilDate === '2026-10-22', 'Paying 3 hands catches up to the 22nd');

// 6. Advance and end of cycle
const ahead = computeMemberSchedule({ cycleStartDate: START, frequency: 'DAILY', totalCycleHands: 4, memberHands: 1, paidHands: 3, todayStr: '2026-10-20' });
assert(ahead.status.status === 'PAID_IN_ADVANCE' && ahead.status.handsCoveredAhead === 2 && ahead.paidUntilDate === '2026-10-22', '3 hands on day 1: in advance by 2 rounds, covered until the 22nd');
const done = computeMemberSchedule({ cycleStartDate: START, frequency: 'DAILY', totalCycleHands: 4, memberHands: 1, paidHands: 4, todayStr: '2026-10-30' });
assert(done.status.status === 'PAID_TODAY' && done.nextDueDate === null, 'Everything paid after the end: up to date, nothing left due');
assert(paidUntilFromHands({ cycleStartDate: START, frequency: 'DAILY', memberHands: 1, paidHands: 9, totalRounds: 4 }) === '2026-10-23', 'Paid-until never passes the last round');

// 7. Ledger replay uses the same calendar; no contribution left = no coverage
let seq = 0;
const tx = (amount: number, at: string, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++seq}-0000`, clientId: 'k', collectorId: 'c', amount, handsCovered: amount / 500, type: 'SOL_CONTRIBUTION', paymentMethod: 'CASH', createdAtLocal: at, syncStatus: 'SYNCED', ...extra }) as Transaction;
const replay = (txs: Transaction[], handsCount = 3) =>
  reconstructClientFinancialTimeline({ transactions: txs, unitAmount: 500, frequency: 'DAILY', cycleStartDate: START, handsCount, totalCycleHands: 4 });
const a = tx(1500, '2026-10-20T14:00:00.000Z');
const b = tx(500, '2026-10-22T01:30:00.000Z'); // evening of the 21st in Haiti
assert(replay([a, b]).paidUntilDate === '2026-10-20' && replay([a, b]).paidHandsCount === 4, 'Replay: 4 hands for a 3-hand member = round of the 20th + 1 hand');
assert(replay([{ ...a, isReversed: true }]).paidUntilDate === null, 'All contributions reversed: no coverage (not the cycle start)');

console.log('\n==================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================');
process.exit(failed > 0 ? 1 : 0);
