import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { CashClosure } from '@/types';
import { getActiveCollectorId, getDatabase } from './sqlite';
import { getTodayStats } from './transactionRepository';

export async function createCashClosure(data: {
  totalCashDeclared: number;
  discrepancyReason?: string;
  collectorId?: string;
}): Promise<CashClosure> {
  const db = await getDatabase();
  const collectorId = data.collectorId || (await getActiveCollectorId());
  const id = uuidv4();
  const now = new Date().toISOString();
  const todayIsoDate = now.split('T')[0];

  const todayStats = await getTodayStats(collectorId);
  const totalSystemCalculated = todayStats.totalCollectedToday;

  await db.runAsync(
    `INSERT INTO cash_closures (id, collector_id, closure_date, total_cash_declared, total_system_calculated, discrepancy_reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)`,
    [
      id,
      collectorId,
      todayIsoDate,
      data.totalCashDeclared,
      totalSystemCalculated,
      data.discrepancyReason || null,
      now,
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
  };
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
  }>(
    `SELECT * FROM cash_closures WHERE collector_id = ? ORDER BY created_at DESC LIMIT 50`,
    [currentCollectorId]
  );

  return rows.map((r) => ({
    id: r.id,
    collectorId: r.collector_id,
    closureDate: r.closure_date,
    totalCashDeclared: Number(r.total_cash_declared),
    totalSystemCalculated: Number(r.total_system_calculated),
    discrepancyReason: r.discrepancy_reason || undefined,
    status: r.status,
    createdAt: r.created_at,
  }));
}
