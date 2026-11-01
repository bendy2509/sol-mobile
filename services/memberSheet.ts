import { BusinessConfig, Client, Transaction } from '../types';
import { localDayOf } from '@/lib/dates';
import { calculateCycleContributionLimits, isTransactionFromClosedCycle } from './financialService';
import {
  cycleTotalHands,
  handPotAmount,
  handUnitAmount,
  hasReceivedAllHands,
  memberHandsCount,
  memberPayoutRanks,
  memberReceivedHands,
  nextBeneficiary,
} from './memberRules';
import { MemberSchedule, PayoutCalendarRow, buildCycleRounds, buildMemberSchedule, buildPayoutCalendar } from './scheduleService';

/** Kind of a ledger entry, for its label, icon and sign. */
export type LedgerEntryKind = 'CONTRIBUTION' | 'PAYOUT' | 'REVERSAL';

export function ledgerEntryKind(tx: Pick<Transaction, 'type' | 'isReversed'>): LedgerEntryKind {
  if (tx.type === 'REVERSAL' || tx.isReversed) return 'REVERSAL';
  if (tx.type === 'SOL_CONTRIBUTION' || tx.type === 'CONTRIBUTION' || tx.type === 'SABOTAY_DEPOSIT') return 'CONTRIBUTION';
  return 'PAYOUT';
}

const isPayout = (tx: Transaction) => tx.type === 'SOL_PAYOUT' || tx.type === 'HAND_PAYOUT';

export interface MemberSheet {
  unitAmount: number;
  memberHands: number;
  isMulti: boolean;
  totalCycleHands: number;
  /** Pot of one round (what one hand receives). */
  potAmount: number;
  /** What the member receives over the cycle (one pot per hand). */
  totalToReceive: number;
  paidHands: number;
  /** Hands the member owes over the whole cycle and what is left. */
  maxHands: number;
  maxAmount: number;
  remainingHands: number;
  remainingAmount: number;
  contributionPct: number;
  receivedHands: number;
  isFullyReceived: boolean;
  payoutRanks: number[];
  /** Rank expected next in the draw, and whether paying this member now breaks the order. */
  expectedNextRank: number;
  isOutOfOrder: boolean;
  rounds: string[];
  schedule: MemberSchedule;
  /** Current-cycle operations of the member. */
  cycleOperations: Transaction[];
  payoutCalendar: PayoutCalendarRow[];
}

/**
 * Everything the member sheet shows, computed in one place from the member, the other members
 * of the cycle, the carnet and the member's operations (rules: memberRules, scheduleService,
 * financialService). The screen only displays it.
 */
export function buildMemberSheet(params: {
  client: Client;
  allClients: Client[];
  business: BusinessConfig | null;
  /** Rounds in the cycle (getCycleHandsTotal); falls back to the members listed. */
  totalCycleHands?: number;
  transactions: Transaction[];
  cycleBoundary: string | null;
  todayStr: string;
  /** Hands paid in the cycle (default: the stored counter). */
  paidHands?: number;
}): MemberSheet {
  const { client, allClients, business, transactions, cycleBoundary, todayStr } = params;
  const unitAmount = handUnitAmount(business, client);
  const memberHands = memberHandsCount(client);
  const totalCycleHands = Math.max(1, params.totalCycleHands || cycleTotalHands(allClients));
  const potAmount = handPotAmount(unitAmount, totalCycleHands);
  const paidHands = params.paidHands ?? (client.paidHandsCount || 0);
  const limits = calculateCycleContributionLimits({ currentPaidHands: paidHands, totalCycleHands, memberHandsCount: memberHands, unitAmount });
  const receivedHands = memberReceivedHands(client);
  const next = nextBeneficiary(allClients);
  const rounds = business ? buildCycleRounds(business.startDate, business.frequency, totalCycleHands) : [];
  const payoutRanks = memberPayoutRanks(client);
  const cycleOperations = transactions.filter((tx) => !isTransactionFromClosedCycle(tx.createdAtLocal, cycleBoundary));
  const receivedDates = cycleOperations
    .filter((tx) => !tx.isReversed && isPayout(tx))
    .map((tx) => localDayOf(tx.createdAtLocal))
    .sort();

  return {
    unitAmount,
    memberHands,
    isMulti: memberHands > 1,
    totalCycleHands,
    potAmount,
    totalToReceive: potAmount * memberHands,
    paidHands,
    maxHands: limits.maxAllowedHands,
    maxAmount: limits.maxPotAmount,
    remainingHands: limits.remainingHands,
    remainingAmount: limits.remainingAmount,
    contributionPct: limits.maxAllowedHands > 0 ? Math.min(100, Math.round((paidHands / limits.maxAllowedHands) * 100)) : 0,
    receivedHands,
    isFullyReceived: hasReceivedAllHands(client),
    payoutRanks,
    expectedNextRank: next?.rank ?? 1,
    // The draw goes rank by rank: paying anyone else than the next beneficiary is out of order
    isOutOfOrder: !!next && next.member.id !== client.id,
    rounds,
    schedule: buildMemberSchedule({ rounds, memberHands, paidHands, todayStr }),
    cycleOperations,
    payoutCalendar: buildPayoutCalendar(rounds, [{ fullName: client.fullName, ranks: payoutRanks, receivedDates }]),
  };
}

/** Ranks shown in the edit form: the stored list, else the single rank. */
export function editableRanks(client: Pick<Client, 'payoutRanks' | 'payoutRank'>): string {
  const ranks = memberPayoutRanks(client);
  return ranks.length ? ranks.join(', ') : '1';
}

/** Ranks to save: the typed list, else consecutive ranks from the first one (one per hand). */
export function ranksToSave(typed: string, firstRank: number, hands: number): string {
  const clean = typed.trim();
  if (clean) return clean;
  return Array.from({ length: Math.max(1, hands) }, (_, i) => firstRank + i).join(', ');
}
