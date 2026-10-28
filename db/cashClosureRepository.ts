import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { CashClosure, UnpaidMember } from '@/types';
import { localDateString } from '@/lib/dates';
import { computeMemberSchedule } from '@/services/scheduleService';
import { getActiveBusinessId, getActiveCollectorId, getDatabase } from './sqlite';
import { getActiveBusinessConfig, getCycleHandsTotal } from './businessRepository';
import { getTodayStats } from './transactionRepository';

/**
 * Members whose rounds up to `day` are not fully paid (cycle calendar: all their hands at every
 * round). The cash closure lists them so the manager decides to close anyway or keep it open.
 */
export async function getUnpaidForDate(day: string = localDateString(), collectorIdParam?: string): Promise<UnpaidMember[]> {
  const db = await getDatabase();
  const collectorId = collectorIdParam || (await getActiveCollectorId());
  const business = await getActiveBusinessConfig(collectorId);
  if (!business) return [];
  const totalCycleHands = await getCycleHandsTotal(collectorId);
  const rows = await db.getAllAsync<{ id: string; full_name: string; hands_count: number | null; paid_hands_count: number | null }>(
    `SELECT id, full_name, hands_count, paid_hands_count FROM clients
     WHERE collector_id = ? AND id NOT IN (SELECT id FROM deleted_clients)
     ORDER BY payout_rank ASC`,
    [collectorId]
  );

  const unpaid: UnpaidMember[] = [];
  for (const r of rows) {
    const s = computeMemberSchedule({
      cycleStartDate: business.startDate,
      frequency: business.frequency,
      totalCycleHands,
      memberHands: Math.max(1, Number(r.hands_count || 1)),
      paidHands: Number(r.paid_hands_count || 0),
      todayStr: day,
    });
    const missingHands = s.lateHands + s.missingHandsToday;
    if (missingHands <= 0) continue;
    unpaid.push({
      clientId: r.id,
      fullName: r.full_name,
      missingHands,
      amount: missingHands * Number(business.contributionAmount),
      state: s.lateHands > 0 ? 'LATE' : s.isPartialToday ? 'PARTIAL' : 'UNPAID',
    });
  }
  return unpaid;
}

/** The closure already recorded for a day, if any (one closure per day; a second one is confirmed). */
export async function getClosureForDate(day: string = localDateString(), collectorIdParam?: string): Promise<CashClosure | null> {
  const list = await getCashClosures(collectorIdParam);
  return list.find((c) => c.closureDate === day) || null;
}

export async function createCashClosure(data: {
  totalCashDeclared: number;
  discrepancyReason?: string;
  collectorId?: string;
  /** Members not fully paid for the day, closed anyway by the manager. */
  unpaidMembers?: UnpaidMember[];
  closureNote?: string;
}): Promise<CashClosure> {
  const db = await getDatabase();
  const collectorId = data.collectorId || (await getActiveCollectorId());
  const id = uuidv4();
  const now = new Date().toISOString();
  // The manager's calendar day (the UTC day already reads « tomorrow » from 20:00 in Haiti)
  const todayIsoDate = localDateString();
  const businessId = await getActiveBusinessId();

  const todayStats = await getTodayStats(collectorId);
  const totalSystemCalculated = todayStats.totalCollectedToday;

  await db.runAsync(
    `INSERT INTO cash_closures (id, collector_id, business_id, closure_date, total_cash_declared, total_system_calculated, discrepancy_reason, status, created_at, unpaid_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?)`,
    [
      id,
      collectorId,
      businessId,
      todayIsoDate,
      data.totalCashDeclared,
      totalSystemCalculated,
      data.discrepancyReason || null,
      now,
      data.unpaidMembers?.length || data.closureNote
        ? JSON.stringify({ members: data.unpaidMembers || [], note: data.closureNote || null })
        : null,
    ]
  );

  return {
    id,
    collectorId,
    closureDate: todayIsoDate,
    totalCashDeclared: data.totalCashDeclared,
    totalSystemCalculated,
    discrepancyReason: data.discrepancyReason,
    status: 'SUBMITTED',
    createdAt: now,
    unpaidMembers: data.unpaidMembers,
    closureNote: data.closureNote,
  };
}

function parseUnpaidSnapshot(raw: string | null | undefined): { members?: UnpaidMember[]; note?: string } {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return { members: Array.isArray(v?.members) ? v.members : undefined, note: v?.note || undefined };
  } catch {
    return {};
  }
}

export async function getCashClosures(collectorId?: string): Promise<CashClosure[]> {
  const db = await getDatabase();
  const currentCollectorId = collectorId || (await getActiveCollectorId());

  const rows = await db.getAllAsync<{
    id: string;
    collector_id: string;
    closure_date: string;
    total_cash_declared: number;
    total_system_calculated: number;
    discrepancy_reason: string | null;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
    created_at: string;
    unpaid_snapshot?: string | null;
  }>(
    `SELECT * FROM cash_closures WHERE collector_id = ? ORDER BY created_at DESC LIMIT 50`,
    [currentCollectorId]
  );

  // The web store returns every manager's closures: keep this manager's, newest first
  return rows
    .filter((r) => r.collector_id === currentCollectorId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((r) => ({
    id: r.id,
    collectorId: r.collector_id,
    closureDate: r.closure_date,
    totalCashDeclared: Number(r.total_cash_declared),
    totalSystemCalculated: Number(r.total_system_calculated),
    discrepancyReason: r.discrepancy_reason || undefined,
    status: r.status,
    createdAt: r.created_at,
    unpaidMembers: parseUnpaidSnapshot(r.unpaid_snapshot).members,
    closureNote: parseUnpaidSnapshot(r.unpaid_snapshot).note,
  }));
}
