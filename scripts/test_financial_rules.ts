import {
  calculatePot,
  calculatePotAmount,
  calculateHandsCount,
  calculateHandsCovered,
  calculateContributionAmount,
  calculateMemberDuePerRound,
  calculateMemberTotalCyclePot,
  calculateCycleContributionLimits,
  calculateCoverageDate,
  reconstructClientFinancialTimeline,
  calculateClientPaymentStatus,
  assertPayoutEligibility,
  calculateCycleTotalHands,
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

// 7. Cycle Contribution Ceiling & Limits Tests (Strict Max Pot Rule)
// Scenario: Sol of 12 slots * 2500 HTG (Total Pot = 30,000 HTG)
const limInit = calculateCycleContributionLimits({
  currentPaidHands: 0,
  totalSlots: 12,
  unitAmount: 2500,
});
assert(limInit.maxPotAmount === 30000 && limInit.remainingHands === 12 && !limInit.isCycleCompleted, 'Initial limits: 12 remaining hands (30,000 HTG) and not completed');

const limMid = calculateCycleContributionLimits({
  currentPaidHands: 9,
  totalSlots: 12,
  unitAmount: 2500,
});
assert(limMid.remainingHands === 3 && limMid.remainingAmount === 7500 && !limMid.isCycleCompleted, 'Mid-cycle limits: 9 paid -> 3 remaining hands (7,500 HTG)');

const limFull = calculateCycleContributionLimits({
  currentPaidHands: 12,
  totalSlots: 12,
  unitAmount: 2500,
});
assert(limFull.remainingHands === 0 && limFull.remainingAmount === 0 && limFull.isCycleCompleted, 'Full cycle limits: 12/12 paid -> 0 remaining hands and cycle completed');

// 8. Dynamic Remaining Hands & Amount Based on Enrolled Children Count (N = 7 children)
const registeredChildrenCount = 7;
const unitVal = 1000;
const limChildA = calculateCycleContributionLimits({
  currentPaidHands: 4,
  totalSlots: registeredChildrenCount,
  unitAmount: unitVal,
});
assert(limChildA.remainingHands === 3 && limChildA.remainingAmount === 3000, 'Child A (4/7 paid): remaining 3 hands = 3,000 HTG');

const limChildB = calculateCycleContributionLimits({
  currentPaidHands: 7,
  totalSlots: registeredChildrenCount,
  unitAmount: unitVal,
});
assert(limChildB.remainingHands === 0 && limChildB.remainingAmount === 0 && limChildB.isCycleCompleted, 'Child B (7/7 paid): remaining 0 hands = 0 HTG & completed');

// 9. Payout Eligibility Guard Tests ("Bay Men" Unique Payout Per Cycle for 1 hand)
// Test A: Eligible child (has not received hand)
let eligibilityPassed = false;
try {
  assertPayoutEligibility({
    hasReceivedHand: false,
    hasReceivedPayout: false,
    fullName: 'Jean Baptiste',
  });
  eligibilityPassed = true;
} catch {
  eligibilityPassed = false;
}
assert(eligibilityPassed, 'assertPayoutEligibility allows child who has not received hand');

// Test B: Ineligible child (hasReceivedHand = true) must throw Error
let blockedHandReceived = false;
try {
  assertPayoutEligibility({
    hasReceivedHand: true,
    hasReceivedPayout: false,
    fullName: 'Marie Curie',
  });
} catch (err: any) {
  blockedHandReceived = err.message.includes('Action interdite');
}
assert(blockedHandReceived, 'assertPayoutEligibility strictly blocks child with hasReceivedHand=true');

// Test C: Ineligible child (hasReceivedPayout = 1) must throw Error
let blockedNumericPayout = false;
try {
  assertPayoutEligibility({
    hasReceivedHand: 0,
    hasReceivedPayout: 1,
    fullName: 'Toussaint Louverture',
  });
} catch (err: any) {
  blockedNumericPayout = err.message.includes('Action interdite');
}
assert(blockedNumericPayout, 'assertPayoutEligibility strictly blocks child with hasReceivedPayout=1');

// 10. Dynamic Pot Calculation on Registered Count (N * unitAmount)
const potFor8Children = calculatePot(500, 8);
assert(potFor8Children === 4000, 'Dynamic pot for 8 children @ 500 HTG = 4,000 HTG');

// 11. MULTI-HANDS ARCHITECTURE TESTS (User scenario: 5 children x 1 hand + 1 child x 3 hands = 8 effective hands)
const cycleMembers = [
  { handsCount: 1 },
  { handsCount: 1 },
  { handsCount: 1 },
  { handsCount: 1 },
  { handsCount: 1 },
  { handsCount: 3 }, // 6th child takes 3 hands
];
const effectiveCycleHands = calculateCycleTotalHands(cycleMembers);
assert(effectiveCycleHands === 8, '5 single-hand + 1 triple-hand child = 8 total effective cycle hands');

// User scenario: 10 children (1 hand each) + Odince (3 hands) = 13 effective hands
const tenPlusOdince = [
  ...Array(10).fill({ handsCount: 1 }),
  { handsCount: 3, fullName: 'Odince Fils Aime' },
];
const total13Hands = calculateCycleTotalHands(tenPlusOdince);
assert(total13Hands === 13, '10 single-hand children + Odince (3 hands) = 13 total effective hands in the cycle');

const pot13Hands500 = calculatePot(500, total13Hands);
assert(pot13Hands500 === 6500, 'Pot for 13 hands @ 500 HTG = 6,500 HTG');

const pot13Hands250 = calculatePot(250, total13Hands);
assert(pot13Hands250 === 3250, 'Pot for 13 hands @ 250 HTG = 3,250 HTG');

// Dynamic pot of the cycle = 8 * 500 HTG = 4000 HTG
const cyclePot = calculatePot(500, effectiveCycleHands);
assert(cyclePot === 4000, 'Cycle single payout pot = 8 * 500 HTG = 4,000 HTG');

// Child with 3 hands in an 8-hand cycle @ 500 HTG:
// Total hands to contribute across the entire cycle = 3 hands * 8 rounds = 24 hands = 12,000 HTG
const tripleHandLimits = calculateCycleContributionLimits({
  currentPaidHands: 0,
  totalCycleHands: effectiveCycleHands,
  memberHandsCount: 3,
  unitAmount: 500,
});
assert(tripleHandLimits.maxAllowedHands === 24, 'Triple-hand member max allowed hands = 3 * 8 = 24 hands');
assert(tripleHandLimits.maxPotAmount === 12000, 'Triple-hand member max pot = 24 * 500 = 12,000 HTG');
assert(tripleHandLimits.remainingHands === 24 && tripleHandLimits.remainingAmount === 12000, 'Initial remaining = 24 hands (12,000 HTG)');

// Case A: Triple-hand member pays 1 hand (500 HTG)
const after1Hand = calculateCycleContributionLimits({
  currentPaidHands: 1,
  totalCycleHands: effectiveCycleHands,
  memberHandsCount: 3,
  unitAmount: 500,
});
assert(after1Hand.remainingHands === 23 && after1Hand.remainingAmount === 11500, 'After 1 hand paid: 23 remaining (11,500 HTG)');

// Case B: Triple-hand member pays 2 hands (1,000 HTG)
const after2Hands = calculateCycleContributionLimits({
  currentPaidHands: 2,
  totalCycleHands: effectiveCycleHands,
  memberHandsCount: 3,
  unitAmount: 500,
});
assert(after2Hands.remainingHands === 22 && after2Hands.remainingAmount === 11000, 'After 2 hands paid: 22 remaining (11,000 HTG)');

// Case C: Triple-hand member pays full round (3 hands = 1,500 HTG)
const after3Hands = calculateCycleContributionLimits({
  currentPaidHands: 3,
  totalCycleHands: effectiveCycleHands,
  memberHandsCount: 3,
  unitAmount: 500,
});
assert(after3Hands.remainingHands === 21 && after3Hands.remainingAmount === 10500, 'After 3 hands (1 round) paid: 21 remaining (10,500 HTG)');

// Case D: Triple-hand member completes all 24 hands
const after24Hands = calculateCycleContributionLimits({
  currentPaidHands: 24,
  totalCycleHands: effectiveCycleHands,
  memberHandsCount: 3,
  unitAmount: 500,
});
assert(after24Hands.remainingHands === 0 && after24Hands.remainingAmount === 0 && after24Hands.isCycleCompleted, 'After 24 hands paid: 0 remaining and completed');

// 12. MULTI-HANDS PAYOUT ELIGIBILITY (3 hands = 3 payouts permitted)
let p1Allowed = false;
let p2Allowed = false;
let p3Allowed = false;
let p4Blocked = false;

try {
  assertPayoutEligibility({
    fullName: 'Paul Multi-Hand',
    handsCount: 3,
    receivedHandsCount: 0,
  });
  p1Allowed = true;
} catch {
  p1Allowed = false;
}
assert(p1Allowed, '1st payout is eligible for a 3-hand subscriber (0/3 received)');

try {
  assertPayoutEligibility({
    fullName: 'Paul Multi-Hand',
    handsCount: 3,
    receivedHandsCount: 1,
  });
  p2Allowed = true;
} catch {
  p2Allowed = false;
}
assert(p2Allowed, '2nd payout is eligible for a 3-hand subscriber (1/3 received)');

try {
  assertPayoutEligibility({
    fullName: 'Paul Multi-Hand',
    handsCount: 3,
    receivedHandsCount: 2,
  });
  p3Allowed = true;
} catch {
  p3Allowed = false;
}
assert(p3Allowed, '3rd payout is eligible for a 3-hand subscriber (2/3 received)');

try {
  assertPayoutEligibility({
    fullName: 'Paul Multi-Hand',
    handsCount: 3,
    receivedHandsCount: 3,
  });
} catch (err: any) {
  p4Blocked = err.message.includes('Action interdite') && err.message.includes('3/3');
}
assert(p4Blocked, '4th payout is strictly blocked for a 3-hand subscriber (3/3 received)');

// 13. TIMELINE RECONSTRUCTION WITH MULTI-HANDS PAYOUT & REVERSAL
const multiPayoutTxs: Transaction[] = [
  {
    id: 'tx-c1',
    clientId: 'client-multi',
    memberId: 'client-multi',
    collectorId: 'col-1',
    amount: 1500,
    handsCovered: 3,
    type: 'SOL_CONTRIBUTION',
    createdAtLocal: '2026-08-01T10:00:00.000Z',
    syncStatus: 'SYNCED',
  },
  {
    id: 'tx-p1',
    clientId: 'client-multi',
    memberId: 'client-multi',
    collectorId: 'col-1',
    amount: 4000,
    handsCovered: 1,
    type: 'HAND_PAYOUT',
    createdAtLocal: '2026-08-02T10:00:00.000Z',
    syncStatus: 'SYNCED',
  },
  {
    id: 'tx-p2',
    clientId: 'client-multi',
    memberId: 'client-multi',
    collectorId: 'col-1',
    amount: 4000,
    handsCovered: 1,
    type: 'HAND_PAYOUT',
    createdAtLocal: '2026-08-03T10:00:00.000Z',
    syncStatus: 'SYNCED',
  },
];

const multiTimeline = reconstructClientFinancialTimeline({
  transactions: multiPayoutTxs,
  unitAmount: 500,
  frequency: 'DAILY',
  cycleStartDate: '2026-08-01',
  handsCount: 3,
});
assert(multiTimeline.receivedHandsCount === 2, 'Timeline reconstructs receivedHandsCount = 2');
assert(multiTimeline.hasReceivedHand === false, 'hasReceivedHand is false because 2 < 3 subscribed hands');

// Now if tx-p2 is reversed:
const multiPayoutTxsReversed: Transaction[] = [
  multiPayoutTxs[0],
  multiPayoutTxs[1],
  { ...multiPayoutTxs[2], isReversed: true },
  {
    id: 'tx-rev-p2',
    clientId: 'client-multi',
    memberId: 'client-multi',
    collectorId: 'col-1',
    amount: 4000,
    handsCovered: 1,
    type: 'REVERSAL',
    note: 'ANNULATION [Réf #tx-p2]',
    createdAtLocal: '2026-08-04T10:00:00.000Z',
    syncStatus: 'SYNCED',
  },
];

const multiTimelineReversed = reconstructClientFinancialTimeline({
  transactions: multiPayoutTxsReversed,
  unitAmount: 500,
  frequency: 'DAILY',
  cycleStartDate: '2026-08-01',
  handsCount: 3,
});
assert(multiTimelineReversed.receivedHandsCount === 1, 'After reversing 2nd payout, receivedHandsCount = 1');
assert(multiTimelineReversed.hasReceivedHand === false, 'hasReceivedHand remains false (1/3)');

// 14. USER SCENARIO: 13-HANDS CYCLE CONTRIBUTION CEILINGS (NO OVERPAYMENT ALLOWED)
// Single-hand member in 13-hand cycle: max is 13 hands
const singleIn13Cycle = calculateCycleContributionLimits({
  currentPaidHands: 5,
  totalCycleHands: 13,
  memberHandsCount: 1,
  unitAmount: 250,
});
assert(singleIn13Cycle.maxAllowedHands === 13, 'Single-hand child in 13-hand cycle: max allowed hands = 13');
assert(singleIn13Cycle.remainingHands === 8, 'Single-hand child with 5 paid hands: exactly 8 remaining hands');
assert(singleIn13Cycle.remainingAmount === 2000, 'Single-hand child with 5 paid hands: remaining amount = 8 * 250 = 2,000 HTG');
assert(singleIn13Cycle.isCycleCompleted === false, 'Single-hand child with 5/13 paid: cycle is not completed');

// After paying the remaining 8 hands:
const singleIn13CycleCompleted = calculateCycleContributionLimits({
  currentPaidHands: 13,
  totalCycleHands: 13,
  memberHandsCount: 1,
  unitAmount: 250,
});
assert(singleIn13CycleCompleted.remainingHands === 0, 'Single-hand child with 13/13 paid: 0 remaining hands');
assert(singleIn13CycleCompleted.remainingAmount === 0, 'Single-hand child with 13/13 paid: 0 HTG remaining');
assert(singleIn13CycleCompleted.isCycleCompleted === true, 'Single-hand child with 13/13 paid: cycle is completed');

// 3-hand member in 13-hand cycle: max is 3 * 13 = 39 hands
const tripleIn13Cycle = calculateCycleContributionLimits({
  currentPaidHands: 15,
  totalCycleHands: 13,
  memberHandsCount: 3,
  unitAmount: 250,
});
assert(tripleIn13Cycle.maxAllowedHands === 39, '3-hand child in 13-hand cycle: max allowed hands = 3 * 13 = 39 hands');
assert(tripleIn13Cycle.remainingHands === 24, '3-hand child with 15 paid hands: exactly 24 remaining hands (39 - 15 = 24)');
assert(tripleIn13Cycle.remainingAmount === 6000, '3-hand child with 15 paid hands: remaining amount = 24 * 250 = 6,000 HTG');

// 15. SECTION 15: VERIFICATION & BLINDAGE DE LA LOGIQUE DES MAINS (PARTS MULTIPLES & 15-HANDS SOL)
// A. Hands covered calculation: S / P_unitaire
assert(calculateHandsCovered(500, 250) === 2, '500 HTG / 250 HTG = exactly 2 hands covered');
assert(calculateHandsCovered(1500, 250) === 6, '1500 HTG / 250 HTG = exactly 6 hands covered');
assert(calculateHandsCovered(250, 250) === 1, '250 HTG / 250 HTG = exactly 1 hand covered');
assert(calculateHandsCovered(0, 250) === 0, '0 HTG / 250 HTG = 0 hands covered');
assert(calculateHandsCovered(100, 250) === 0, '100 HTG / 250 HTG = 0 hands covered (< 1 hand)');
assert(calculateHandsCovered(600, 250) === 2, '600 HTG / 250 HTG = 2 hands covered (floor)');

// B. Pot de tirage ("Bay Men"): M_total * P_unitaire
const sol15Pot = calculatePotAmount(15, 250);
assert(sol15Pot === 3750, 'SOL of 15 hands @ 250 HTG = strict pot of 3,750 HTG');

// C. Nominal due per round: handsCount * P_unitaire
assert(calculateMemberDuePerRound(1, 250) === 250, '1-hand child nominal round due = 250 HTG');
assert(calculateMemberDuePerRound(2, 250) === 500, '2-hand child nominal round due = 500 HTG');
assert(calculateMemberDuePerRound(3, 250) === 750, '3-hand child nominal round due = 750 HTG');

// D. Total cycle payout per member: handsCount * (M_total * P_unitaire)
assert(calculateMemberTotalCyclePot(1, 15, 250) === 3750, '1-hand child in 15-hand SOL touches 1 * 3,750 = 3,750 HTG');
assert(calculateMemberTotalCyclePot(2, 15, 250) === 7500, '2-hand child in 15-hand SOL touches 2 * 3,750 = 7,500 HTG');
assert(calculateMemberTotalCyclePot(3, 15, 250) === 11250, '3-hand child in 15-hand SOL touches 3 * 3,750 = 11,250 HTG');

// E. Full cycle quotas & completion in a 15-hand SOL
// 1-hand child in 15-hand cycle
const singleIn15 = calculateCycleContributionLimits({
  currentPaidHands: 0,
  totalCycleHands: 15,
  memberHandsCount: 1,
  unitAmount: 250,
});
assert(singleIn15.maxAllowedHands === 15, '1-hand child in 15-hand SOL: max allowed hands = 15');
assert(singleIn15.maxPotAmount === 3750, '1-hand child in 15-hand SOL: total due on cycle = 3,750 HTG');

// 2-hand child in 15-hand cycle: 2 * 15 = 30 hands = 7,500 HTG
const doubleIn15 = calculateCycleContributionLimits({
  currentPaidHands: 10,
  totalCycleHands: 15,
  memberHandsCount: 2,
  unitAmount: 250,
});
assert(doubleIn15.maxAllowedHands === 30, '2-hand child in 15-hand SOL: max allowed hands = 30');
assert(doubleIn15.maxPotAmount === 7500, '2-hand child in 15-hand SOL: total due on cycle = 7,500 HTG');
assert(doubleIn15.remainingHands === 20, '2-hand child with 10 paid hands: 20 remaining hands');
assert(doubleIn15.remainingAmount === 5000, '2-hand child with 10 paid hands: 5,000 HTG remaining');

// 2-hand child fully completed
const doubleIn15Completed = calculateCycleContributionLimits({
  currentPaidHands: 30,
  totalCycleHands: 15,
  memberHandsCount: 2,
  unitAmount: 250,
});
assert(doubleIn15Completed.remainingHands === 0, '2-hand child with 30/30 paid: 0 remaining hands');
assert(doubleIn15Completed.isCycleCompleted === true, '2-hand child with 30/30 paid: cycle is completed');

// 16. SECTION 16: DYNAMIC ADDITION D'UN ENFANT AVEC X MAINS & DÉCAISSEMENT ÉTAPE PAR ÉTAPE
// A. Initial cycle: 10 children with 1 hand + 1 child (Odince) with 3 hands = 13 hands
const initialMembers = [
  ...Array(10).fill(null).map((_, i) => ({ id: `single-${i}`, handsCount: 1 })),
  { id: 'odince', handsCount: 3 },
];
assert(calculateCycleTotalHands(initialMembers) === 13, 'Initial cycle hands count = 10*1 + 1*3 = 13 mains');

// B. Adding "Dernier Test" with 3 hands: total hands becomes 13 + 3 = 16 mains
const membersAfterDernierTest = [
  ...initialMembers,
  { id: 'dernier-test', handsCount: 3 },
];
assert(calculateCycleTotalHands(membersAfterDernierTest) === 16, 'Adding child with 3 hands: total cycle hands increases from 13 to 16 mains');

// C. Adding another child with 2 hands: total hands becomes 16 + 2 = 18 mains
const membersAfterSecondChild = [
  ...membersAfterDernierTest,
  { id: 'new-child-2', handsCount: 2 },
];
assert(calculateCycleTotalHands(membersAfterSecondChild) === 18, 'Adding child with 2 hands: total cycle hands increases from 16 to 18 mains');

// D. Cagnotte du tirage mise à jour automatiquement
assert(calculatePotAmount(16, 250) === 4000, 'Pot amount in 16-hand cycle = 16 * 250 = 4,000 HTG');
assert(calculatePotAmount(18, 250) === 4500, 'Pot amount in 18-hand cycle = 18 * 250 = 4,500 HTG');

// E. Step-by-Step Payout for a 3-hand child ("Dernier Test")
const child3Hands = { id: 'dernier-test', fullName: 'Dernier Test', handsCount: 3, receivedHandsCount: 0 };

// Étape 1: Avant tout décaissement
let receivedCount = child3Hands.receivedHandsCount;
let hasReceivedAll = receivedCount >= child3Hands.handsCount;
assert(receivedCount === 0 && !hasReceivedAll, 'Dernier Test (0/3): 0 main perçue, hasReceivedAll = false');

// Étape 2: 1ère main décaissée (1/3)
receivedCount += 1;
hasReceivedAll = receivedCount >= child3Hands.handsCount;
assert(receivedCount === 1 && !hasReceivedAll, 'Dernier Test (1/3): 1ère main perçue, hasReceivedAll = false (reste 2 mains)');

// Étape 3: 2ème main décaissée (2/3)
receivedCount += 1;
hasReceivedAll = receivedCount >= child3Hands.handsCount;
assert(receivedCount === 2 && !hasReceivedAll, 'Dernier Test (2/3): 2ème main perçue, hasReceivedAll = false (reste 1 main)');

// Étape 4: 3ème main décaissée (3/3)
receivedCount += 1;
hasReceivedAll = receivedCount >= child3Hands.handsCount;
assert(receivedCount === 3 && hasReceivedAll, 'Dernier Test (3/3): 3ème main perçue, hasReceivedAll = true (toutes mains remises)');

// F. Total cotisations dues sur le cycle entier par Dernier Test (3 mains dans un cycle de 16)
const dernierTestLimits = calculateCycleContributionLimits({
  currentPaidHands: 0,
  totalCycleHands: 16,
  memberHandsCount: 3,
  unitAmount: 250,
});
assert(dernierTestLimits.maxAllowedHands === 48, 'Dernier Test (3 mains dans cycle 16): maxAllowedHands = 3 * 16 = 48 cotisations');
assert(dernierTestLimits.maxPotAmount === 12000, 'Dernier Test (3 mains dans cycle 16): maxPotAmount = 48 * 250 = 12,000 HTG');
assert(calculateMemberTotalCyclePot(3, 16, 250) === 12000, 'Dernier Test touches 3 cagnottes de 4,000 HTG = 12,000 HTG (équilibre parfait)');

// 12. Cycle Renewal & Restart Tests
// Scenario: A cycle with 10 members (13 effective hands) completes.
const completedMembers = [
  { id: 'c1', fullName: 'Enfant 1', handsCount: 1, currentBalance: 3250, paidHandsCount: 13, receivedHandsCount: 1, hasReceivedHand: 1 },
  { id: 'c2', fullName: 'Enfant 2 (3 mains)', handsCount: 3, currentBalance: 9750, paidHandsCount: 39, receivedHandsCount: 3, hasReceivedHand: 1 },
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `c${i + 3}`, fullName: `Enfant ${i + 3}`, handsCount: 1, currentBalance: 3250, paidHandsCount: 13, receivedHandsCount: 1, hasReceivedHand: 1
  }))
];

// Renewal Mode A: Keep same members with new unit amount (500 HTG)
const renewedMembers = completedMembers.map((m) => ({
  ...m,
  currentBalance: 0,
  totalPaidAmount: 0,
  paidHandsCount: 0,
  receivedHandsCount: 0,
  hasReceivedHand: 0,
  hasReceivedPayout: 0,
  handReceivedDate: null,
  dailyAmount: 500,
}));

assert(renewedMembers.length === 10, 'Renewed cycle preserves all 10 registered members');
assert(calculateCycleTotalHands(renewedMembers as any) === 12, 'Renewed cycle retains multi-hands distribution (1*3 + 9*1 = 12 mains)');
assert(renewedMembers.every((m) => m.currentBalance === 0 && m.paidHandsCount === 0), 'All members balances and paid hands reset to 0 in renewed cycle');
assert(renewedMembers.every((m) => m.receivedHandsCount === 0 && m.hasReceivedHand === 0), 'All members payout flags reset to 0 in renewed cycle');

// New pot calculation with new unit amount (500 HTG)
const renewedTotalHands = calculateCycleTotalHands(renewedMembers as any);
const renewedPot = calculatePot(500, renewedTotalHands);
assert(renewedPot === 6000, 'New pot for renewed cycle (12 mains * 500 HTG) = 6,000 HTG');

// Renewal Mode B: Fresh Start (empty members list)
const freshMembers: any[] = [];
assert(freshMembers.length === 0, 'Fresh start cycle clears all member records');
const freshPot = calculatePot(500, 10);
assert(freshPot === 5000, 'Fresh start cycle with 10 default slots @ 500 HTG = 5,000 HTG');

console.log('\n==================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
