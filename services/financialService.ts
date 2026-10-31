import { Frequency, PaymentFrequency, Transaction } from '../types';
import { localDayOf } from '@/lib/dates';
import { paidUntilFromHands } from './scheduleService';
import { handPotAmount } from './memberRules';

/**
 * Money rules of the sol, one function each (hands of a member: services/memberRules.ts;
 * dates, rounds and statuses: services/scheduleService.ts).
 */

/**
 * Calculates nominal contribution due per round for a member.
 * Formula: Cotisation par tour = handsCount * Unit Amount
 */
export function calculateMemberDuePerRound(memberHandsCount: number, unitAmount: number): number {
  const hands = Math.max(1, Number(memberHandsCount) || 1);
  const unit = Math.max(0, Number(unitAmount) || 0);
  return hands * unit;
}

/**
 * Calculates total cumulative payout an adherent will receive over the whole cycle.
 * Formula: Total Payout = handsCount * (Total Cycle Hands * Unit Amount)
 */
export function calculateMemberTotalCyclePot(
  memberHandsCount: number,
  totalCycleHands: number,
  unitAmount: number
): number {
  const hands = Math.max(1, Number(memberHandsCount) || 1);
  return hands * handPotAmount(unitAmount, totalCycleHands);
}

/**
 * Calculates the exact number of hands covered by a paid amount.
 * Formula: Nombre de mains = floor(amount / unitAmount)
 */
export function calculateHandsCovered(amount: number, unitAmount: number): number {
  if (unitAmount <= 0) return 0;
  const amt = Math.max(0, Number(amount) || 0);
  const unit = Math.max(1, Number(unitAmount) || 1);
  return Math.floor(amt / unit);
}

/**
 * Calculates the total contribution amount for a given number of hands.
 */
export function calculateContributionAmount(handsCount: number, unitAmount: number): number {
  const count = Math.max(1, Number(handsCount) || 1);
  const unit = Math.max(0, Number(unitAmount) || 0);
  return count * unit;
}

/**
 * Calculates remaining hands and contribution limits for a member in a cycle.
 * For a member with K hands in an N-hand cycle, max allowed hands is K * N.
 */
export function calculateCycleContributionLimits(params: {
  currentPaidHands: number;
  totalSlots?: number;
  totalCycleHands?: number;
  memberHandsCount?: number;
  unitAmount: number;
}): {
  maxAllowedHands: number;
  maxPotAmount: number;
  remainingHands: number;
  remainingAmount: number;
  isCycleCompleted: boolean;
  memberHandsCount: number;
  totalCycleHands: number;
} {
  const memberHandsCount = Math.max(1, Number(params.memberHandsCount) || 1);
  const totalCycleHands = Math.max(
    1,
    Number(params.totalCycleHands || params.totalSlots) || 10
  );
  const unit = Math.max(0, Number(params.unitAmount) || 0);
  const currentHands = Math.max(0, Number(params.currentPaidHands) || 0);

  const maxAllowedHands = memberHandsCount * totalCycleHands;
  const maxPotAmount = maxAllowedHands * unit;
  const remainingHands = Math.max(0, maxAllowedHands - currentHands);
  const remainingAmount = remainingHands * unit;
  const isCycleCompleted = remainingHands <= 0;

  return {
    maxAllowedHands,
    maxPotAmount,
    remainingHands,
    remainingAmount,
    isCycleCompleted,
    memberHandsCount,
    totalCycleHands,
  };
}

/**
 * Notice shown before reversing a transaction from a closed cycle.
 */
export const CLOSED_CYCLE_REVERSAL_NOTICE =
  "Opération d'un cycle clôturé : l'annulation est archivée et ne modifie pas le cycle en cours. Code PIN et motif obligatoires.";

/**
 * Returns true when a transaction was recorded before the current cycle boundary
 * (i.e. it belongs to a closed / archived cycle: its reversal is archival only).
 */
export function isTransactionFromClosedCycle(
  createdAtLocal: string | null | undefined,
  cycleBoundaryIso: string | null | undefined
): boolean {
  if (!createdAtLocal || !cycleBoundaryIso) return false;
  const txTime = new Date(createdAtLocal).getTime();
  const boundaryTime = new Date(cycleBoundaryIso).getTime();
  if (Number.isNaN(txTime) || Number.isNaN(boundaryTime)) return false;
  return txTime < boundaryTime;
}

/**
 * Reconstructs a member child's exact financial timeline from raw transaction history.
 * Used during transaction reversals, audits, and consistency checks to guarantee zero state drift.
 */
export function reconstructClientFinancialTimeline(params: {
  transactions: Transaction[];
  unitAmount: number;
  frequency: PaymentFrequency | Frequency;
  cycleStartDate: string;
  handsCount?: number;
  /** Rounds in the cycle (total hands): paid-until never goes past the last round. */
  totalCycleHands?: number;
}): {
  currentBalance: number;
  totalPaidAmount: number;
  paidHandsCount: number;
  receivedHandsCount: number;
  hasReceivedHand: boolean;
  handReceivedDate: string | null;
  /** Day of the last round fully paid; null = not even the first round is fully paid. */
  paidUntilDate: string | null;
} {
  const { transactions, unitAmount, frequency, cycleStartDate, handsCount } = params;
  const unit = Math.max(1, Number(unitAmount) || 250);
  const totalSubscribedHands = Math.max(1, Number(handsCount) || 1);

  let currentBalance = 0;
  let totalPaidAmount = 0;
  let paidHandsCount = 0;
  let receivedHandsCount = 0;
  let handReceivedDate: string | null = null;

  // Sort chronological ascending
  const sortedTxs = [...transactions].sort(
    (a, b) => new Date(a.createdAtLocal).getTime() - new Date(b.createdAtLocal).getTime()
  );

  // Identify reversed transaction IDs
  const reversedTxIds = new Set<string>();
  for (const tx of sortedTxs) {
    if (tx.type === 'REVERSAL' && tx.note) {
      const match = tx.note.match(/\[Réf #([a-zA-Z0-9-]+)\]/);
      if (match && match[1]) {
        // Find matching original tx
        const orig = sortedTxs.find((t) => t.id.startsWith(match[1]));
        if (orig) reversedTxIds.add(orig.id);
      }
    }
  }

  for (const tx of sortedTxs) {
    // Skip if reversed or is a reversal itself
    if (reversedTxIds.has(tx.id) || tx.type === 'REVERSAL' || tx.isReversed) {
      continue;
    }

    const isContribution =
      tx.type === 'CONTRIBUTION' ||
      tx.type === 'SOL_CONTRIBUTION' ||
      tx.type === 'SABOTAY_DEPOSIT';

    const isPayout =
      tx.type === 'HAND_PAYOUT' ||
      tx.type === 'SOL_PAYOUT' ||
      tx.type === 'WITHDRAWAL';

    if (isContribution) {
      const hands = tx.handsCovered || calculateHandsCovered(tx.amount, unit);
      currentBalance += tx.amount;
      totalPaidAmount += tx.amount;
      paidHandsCount += hands;
    } else if (isPayout) {
      currentBalance = Math.max(0, currentBalance - tx.amount);
      receivedHandsCount += 1;
      handReceivedDate = localDayOf(tx.createdAtLocal);
    }
  }

  const hasReceivedHand = receivedHandsCount >= totalSubscribedHands;

  return {
    currentBalance,
    totalPaidAmount,
    paidHandsCount,
    receivedHandsCount,
    hasReceivedHand,
    handReceivedDate,
    // Hands fill the cycle's rounds oldest first, all the member's hands per round
    // (services/scheduleService.ts); the day of each payment does not move the coverage.
    paidUntilDate: paidUntilFromHands({
      cycleStartDate,
      frequency,
      memberHands: totalSubscribedHands,
      paidHands: paidHandsCount,
      totalRounds: params.totalCycleHands,
    }),
  };
}
