import { Frequency, PaymentFrequency } from '../types';
import { localDateString } from './dates';
import { getCycleDates } from '@/services/scheduleService';

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
 * End date of a Sol/Sabotay cycle: the day of its last round (one round per hand), counted in
 * local calendar days from the start date (services/scheduleService.ts).
 */
export function calculateCycleEndDate(
  startDateStr: string,
  totalSlots: number,
  frequency: PaymentFrequency | Frequency | string
): string {
  const start = /^\d{4}-\d{2}-\d{2}/.test(startDateStr || '') ? startDateStr : localDateString();
  return getCycleDates(start, frequency, Math.max(1, Number(totalSlots) || 1)).endDate;
}

/**
 * Calculates days remaining from today until target end date
 */
export function calculateDaysRemaining(endDateStr: string): number {
  if (!endDateStr) return 0;
  try {
    // A 'YYYY-MM-DD' end date is a local calendar day: new Date() would read it as UTC midnight,
    // i.e. the evening before in Haiti, and count one day too few
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDateStr);
    const end = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(endDateStr);
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
