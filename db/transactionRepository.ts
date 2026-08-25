import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import {
  DashboardStats,
  SyncStatus,
  Transaction,
  TransactionType,
} from '@/types';
import { getActiveCollectorId, getDatabase } from './sqlite';
import { getActiveBusinessConfig } from './businessRepository';

export async function createTransaction(data: {
  clientId: string;
  amount: number;
  type: TransactionType;
  collectorId?: string;
  solGroupId?: string | null;
  businessId?: string | null;
  paymentMethod?: string;
}): Promise<Transaction> {
  const db = await getDatabase();
  const collectorId = data.collectorId || (await getActiveCollectorId());
  const activeBusiness = await getActiveBusinessConfig();
  const businessId = data.businessId !== undefined ? data.businessId : activeBusiness?.id || null;
  const id = uuidv4();
  const now = new Date().toISOString();
  const paymentMethod = data.paymentMethod || 'CASH';

  // Fetch current client balance
  const client = await db.getFirstAsync<{ current_balance: number; full_name: string; phone_number: string }>(
    `SELECT current_balance, full_name, phone_number FROM clients WHERE id = ?`,
    [data.clientId]
  );

  if (!client) {
    throw new Error(`Adhérent introuvable dans le système local.`);
  }

  const currentBalance = Number(client.current_balance || 0);
  let newBalance = currentBalance;

  if (data.type === 'SABOTAY_DEPOSIT' || data.type === 'SOL_CONTRIBUTION') {
    newBalance = currentBalance + data.amount;
  } else if (data.type === 'WITHDRAWAL' || data.type === 'SOL_PAYOUT') {
    newBalance = Math.max(0, currentBalance - data.amount);
  }

  // Atomic database transaction
  await db.withTransactionAsync(async () => {
    // 1. Insert transaction
    await db.runAsync(
      `INSERT INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, type, payment_method, created_at_local, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        id,
        data.clientId,
        collectorId,
        data.solGroupId || null,
        businessId,
        data.amount,
        data.type,
        paymentMethod,
        now,
      ]
    );

    // 2. Update client balance
    await db.runAsync(
      `UPDATE clients SET current_balance = ?, sync_status = 'PENDING' WHERE id = ?`,
      [newBalance, data.clientId]
    );

    // 3. If Sol contribution, update member has_paid flag
    if (data.solGroupId && data.type === 'SOL_CONTRIBUTION') {
      await db.runAsync(
        `UPDATE sol_group_members SET has_paid = 1 WHERE sol_group_id = ? AND client_id = ?`,
        [data.solGroupId, data.clientId]
      );
    }
  });

  return {
    id,
    clientId: data.clientId,
    collectorId,
    solGroupId: data.solGroupId || null,
    businessId,
    amount: data.amount,
    type: data.type,
    paymentMethod,
    createdAtLocal: now,
    syncStatus: 'PENDING',
    clientName: client.full_name,
    clientPhone: client.phone_number,
  };
}

export async function getTransactions(options?: {
  clientId?: string;
  collectorId?: string;
  businessId?: string;
  type?: TransactionType;
  syncStatus?: SyncStatus;
  limit?: number;
}): Promise<Transaction[]> {
  const db = await getDatabase();
  const collectorId = options?.collectorId || (await getActiveCollectorId());

  let query = `
    SELECT 
      t.id,
      t.client_id,
      t.collector_id,
      t.sol_group_id,
      t.business_id,
      t.amount,
      t.type,
      t.payment_method,
      t.created_at_local,
      t.synced_at,
      t.sync_status,
      c.full_name as client_name,
      c.phone_number as client_phone
    FROM transactions t
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE t.collector_id = ?
  `;
  const params: (string | number)[] = [collectorId];

  if (options?.clientId) {
    query += ` AND t.client_id = ?`;
    params.push(options.clientId);
  }

  if (options?.businessId) {
    query += ` AND t.business_id = ?`;
    params.push(options.businessId);
  }

  if (options?.type) {
    query += ` AND t.type = ?`;
    params.push(options.type);
  }

  if (options?.syncStatus) {
    query += ` AND t.sync_status = ?`;
    params.push(options.syncStatus);
  }

  query += ` ORDER BY t.created_at_local DESC`;

  if (options?.limit) {
    query += ` LIMIT ?`;
    params.push(options.limit);
  }

  const rows = await db.getAllAsync<{
    id: string;
    client_id: string;
    collector_id: string;
    sol_group_id: string | null;
    business_id: string | null;
    amount: number;
    type: TransactionType;
    payment_method: string;
    created_at_local: string;
    synced_at: string | null;
    sync_status: SyncStatus;
    client_name: string | null;
    client_phone: string | null;
  }>(query, params);

  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    collectorId: r.collector_id,
    solGroupId: r.sol_group_id,
    businessId: r.business_id,
    amount: Number(r.amount),
    type: r.type,
    paymentMethod: r.payment_method || 'CASH',
    createdAtLocal: r.created_at_local,
    syncedAt: r.synced_at,
    syncStatus: r.sync_status,
    clientName: r.client_name || 'Adhérent inconnu',
    clientPhone: r.client_phone || '',
  }));
}

// Aliases for compatibility
export const getAllTransactions = getTransactions;

export async function getTransactionsByClient(clientId: string): Promise<Transaction[]> {
  return getTransactions({ clientId });
}

export async function getTodayStats(collectorIdParam?: string): Promise<DashboardStats> {
  const db = await getDatabase();
  const collectorId = collectorIdParam || (await getActiveCollectorId());

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayIso = startOfDay.toISOString();

  // Sabotay deposits
  const sabotayRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
     WHERE collector_id = ? AND type = 'SABOTAY_DEPOSIT' AND created_at_local >= ?`,
    [collectorId, startOfDayIso]
  );

  // Sol contributions
  const solRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
     WHERE collector_id = ? AND type = 'SOL_CONTRIBUTION' AND created_at_local >= ?`,
    [collectorId, startOfDayIso]
  );

  // Withdrawals
  const withdrawalRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
     WHERE collector_id = ? AND type = 'WITHDRAWAL' AND created_at_local >= ?`,
    [collectorId, startOfDayIso]
  );

  // Active clients count
  const clientsCountRow = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM clients WHERE collector_id = ?`,
    [collectorId]
  );

  // Pending transactions count
  const pendingRow = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM transactions WHERE collector_id = ? AND sync_status = 'PENDING'`,
    [collectorId]
  );

  const sabotayDepositsToday = Number(sabotayRow?.total || 0);
  const solContributionsToday = Number(solRow?.total || 0);
  const withdrawalsToday = Number(withdrawalRow?.total || 0);
  const totalCollectedToday = sabotayDepositsToday + solContributionsToday - withdrawalsToday;

  return {
    totalCollectedToday,
    sabotayDepositsToday,
    solContributionsToday,
    withdrawalsToday,
    activeClientsCount: Number(clientsCountRow?.count || 0),
    pendingTransactionsCount: Number(pendingRow?.count || 0),
  };
}

export async function markTransactionsSynced(transactionIds: string[]): Promise<void> {
  if (transactionIds.length === 0) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  const placeholders = transactionIds.map(() => '?').join(',');

  await db.runAsync(
    `UPDATE transactions 
     SET sync_status = 'SYNCED', synced_at = ? 
     WHERE id IN (${placeholders})`,
    [now, ...transactionIds]
  );
}

export async function markClientsSynced(clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return;
  const db = await getDatabase();
  const placeholders = clientIds.map(() => '?').join(',');

  await db.runAsync(
    `UPDATE clients 
     SET sync_status = 'SYNCED' 
     WHERE id IN (${placeholders})`,
    clientIds
  );
}
