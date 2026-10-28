import { Frequency, MemberPaymentStatus, PaymentFrequency } from '../types';

/**
 * The sol calendar: one source for every date of a cycle.
 *
 * - A cycle has one round per hand in the sol (Bendy 1 hand + Servilus 3 hands = 4 rounds).
 * - Round dates follow the frequency from the cycle start date (local calendar days).
 * - Every member owes ALL their hands at EVERY round, from the cycle start: a member with
 *   3 hands owes 3 hands on round 1, 3 on round 2… A member enrolled on day 3 owes days 1–3 too.
 * - Hands paid fill the rounds oldest first. A round with only some of its hands is partial:
 *   « À encaisser » on its day, « En retard » from the next day.
 */

type Freq = PaymentFrequency | Frequency | string;

export type RoundState = 'PAID' | 'PARTIAL' | 'DUE_TODAY' | 'LATE' | 'UPCOMING';

export interface MemberRound {
  /** 1-based round number. */
  index: number;
  /** Round day, YYYY-MM-DD (local). */
  date: string;
  dueHands: number;
  paidHands: number;
  state: RoundState;
}

export interface MemberSchedule {
  rounds: MemberRound[];
  /** Day of the last round fully paid (null = nothing fully paid yet). */
  paidUntilDate: string | null;
  /** Day of the first round not fully paid (null = everything paid). */
  nextDueDate: string | null;
  /** Hands owed on past rounds and not paid. */
  lateHands: number;
  /** Past rounds not fully paid. */
  lateRounds: number;
  /** Hands of today's round still to collect (0 when none is due today). */
  missingHandsToday: number;
  /** Today's round has some of its hands paid, not all. */
  isPartialToday: boolean;
  /** Hands paid beyond what is due up to today. */
  handsAhead: number;
  /** Future rounds fully paid in advance. */
  roundsAhead: number;
  /** Hands due up to and including today. */
  dueHandsToDate: number;
  paidHands: number;
  totalDueHands: number;
}

function parseYMD(dateStr: string): Date {
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Weekdays a frequency collects on (0 = Sunday), or null for fixed intervals. */
function collectionWeekdays(frequency: Freq): number[] | null {
  switch (frequency) {
    case 'WED_SAT':
      return [3, 6];
    case 'WEEKLY_WED':
      return [3];
    case 'WEEKLY_SAT':
      return [6];
    default:
      return null;
  }
}

function intervalDays(frequency: Freq): number {
  switch (frequency) {
    case '8J':
    case '8_DAYS':
      return 8;
    case '15J':
    case '15_DAYS':
      return 15;
    default:
      return 1;
  }
}

/** Same day of month, `months` later; Jan 31 + 1 month = Feb 28/29. */
function addMonths(start: Date, months: number): Date {
  const target = start.getMonth() + months;
  const year = start.getFullYear() + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0, 12).getDate();
  return new Date(year, month, Math.min(start.getDate(), lastDay), 12);
}

/**
 * Round days of a cycle, in order: round 1 is the first collection day on or after the start.
 * `count` rounds are produced (the cycle's total hands).
 */
export function buildCycleRounds(startDate: string, frequency: Freq, count: number): string[] {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!startDate || n === 0) return [];
  const start = parseYMD(startDate);
  const days: string[] = [];

  const weekdays = collectionWeekdays(frequency);
  if (weekdays) {
    const cursor = new Date(start);
    while (days.length < n) {
      if (weekdays.includes(cursor.getDay())) days.push(formatYMD(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  if (frequency === 'MONTHLY') {
    for (let k = 0; k < n; k++) days.push(formatYMD(addMonths(start, k)));
    return days;
  }

  const step = intervalDays(frequency);
  for (let k = 0; k < n; k++) {
    const d = new Date(start);
    d.setDate(d.getDate() + k * step);
    days.push(formatYMD(d));
  }
  return days;
}

/** Start and end of a cycle: end = day of the last round (one round per hand). */
export function getCycleDates(startDate: string, frequency: Freq, totalHands: number): { startDate: string; endDate: string } {
  const rounds = buildCycleRounds(startDate, frequency, Math.max(1, Number(totalHands) || 1));
  return { startDate: rounds.length ? startDate.split('T')[0] : startDate, endDate: rounds[rounds.length - 1] || startDate };
}

/**
 * Day of the last round fully paid by `paidHands` hands for a member owing `memberHands`
 * hands per round (null when not even the first round is fully paid).
 */
export function paidUntilFromHands(params: {
  cycleStartDate: string;
  frequency: Freq;
  memberHands: number;
  paidHands: number;
  totalRounds?: number;
}): string | null {
  const h = Math.max(1, Number(params.memberHands) || 1);
  let full = Math.floor(Math.max(0, Number(params.paidHands) || 0) / h);
  if (params.totalRounds) full = Math.min(full, Math.max(0, params.totalRounds));
  if (full <= 0 || !params.cycleStartDate) return null;
  const rounds = buildCycleRounds(params.cycleStartDate, params.frequency, full);
  return rounds[rounds.length - 1] || null;
}

/** Spreads the hands paid over the rounds, oldest first, and dates each round against today. */
export function buildMemberSchedule(params: {
  rounds: string[];
  memberHands: number;
  paidHands: number;
  todayStr: string;
}): MemberSchedule {
  const h = Math.max(1, Number(params.memberHands) || 1);
  const paid = Math.max(0, Number(params.paidHands) || 0);
  const today = params.todayStr.split('T')[0];

  let left = paid;
  let paidUntilDate: string | null = null;
  let nextDueDate: string | null = null;
  let lateHands = 0;
  let lateRounds = 0;
  let missingHandsToday = 0;
  let isPartialToday = false;
  let roundsAhead = 0;
  let dueHandsToDate = 0;

  const rounds: MemberRound[] = params.rounds.map((date, i) => {
    const paidHere = Math.min(h, left);
    left -= paidHere;
    const full = paidHere >= h;

    let state: RoundState;
    if (full) state = 'PAID';
    else if (date < today) state = 'LATE';
    else if (date === today) state = paidHere > 0 ? 'PARTIAL' : 'DUE_TODAY';
    else state = paidHere > 0 ? 'PARTIAL' : 'UPCOMING';

    if (date <= today) dueHandsToDate += h;
    if (full) {
      paidUntilDate = date;
      if (date > today) roundsAhead++;
    } else if (!nextDueDate) {
      nextDueDate = date;
    }
    if (state === 'LATE') {
      lateRounds++;
      lateHands += h - paidHere;
    }
    if (date === today && !full) {
      missingHandsToday = h - paidHere;
      isPartialToday = paidHere > 0;
    }

    return { index: i + 1, date, dueHands: h, paidHands: paidHere, state };
  });

  return {
    rounds,
    paidUntilDate,
    nextDueDate,
    lateHands,
    lateRounds,
    missingHandsToday,
    isPartialToday,
    handsAhead: Math.max(0, paid - dueHandsToDate),
    roundsAhead,
    dueHandsToDate,
    paidHands: paid,
    totalDueHands: h * params.rounds.length,
  };
}

export interface ScheduleStatus {
  status: MemberPaymentStatus;
  /** Late rounds, plus today's when it is not fully paid (« En retard · 2 tours »). */
  overdueRoundsCount: number;
  /** Rounds fully paid ahead (at least 1 when in advance). */
  handsCoveredAhead: number;
  /** Hands paid ahead. */
  installmentsAhead: number;
  /** Hands still owed up to today. */
  installmentsOverdue: number;
  nextDueDate: string;
  missingHandsToday: number;
  lateHands: number;
  isPartialToday: boolean;
}

/**
 * Status of the day from the schedule:
 * late hands on a past round → « En retard »; today's hands missing (all or some) → « À encaisser »;
 * paid beyond today → « En avance »; otherwise up to date.
 */
export function statusFromSchedule(s: MemberSchedule, todayStr: string): ScheduleStatus {
  const base = {
    missingHandsToday: s.missingHandsToday,
    lateHands: s.lateHands,
    isPartialToday: s.isPartialToday,
    nextDueDate: s.nextDueDate || todayStr,
  };
  if (s.lateHands > 0) {
    return {
      ...base,
      status: 'OVERDUE',
      overdueRoundsCount: s.lateRounds + (s.missingHandsToday > 0 ? 1 : 0),
      handsCoveredAhead: 0,
      installmentsAhead: 0,
      installmentsOverdue: s.lateHands + s.missingHandsToday,
    };
  }
  if (s.missingHandsToday > 0) {
    return {
      ...base,
      status: 'UNPAID_TODAY',
      overdueRoundsCount: 0,
      handsCoveredAhead: 0,
      installmentsAhead: 0,
      installmentsOverdue: s.missingHandsToday,
    };
  }
  if (s.handsAhead > 0) {
    return {
      ...base,
      status: 'PAID_IN_ADVANCE',
      overdueRoundsCount: 0,
      handsCoveredAhead: Math.max(1, s.roundsAhead),
      installmentsAhead: s.handsAhead,
      installmentsOverdue: 0,
    };
  }
  return {
    ...base,
    status: 'PAID_TODAY',
    overdueRoundsCount: 0,
    handsCoveredAhead: 0,
    installmentsAhead: 0,
    installmentsOverdue: 0,
  };
}

/** Everything a screen needs for one member: rounds, status of the day, paid-until. */
export function computeMemberSchedule(params: {
  cycleStartDate: string;
  frequency: Freq;
  totalCycleHands: number;
  memberHands: number;
  paidHands: number;
  todayStr: string;
}): MemberSchedule & { status: ScheduleStatus } {
  const rounds = buildCycleRounds(params.cycleStartDate, params.frequency, params.totalCycleHands);
  const schedule = buildMemberSchedule({ rounds, memberHands: params.memberHands, paidHands: params.paidHands, todayStr: params.todayStr });
  return { ...schedule, status: statusFromSchedule(schedule, params.todayStr) };
}
