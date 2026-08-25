import { PaymentFrequency } from '@/types';

/**
 * Calculates the exact end date of a Sol/Sabotay cycle based on start date,
 * number of participants ("enfants"), and payment frequency.
 */
export function calculateCycleEndDate(
  startDateStr: string,
  totalSlots: number,
  frequency: PaymentFrequency
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
      // 1 hand per day
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
      // Every Wednesday
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
      // Every Saturday
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

    case '8J': {
      // Every 8 days
      result.setDate(result.getDate() + (slots - 1) * 8);
      break;
    }

    case '15J': {
      // Every 15 days (Quinzaine)
      result.setDate(result.getDate() + (slots - 1) * 15);
      break;
    }

    case 'MONTHLY': {
      // Monthly
      result.setMonth(result.getMonth() + slots - 1);
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
export function getFrequencyLabel(frequency: PaymentFrequency): string {
  switch (frequency) {
    case 'DAILY':
      return 'Quotidien (Chaque jour)';
    case 'WED_SAT':
      return 'Chaque Mercredi & Samedi';
    case 'WEEKLY_WED':
      return 'Chaque Mercredi';
    case 'WEEKLY_SAT':
      return 'Chaque Samedi';
    case '8J':
      return 'Tous les 8 Jours';
    case '15J':
      return 'Quinzaine (15 Jours)';
    case 'MONTHLY':
      return 'Mensuel (Chaque mois)';
    default:
      return 'Quotidien';
  }
}
