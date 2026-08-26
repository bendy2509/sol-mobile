import { Frequency, PaymentFrequency } from '@/types';

/**
 * Returns the exact interval duration in days for any SOL / Sabotay frequency.
 */
export function getFrequencyIntervalDays(frequency: PaymentFrequency | Frequency | string): number {
  switch (frequency) {
    case 'DAILY':
      return 1;
    case '8J':
    case '8_DAYS':
      return 8;
    case '15J':
    case '15_DAYS':
      return 15;
    case 'MONTHLY':
      return 30;
    case 'WEEKLY_WED':
    case 'WEEKLY_SAT':
      return 7;
    case 'WED_SAT':
      return 3.5; // 2 mains par semaine (7 / 2 = 3.5 jours en moyenne)
    default:
      return 1;
  }
}

/**
 * Calculates the exact total cycle duration in days based on the number of enrolled children and payment frequency.
 * Formula: Total Days = Children Count * Interval Days
 * - Ex: 12 children on DAILY (1 day) = 12 * 1 = 12 days
 * - Ex: 12 children on 8_DAYS (8 days) = 12 * 8 = 96 days
 * - Ex: 12 children on 15_DAYS (15 days) = 12 * 15 = 180 days
 * - Ex: 12 children on MONTHLY (30 days) = 12 * 30 = 360 days
 */
export function calculateCycleTotalDays(
  childrenCount: number,
  frequency: PaymentFrequency | Frequency | string
): number {
  const count = Math.max(1, Number(childrenCount) || 1);
  const interval = getFrequencyIntervalDays(frequency);
  return Math.round(count * interval);
}

/**
 * Calculates the exact end date of a Sol/Sabotay cycle based on start date,
 * number of participants ("enfants"), and payment frequency.
 */
export function calculateCycleEndDate(
  startDateStr: string,
  totalSlots: number,
  frequency: PaymentFrequency | Frequency | string
): string {
  const slots = Math.max(1, Number(totalSlots) || 1);
  const start = new Date(startDateStr || new Date().toISOString().split('T')[0]);

  // Ensure start is valid
  if (isNaN(start.getTime())) {
    return new Date().toISOString().split('T')[0];
  }

  const result = new Date(start);

  switch (frequency) {
    case 'DAILY': {
      // 1 hand per day -> slots days
      result.setDate(result.getDate() + slots - 1);
      break;
    }

    case 'WED_SAT': {
      // 2 hands per week (every Wednesday and Saturday)
      let count = 0;
      const current = new Date(start);

      while (count < slots) {
        const dayOfWeek = current.getDay(); // 0 = Sunday, 3 = Wednesday, 6 = Saturday
        if (dayOfWeek === 3 || dayOfWeek === 6) {
          count++;
          if (count === slots) {
            result.setTime(current.getTime());
            break;
          }
        }
        current.setDate(current.getDate() + 1);
      }
      break;
    }

    case 'WEEKLY_WED': {
      // Every Wednesday -> slots weeks
      let count = 0;
      const current = new Date(start);

      while (count < slots) {
        if (current.getDay() === 3) {
          count++;
          if (count === slots) {
            result.setTime(current.getTime());
            break;
          }
        }
        current.setDate(current.getDate() + 1);
      }
      break;
    }

    case 'WEEKLY_SAT': {
      // Every Saturday -> slots weeks
      let count = 0;
      const current = new Date(start);

      while (count < slots) {
        if (current.getDay() === 6) {
          count++;
          if (count === slots) {
            result.setTime(current.getTime());
            break;
          }
        }
        current.setDate(current.getDate() + 1);
      }
      break;
    }

    case '8J':
    case '8_DAYS': {
      // Every 8 days: slots * 8 days
      result.setDate(result.getDate() + (slots - 1) * 8);
      break;
    }

    case '15J':
    case '15_DAYS': {
      // Every 15 days (Quinzaine): slots * 15 days
      result.setDate(result.getDate() + (slots - 1) * 15);
      break;
    }

    case 'MONTHLY': {
      // Monthly: slots * 1 month (~30 days each)
      const targetMonth = result.getMonth() + (slots - 1);
      const originalDay = result.getDate();
      result.setMonth(targetMonth);
      if (result.getDate() !== originalDay) {
        result.setDate(0); // Safely handle month boundary
      }
      break;
    }

    default: {
      result.setDate(result.getDate() + slots - 1);
      break;
    }
  }

  return result.toISOString().split('T')[0];
}

/**
 * Calculates days remaining from today until target end date
 */
export function calculateDaysRemaining(endDateStr: string): number {
  if (!endDateStr) return 0;
  try {
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    const now = new Date();

    const diffMs = end.getTime() - now.getTime();
    if (diffMs <= 0) return 0;

    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

/**
 * Human-readable French label for frequency
 */
export function getFrequencyLabel(frequency: PaymentFrequency | Frequency | string): string {
  switch (frequency) {
    case 'DAILY':
      return 'Quotidien (1 jour / main)';
    case 'WED_SAT':
      return 'Chaque Mercredi & Samedi (2 mains / sem)';
    case 'WEEKLY_WED':
      return 'Chaque Mercredi (7 jours / main)';
    case 'WEEKLY_SAT':
      return 'Chaque Samedi (7 jours / main)';
    case '8J':
    case '8_DAYS':
      return 'Tous les 8 Jours (8 jours / main)';
    case '15J':
    case '15_DAYS':
      return 'Quinzaine (15 jours / main)';
    case 'MONTHLY':
      return 'Mensuel (30 jours / main)';
    default:
      return 'Quotidien (1 jour / main)';
  }
}
