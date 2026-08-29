import { Frequency, MemberPaymentStatus, PaymentFrequency, Transaction } from '../types';

/**
 * Calculates the total payout pot of a Sol/Sabotay cycle.
 * Formula: Pot = Unit Amount * Total Slots
 */
export function calculatePot(unitAmount: number, totalSlots: number): number {
  const unit = Math.max(0, Number(unitAmount) || 0);
  const slots = Math.max(0, Number(totalSlots) || 0);
  return unit * slots;
}

/**
 * Validates if the given contribution amount is an exact positive integer multiple of the unit hand amount.
 */
export function isValidContributionMultiple(amount: number, unitAmount: number): boolean {
  const amt = Number(amount);
  const unit = Number(unitAmount);
  if (isNaN(amt) || isNaN(unit) || amt <= 0 || unit <= 0) return false;
  return amt % unit === 0;
}

/**
 * Calculates the exact number of hands covered by a paid amount.
 */
export function calculateHandsCount(amount: number, unitAmount: number): number {
  const amt = Math.max(0, Number(amount) || 0);
  const unit = Math.max(1, Number(unitAmount) || 1);
  return Math.max(1, Math.floor(amt / unit));
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
 * Calculates the total effective hands in a Sol/Sabotay cycle across all enrolled children.
 * Formula: Total Hands = Sum of each member's subscribed hands (e.g. 5 members x 1 hand + 1 member x 3 hands = 8 hands).
 */
export function calculateCycleTotalHands(
  clients: Array<{ handsCount?: number | null; hands_count?: number | null }>
): number {
  if (!clients || clients.length === 0) return 0;
  return clients.reduce(
    (sum, c) => sum + Math.max(1, Number(c?.handsCount || c?.hands_count || 1)),
    0
  );
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

function parseYMD(dateStr: string): Date {
  const clean = dateStr.split('T')[0];
  const [y, m, d] = clean.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculates the coverage start date and new coverage end date (paidUntilDate).
 * Handles DAILY, 8_DAYS, 15_DAYS, MONTHLY, WED_SAT, and existing advance continuity.
 * Ensures leap years and month boundaries (Jan 31 -> Feb 28/29) are handled without date overflow.
 */
export function calculateCoverageDate(params: {
  todayStr: string;
  handsCovered: number;
  frequency: PaymentFrequency | Frequency;
  currentPaidUntilDate?: string | null;
}): { startDate: string; paidUntilDate: string } {
  const { todayStr, handsCovered, frequency, currentPaidUntilDate } = params;
  const hands = Math.max(1, Number(handsCovered) || 1);

  // Determine base starting date for the coverage period
  let startDate = todayStr.split('T')[0];
  let baseDate = parseYMD(startDate);

  if (currentPaidUntilDate && currentPaidUntilDate >= startDate) {
    // Member already has active advance coverage: extend from the day following current paidUntilDate
    const existingUntil = parseYMD(currentPaidUntilDate);
    existingUntil.setDate(existingUntil.getDate() + 1);
    startDate = formatYMD(existingUntil);
    baseDate = parseYMD(startDate);
  }

  let resultDate = new Date(baseDate);

  switch (frequency) {
    case 'DAILY': {
      resultDate.setDate(resultDate.getDate() + hands - 1);
      break;
    }

    case '8_DAYS':
    case '8J': {
      resultDate.setDate(resultDate.getDate() + (hands - 1) * 8);
      break;
    }

    case '15_DAYS':
    case '15J': {
      resultDate.setDate(resultDate.getDate() + (hands - 1) * 15);
      break;
    }

    case 'MONTHLY': {
      // Safely advance months preserving end-of-month dates (e.g. Jan 31 -> Feb 28/29)
      const originalDay = resultDate.getDate();
      const targetMonth = resultDate.getMonth() + (hands - 1);
      const targetYear = resultDate.getFullYear() + Math.floor(targetMonth / 12);
      const normalizedMonth = ((targetMonth % 12) + 12) % 12;

      const maxDaysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0, 12, 0, 0).getDate();
      const day = Math.min(originalDay, maxDaysInTargetMonth);

      resultDate = new Date(targetYear, normalizedMonth, day, 12, 0, 0);
      break;
    }

    case 'WED_SAT': {
      let covered = 0;
      const cursor = new Date(baseDate);
      while (covered < hands) {
        const dayOfWeek = cursor.getDay(); // 0 = Sun, 3 = Wed, 6 = Sat
        if (dayOfWeek === 3 || dayOfWeek === 6) {
          covered++;
          if (covered === hands) {
            resultDate = new Date(cursor);
            break;
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      break;
    }

    case 'WEEKLY_WED': {
      let covered = 0;
      const cursor = new Date(baseDate);
      while (covered < hands) {
        if (cursor.getDay() === 3) {
          covered++;
          if (covered === hands) {
            resultDate = new Date(cursor);
            break;
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      break;
    }

    case 'WEEKLY_SAT': {
      let covered = 0;
      const cursor = new Date(baseDate);
      while (covered < hands) {
        if (cursor.getDay() === 6) {
          covered++;
          if (covered === hands) {
            resultDate = new Date(cursor);
            break;
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      break;
    }

    default: {
      resultDate.setDate(resultDate.getDate() + hands - 1);
      break;
    }
  }

  const paidUntilDate = formatYMD(resultDate);
  return { startDate, paidUntilDate };
}

export const calculateNextCoverage = calculateCoverageDate;

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
}): {
  currentBalance: number;
  totalPaidAmount: number;
  paidHandsCount: number;
  receivedHandsCount: number;
  hasReceivedHand: boolean;
  handReceivedDate: string | null;
  paidUntilDate: string;
} {
  const { transactions, unitAmount, frequency, cycleStartDate, handsCount } = params;
  const unit = Math.max(1, Number(unitAmount) || 250);
  const totalSubscribedHands = Math.max(1, Number(handsCount) || 1);

  let currentBalance = 0;
  let totalPaidAmount = 0;
  let paidHandsCount = 0;
  let receivedHandsCount = 0;
  let handReceivedDate: string | null = null;
  let currentPaidUntilDate: string | null = null;

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
      const hands = tx.handsCovered || calculateHandsCount(tx.amount, unit);
      currentBalance += tx.amount;
      totalPaidAmount += tx.amount;
      paidHandsCount += hands;

      const txDateStr = tx.createdAtLocal.split('T')[0];
      const cov = calculateCoverageDate({
        todayStr: txDateStr,
        handsCovered: hands,
        frequency,
        currentPaidUntilDate,
      });
      currentPaidUntilDate = cov.paidUntilDate;
    } else if (isPayout) {
      currentBalance = Math.max(0, currentBalance - tx.amount);
      receivedHandsCount += 1;
      handReceivedDate = tx.createdAtLocal.split('T')[0];
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
    paidUntilDate: currentPaidUntilDate || cycleStartDate,
  };
}

/**
 * Evaluates the real-time financial payment status of a member child with enriched metrics.
 */
export function calculateClientPaymentStatus(params: {
  todayStr: string;
  paidUntilDate?: string | null;
  hasPaidToday?: boolean;
  currentBalance: number;
  unitAmount: number;
}): {
  status: MemberPaymentStatus;
  overdueRoundsCount: number;
  handsCoveredAhead: number;
  installmentsAhead: number;
  installmentsOverdue: number;
  nextDueDate: string;
} {
  const { todayStr, paidUntilDate, hasPaidToday, currentBalance, unitAmount } = params;
  const unit = Math.max(1, Number(unitAmount) || 250);

  // Compute next due date
  let nextDueDate = todayStr;
  if (paidUntilDate) {
    const until = new Date(paidUntilDate);
    until.setDate(until.getDate() + 1);
    nextDueDate = until.toISOString().split('T')[0];
  }

  if (paidUntilDate && paidUntilDate > todayStr) {
    const todayMs = new Date(todayStr).getTime();
    const untilMs = new Date(paidUntilDate).getTime();
    const advanceDays = Math.max(1, Math.round((untilMs - todayMs) / (24 * 60 * 60 * 1000)));
    const advanceHands = Math.max(1, Math.floor(currentBalance / unit));

    return {
      status: 'PAID_IN_ADVANCE',
      overdueRoundsCount: 0,
      handsCoveredAhead: advanceDays,
      installmentsAhead: advanceHands,
      installmentsOverdue: 0,
      nextDueDate,
    };
  }

  if (hasPaidToday || paidUntilDate === todayStr) {
    return {
      status: 'PAID_TODAY',
      overdueRoundsCount: 0,
      handsCoveredAhead: 0,
      installmentsAhead: 0,
      installmentsOverdue: 0,
      nextDueDate,
    };
  }

  if (paidUntilDate && paidUntilDate < todayStr) {
    const todayMs = new Date(todayStr).getTime();
    const untilMs = new Date(paidUntilDate).getTime();
    const overdueDays = Math.max(1, Math.round((todayMs - untilMs) / (24 * 60 * 60 * 1000)));
    const missingHands = Math.max(1, Math.ceil((unit - (currentBalance % unit)) / unit));

    return {
      status: 'OVERDUE',
      overdueRoundsCount: overdueDays,
      handsCoveredAhead: 0,
      installmentsAhead: 0,
      installmentsOverdue: missingHands,
      nextDueDate,
    };
  }

  if (currentBalance < unit) {
    const missingHands = Math.max(1, Math.ceil((unit - currentBalance) / unit));
    return {
      status: 'OVERDUE',
      overdueRoundsCount: 1,
      handsCoveredAhead: 0,
      installmentsAhead: 0,
      installmentsOverdue: missingHands,
      nextDueDate,
    };
  }

  return {
    status: 'UNPAID_TODAY',
    overdueRoundsCount: 0,
    handsCoveredAhead: 0,
    installmentsAhead: 0,
    installmentsOverdue: 0,
    nextDueDate,
  };
}

/**
 * Asserts whether a member is eligible to receive their payout hand in the current cycle.
 * For a member with K hands, they can receive up to K payouts.
 * Throws an explicit error if the member has already received all their subscribed hands.
 */
export function assertPayoutEligibility(member: {
  hasReceivedHand?: boolean | number;
  hasReceivedPayout?: boolean | number;
  handsCount?: number;
  hands_count?: number;
  receivedHandsCount?: number;
  received_hands_count?: number;
  fullName?: string;
}): void {
  const totalHands = Math.max(1, Number(member.handsCount || member.hands_count || 1));
  const receivedHands = Math.max(
    0,
    Number(
      member.receivedHandsCount !== undefined
        ? member.receivedHandsCount
        : member.received_hands_count !== undefined
        ? member.received_hands_count
        : member.hasReceivedHand || member.hasReceivedPayout
        ? totalHands
        : 0
    )
  );

  const isCompleted =
    receivedHands >= totalHands ||
    member.hasReceivedHand === true ||
    member.hasReceivedHand === 1 ||
    member.hasReceivedPayout === true ||
    member.hasReceivedPayout === 1;

  if (isCompleted) {
    throw new Error(
      `Action interdite : L'adhérent ${member.fullName || ''} a déjà reçu l'intégralité de ses mains (${receivedHands}/${totalHands}) pour ce cycle de SOL.`
    );
  }
}

