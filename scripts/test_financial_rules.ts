import {
  calculatePot,
  calculateHandsCount,
  calculateContributionAmount,
  calculateCoverageDate,
  reconstructClientFinancialTimeline,
  calculateClientPaymentStatus,
} from '../services/financialService';
import { calculateCycleEndDate, calculateDaysRemaining, calculateCycleTotalDays } from '../lib/dateCalculations';
import { Transaction } from '../types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    failed++;
  }
}

console.log('==================================================');
console.log('TEST SUITE: FINANCIAL RULES & EDGE CASES AUDIT');
console.log('==================================================\n');

// 1. Pot Calculations
assert(calculatePot(250, 12) === 3000, 'calculatePot(250, 12) == 3000 HTG');
assert(calculatePot(500, 10) === 5000, 'calculatePot(500, 10) == 5000 HTG');
assert(calculatePot(0, 10) === 0, 'calculatePot(0, 10) == 0 HTG');

// 2. Hands Count and Multiples
assert(calculateHandsCount(750, 250) === 3, 'calculateHandsCount(750, 250) == 3 mains');
assert(calculateHandsCount(250, 250) === 1, 'calculateHandsCount(250, 250) == 1 main');
assert(calculateContributionAmount(4, 250) === 1000, 'calculateContributionAmount(4, 250) == 1000 HTG');

// 3. Cycle Total Days and Dynamic End Date
// Formula: Total Days = Children Count * Frequency Interval
assert(calculateCycleTotalDays(12, 'DAILY') === 12, '12 children * DAILY (1d) = 12 days');
assert(calculateCycleTotalDays(12, '8_DAYS') === 96, '12 children * 8_DAYS (8d) = 96 days');
assert(calculateCycleTotalDays(12, '15_DAYS') === 180, '12 children * 15_DAYS (15d) = 180 days');
assert(calculateCycleTotalDays(12, 'MONTHLY') === 360, '12 children * MONTHLY (30d) = 360 days');
assert(calculateCycleTotalDays(12, 'WED_SAT') === 42, '12 children * WED_SAT (2 per week = 6 weeks = 42d) = 42 days');

// 4. Coverage Date Calculations & Advances
// Test 1: Daily Single Hand
const cov1 = calculateCoverageDate({
  todayStr: '2026-08-10',
  handsCovered: 1,
  frequency: 'DAILY',
});
assert(cov1.paidUntilDate === '2026-08-10', 'Single daily hand covers today 2026-08-10', `Got ${cov1.paidUntilDate}`);

// Test 2: Daily 3 Hands (Advance)
const cov2 = calculateCoverageDate({
  todayStr: '2026-08-10',
  handsCovered: 3,
  frequency: 'DAILY',
});
assert(cov2.paidUntilDate === '2026-08-12', '3 daily hands on 2026-08-10 cover until 2026-08-12', `Got ${cov2.paidUntilDate}`);

// Test 3: Extending existing advance
// If today is 2026-08-11 and currentPaidUntilDate is 2026-08-12, paying 2 more hands must extend from 2026-08-13
const cov3 = calculateCoverageDate({
  todayStr: '2026-08-11',
  handsCovered: 2,
  frequency: 'DAILY',
  currentPaidUntilDate: '2026-08-12',
});
assert(cov3.startDate === '2026-08-13' && cov3.paidUntilDate === '2026-08-14', 'Advance extension starts 2026-08-13 and ends 2026-08-14', `Got start ${cov3.startDate}, end ${cov3.paidUntilDate}`);

// Test 4: 15_DAYS frequency
const cov4 = calculateCoverageDate({
  todayStr: '2026-08-01',
  handsCovered: 2,
  frequency: '15_DAYS',
});
assert(cov4.paidUntilDate === '2026-08-16', '2 hands of 15_DAYS covers 15 days ahead (2026-08-16)', `Got ${cov4.paidUntilDate}`);

// Test 5: Month Boundary & Leap Year (Feb 28/29)
const cov5 = calculateCoverageDate({
  todayStr: '2024-01-31', // 2024 is a leap year (Feb has 29 days)
  handsCovered: 2,
  frequency: 'MONTHLY',
});
assert(cov5.paidUntilDate === '2024-02-29', 'Monthly leap year Feb end date is 2024-02-29', `Got ${cov5.paidUntilDate}`);

// 5. Payment Status Evaluation
const statAdvance = calculateClientPaymentStatus({
  todayStr: '2026-08-10',
  paidUntilDate: '2026-08-14',
  currentBalance: 1000,
  unitAmount: 250,
});
assert(statAdvance.status === 'PAID_IN_ADVANCE' && statAdvance.handsCoveredAhead === 4, 'Status is PAID_IN_ADVANCE (+4 days)', `Got ${statAdvance.status}`);

const statToday = calculateClientPaymentStatus({
  todayStr: '2026-08-10',
  paidUntilDate: '2026-08-10',
  currentBalance: 250,
  unitAmount: 250,
});
assert(statToday.status === 'PAID_TODAY', 'Status is PAID_TODAY', `Got ${statToday.status}`);

const statOverdue = calculateClientPaymentStatus({
  todayStr: '2026-08-12',
  paidUntilDate: '2026-08-10',
  currentBalance: 0,
  unitAmount: 250,
});
assert(statOverdue.status === 'OVERDUE' && statOverdue.overdueRoundsCount === 2, 'Status is OVERDUE (-2 days)', `Got ${statOverdue.status}`);

// 6. Timeline Reconstruction & Reversal
const mockTxs: Transaction[] = [
  {
    id: 'tx-1',
    clientId: 'client-1',
    memberId: 'client-1',
    collectorId: 'col-1',
    amount: 250,
    handsCovered: 1,
    type: 'SOL_CONTRIBUTION',
    createdAtLocal: '2026-08-01T10:00:00.000Z',
    syncStatus: 'SYNCED',
  },
  {
    id: 'tx-2',
    clientId: 'client-1',
    memberId: 'client-1',
    collectorId: 'col-1',
    amount: 500,
    handsCovered: 2,
    type: 'SOL_CONTRIBUTION',
    createdAtLocal: '2026-08-02T10:00:00.000Z',
    syncStatus: 'SYNCED',
  },
  {
    id: 'tx-3',
    clientId: 'client-1',
    memberId: 'client-1',
    collectorId: 'col-1',
    amount: 250,
    handsCovered: 1,
    type: 'SOL_CONTRIBUTION',
    createdAtLocal: '2026-08-03T10:00:00.000Z',
    syncStatus: 'SYNCED',
  },
];

const timeline1 = reconstructClientFinancialTimeline({
  transactions: mockTxs,
  unitAmount: 250,
  frequency: 'DAILY',
  cycleStartDate: '2026-08-01',
});

assert(timeline1.totalPaidAmount === 1000, 'Total paid reconstructed = 1000 HTG');
assert(timeline1.paidHandsCount === 4, 'Total paid hands reconstructed = 4 mains');
assert(timeline1.paidUntilDate === '2026-08-04', 'Paid until reconstructed = 2026-08-04');

// Reversal test: When tx-2 is reversed
const mockTxsReversed: Transaction[] = [
  ...mockTxs.map((t) => (t.id === 'tx-2' ? { ...t, isReversed: true } : t)),
  {
    id: 'tx-rev-2',
    clientId: 'client-1',
    memberId: 'client-1',
    collectorId: 'col-1',
    amount: 500,
    handsCovered: 2,
    type: 'REVERSAL',
    note: 'ANNULATION [Réf #tx-2] : Erreur',
    createdAtLocal: '2026-08-04T10:00:00.000Z',
    syncStatus: 'SYNCED',
  },
];

const timelineReversed = reconstructClientFinancialTimeline({
  transactions: mockTxsReversed,
  unitAmount: 250,
  frequency: 'DAILY',
  cycleStartDate: '2026-08-01',
});

assert(timelineReversed.totalPaidAmount === 500, 'After reversal of tx-2, total paid = 500 HTG', `Got ${timelineReversed.totalPaidAmount}`);
assert(timelineReversed.paidHandsCount === 2, 'After reversal of tx-2, paid hands count = 2', `Got ${timelineReversed.paidHandsCount}`);
assert(timelineReversed.paidUntilDate === '2026-08-03', 'After reversal of tx-2, paid until recalculated to 2026-08-03', `Got ${timelineReversed.paidUntilDate}`);

console.log('\n==================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
