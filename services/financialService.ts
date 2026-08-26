import { Frequency, MemberPaymentStatus, PaymentFrequency } from '@/types';

/**
 * Calculates the total payout pot of a Sol/Sabotay cycle.
 * Pot = Unit Amount * Total Slots
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
 * Calculates the coverage start date and new coverage end date (paidUntilDate).
 * Handles DAILY, 8_DAYS, 15_DAYS, MONTHLY, WED_SAT, and existing advance continuity.
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
  let startDate = todayStr;
  let baseDate = new Date(todayStr);

  if (currentPaidUntilDate && currentPaidUntilDate >= todayStr) {
    // Member already has active advance coverage: extend from the day following current paidUntilDate
    const existingUntil = new Date(currentPaidUntilDate);
    existingUntil.setDate(existingUntil.getDate() + 1);
    startDate = existingUntil.toISOString().split('T')[0];
    baseDate = new Date(startDate);
  }

  const resultDate = new Date(baseDate);

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
      const targetMonth = resultDate.getMonth() + (hands - 1);
      const originalDay = resultDate.getDate();
      resultDate.setMonth(targetMonth);
      if (resultDate.getDate() !== originalDay) {
        resultDate.setDate(0); // Set to last day of previous month
      }
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
            resultDate.setTime(cursor.getTime());
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
            resultDate.setTime(cursor.getTime());
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
            resultDate.setTime(cursor.getTime());
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

  const paidUntilDate = resultDate.toISOString().split('T')[0];
  return { startDate, paidUntilDate };
}

/**
 * Evaluates the real-time financial payment status of a member child.
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
} {
  const { todayStr, paidUntilDate, hasPaidToday, currentBalance, unitAmount } = params;
  const unit = Math.max(1, Number(unitAmount) || 250);

  if (paidUntilDate && paidUntilDate > todayStr) {
    const todayMs = new Date(todayStr).getTime();
    const untilMs = new Date(paidUntilDate).getTime();
    const advanceDays = Math.max(1, Math.round((untilMs - todayMs) / (24 * 60 * 60 * 1000)));
    return {
      status: 'PAID_IN_ADVANCE',
      overdueRoundsCount: 0,
      handsCoveredAhead: advanceDays,
    };
  }

  if (hasPaidToday || paidUntilDate === todayStr) {
    return {
      status: 'PAID_TODAY',
      overdueRoundsCount: 0,
      handsCoveredAhead: 0,
    };
  }

  if (paidUntilDate && paidUntilDate < todayStr) {
    const todayMs = new Date(todayStr).getTime();
    const untilMs = new Date(paidUntilDate).getTime();
    const overdueDays = Math.max(1, Math.round((todayMs - untilMs) / (24 * 60 * 60 * 1000)));
    return {
      status: 'OVERDUE',
      overdueRoundsCount: overdueDays,
      handsCoveredAhead: 0,
    };
  }

  if (currentBalance < unit) {
    const missingHands = Math.max(1, Math.ceil((unit - currentBalance) / unit));
    return {
      status: 'OVERDUE',
      overdueRoundsCount: missingHands,
      handsCoveredAhead: 0,
    };
  }

  return {
    status: 'UNPAID_TODAY',
    overdueRoundsCount: 0,
    handsCoveredAhead: 0,
  };
}
