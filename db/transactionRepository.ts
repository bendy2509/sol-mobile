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
import { calculateCoverageDate, calculateHandsCount } from '@/services/financialService';

export async function createTransaction(data: {
  clientId: string;
  amount: number;
  type: 'CONTRIBUTION' | 'HAND_PAYOUT' | TransactionType;
  collectorId?: string;
  solGroupId?: string | null;
  businessId?: string | null;
  paymentMethod?: string;
  handsCovered?: number;
  note?: string;
}): Promise<Transaction> {
  const db = await getDatabase();
  const collectorId = data.collectorId || (await getActiveCollectorId());
  const activeBusiness = await getActiveBusinessConfig();
  const businessId = data.businessId !== undefined ? data.businessId : activeBusiness?.id || null;
  const id = uuidv4();
  const now = new Date().toISOString();
  const todayStr = now.split('T')[0];
  const paymentMethod = data.paymentMethod || 'CASH';

  // Fetch current client record
  const client = await db.getFirstAsync<{
    current_balance: number;
    total_paid_amount: number;
    paid_hands_count: number;
    paid_until_date: string | null;
    full_name: string;
    phone_number: string;
  }>(
    `SELECT current_balance, total_paid_amount, paid_hands_count, paid_until_date, full_name, phone_number 
     FROM clients WHERE id = ?`,
    [data.clientId]
  );

  if (!client) {
    throw new Error(`Adhérent introuvable dans le système local.`);
  }

  const unitAmount = activeBusiness?.contributionAmount || 250;
  const isContribution =
    data.type === 'CONTRIBUTION' ||
    data.type === 'SABOTAY_DEPOSIT' ||
    data.type === 'SOL_CONTRIBUTION';

  const isPayout =
    data.type === 'HAND_PAYOUT' ||
    data.type === 'SOL_PAYOUT' ||
    data.type === 'WITHDRAWAL';

  const calculatedHandsCovered =
    data.handsCovered ||
    (isContribution ? calculateHandsCount(data.amount, unitAmount) : 1);

  const currentBalance = Number(client.current_balance || 0);
  const currentTotalPaid = Number(client.total_paid_amount || currentBalance);
  const currentPaidHands = Number(client.paid_hands_count || 0);

  let newBalance = currentBalance;
  let newTotalPaid = currentTotalPaid;
  let newPaidHands = currentPaidHands;
  let newPaidUntilDate = client.paid_until_date || todayStr;

  if (isContribution) {
    newBalance = currentBalance + data.amount;
    newTotalPaid = currentTotalPaid + data.amount;
    newPaidHands = currentPaidHands + calculatedHandsCovered;

    // Calculate exact coverage date using central financial service
    const coverage = calculateCoverageDate({
      todayStr,
      handsCovered: calculatedHandsCovered,
      frequency: activeBusiness?.frequency || 'DAILY',
      currentPaidUntilDate: client.paid_until_date,
    });
    newPaidUntilDate = coverage.paidUntilDate;
  } else if (isPayout) {
    newBalance = Math.max(0, currentBalance - data.amount);
  }

  let persistedType: TransactionType = 'SOL_CONTRIBUTION';
  if (data.type === 'SABOTAY_DEPOSIT') persistedType = 'SABOTAY_DEPOSIT';
  else if (data.type === 'SOL_CONTRIBUTION' || data.type === 'CONTRIBUTION') persistedType = 'SOL_CONTRIBUTION';
  else if (data.type === 'HAND_PAYOUT' || data.type === 'SOL_PAYOUT') persistedType = 'SOL_PAYOUT';
  else if (data.type === 'WITHDRAWAL') persistedType = 'WITHDRAWAL';

  // Atomic database transaction
  await db.withTransactionAsync(async () => {
    // 1. Insert transaction record
    await db.runAsync(
      `INSERT INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, hands_covered, type, payment_method, note, created_at_local, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        id,
        data.clientId,
        collectorId,
        data.solGroupId || null,
        businessId,
        data.amount,
        calculatedHandsCovered,
        persistedType,
        paymentMethod,
        data.note || null,
        now,
      ]
    );

    // 2. Update client financial state & coverage date
    await db.runAsync(
      `UPDATE clients 
       SET current_balance = ?, total_paid_amount = ?, paid_hands_count = ?, paid_until_date = ?, sync_status = 'PENDING' 
       WHERE id = ?`,
      [newBalance, newTotalPaid, newPaidHands, newPaidUntilDate, data.clientId]
    );

    // 3. If payout, flag hand as received but KEEP client in cycle
    if (data.type === 'HAND_PAYOUT' || data.type === 'SOL_PAYOUT') {
      await db.runAsync(
        `UPDATE clients 
         SET has_received_hand = 1, has_received_payout = 1, hand_received_date = ?, sync_status = 'PENDING' 
         WHERE id = ?`,
        [todayStr, data.clientId]
      );
    }
  });

  return {
    id,
    memberId: data.clientId,
    clientId: data.clientId,
    collectorId,
    solGroupId: data.solGroupId || null,
    businessId,
    amount: data.amount,
    handsCovered: calculatedHandsCovered,
    type: data.type,
    paymentMethod,
    note: data.note,
    createdAtLocal: now,
    syncStatus: 'PENDING',
    clientName: client.full_name,
    memberName: client.full_name,
    clientPhone: client.phone_number,
    memberPhone: client.phone_number,
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
      t.hands_covered,
      t.type,
      t.payment_method,
      t.note,
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
    hands_covered: number | null;
    type: TransactionType;
    payment_method: string;
    note: string | null;
    created_at_local: string;
    synced_at: string | null;
    sync_status: SyncStatus;
    client_name: string | null;
    client_phone: string | null;
  }>(query, params);

  return rows.map((r) => ({
    id: r.id,
    memberId: r.client_id,
    clientId: r.client_id,
    collectorId: r.collector_id,
    solGroupId: r.sol_group_id,
    businessId: r.business_id,
    amount: Number(r.amount),
    handsCovered: Number(r.hands_covered || 1),
    type: r.type,
    paymentMethod: r.payment_method || 'CASH',
    note: r.note || undefined,
    createdAtLocal: r.created_at_local,
    syncedAt: r.synced_at,
    syncStatus: r.sync_status,
    clientName: r.client_name || 'Adhérent inconnu',
    memberName: r.client_name || 'Adhérent inconnu',
    clientPhone: r.client_phone || '',
    memberPhone: r.client_phone || '',
  }));
}

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

  // Contribution deposits
  const inRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
     WHERE collector_id = ? AND type IN ('CONTRIBUTION', 'SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION') AND created_at_local >= ?`,
    [collectorId, startOfDayIso]
  );

  // Payouts & withdrawals
  const outRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
     WHERE collector_id = ? AND type IN ('HAND_PAYOUT', 'SOL_PAYOUT', 'WITHDRAWAL') AND created_at_local >= ?`,
    [collectorId, startOfDayIso]
  );

  // Clients count
  const clientsCountRow = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM clients WHERE collector_id = ?`,
    [collectorId]
  );

  // Pending transactions count
  const pendingRow = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM transactions WHERE collector_id = ? AND sync_status = 'PENDING'`,
    [collectorId]
  );

  const totalIn = Number(inRow?.total || 0);
  const totalOut = Number(outRow?.total || 0);
  const totalCollectedToday = Math.max(0, totalIn - totalOut);

  return {
    totalCollectedToday,
    sabotayDepositsToday: totalIn,
    solContributionsToday: totalIn,
    withdrawalsToday: totalOut,
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

export async function reverseTransaction(params: {
  transactionId: string;
  reason: string;
  collectorId?: string;
}): Promise<Transaction> {
  const { transactionId, reason } = params;
  const db = await getDatabase();
  const collectorId = params.collectorId || (await getActiveCollectorId());
  const now = new Date().toISOString();
  const reversalId = uuidv4();

  const original = await db.getFirstAsync<{
    id: string;
    client_id: string;
    collector_id: string;
    business_id: string | null;
    sol_group_id: string | null;
    amount: number;
    hands_covered: number;
    type: string;
  }>(`SELECT * FROM transactions WHERE id = ?`, [transactionId]);

  if (!original) {
    throw new Error('Transaction originale introuvable.');
  }

  const client = await db.getFirstAsync<{
    id: string;
    current_balance: number;
    total_paid_amount: number;
    paid_hands_count: number;
  }>(`SELECT current_balance, total_paid_amount, paid_hands_count FROM clients WHERE id = ?`, [
    original.client_id,
  ]);

  if (!client) {
    throw new Error('Adhérent introuvable pour cette transaction.');
  }

  const isOriginalContribution =
    original.type === 'CONTRIBUTION' ||
    original.type === 'SOL_CONTRIBUTION' ||
    original.type === 'SABOTAY_DEPOSIT';

  const newBalance = isOriginalContribution
    ? Math.max(0, Number(client.current_balance || 0) - original.amount)
    : Number(client.current_balance || 0) + original.amount;

  const newTotalPaid = isOriginalContribution
    ? Math.max(0, Number(client.total_paid_amount || 0) - original.amount)
    : Number(client.total_paid_amount || 0);

  const newPaidHands = isOriginalContribution
    ? Math.max(0, Number(client.paid_hands_count || 0) - Number(original.hands_covered || 1))
    : Number(client.paid_hands_count || 0);

  await db.withTransactionAsync(async () => {
    // 1. Insert Reversal Transaction (Immutable Audit Log)
    await db.runAsync(
      `INSERT INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, hands_covered, type, payment_method, note, created_at_local, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'REVERSAL', 'CASH', ?, ?, 'PENDING')`,
      [
        reversalId,
        original.client_id,
        collectorId,
        original.sol_group_id,
        original.business_id,
        original.amount,
        original.hands_covered || 1,
        `ANNULATION [Réf #${original.id.slice(0, 8)}] : ${reason}`,
        now,
      ]
    );

    // 2. Adjust Client Balance
    await db.runAsync(
      `UPDATE clients 
       SET current_balance = ?, total_paid_amount = ?, paid_hands_count = ?, sync_status = 'PENDING' 
       WHERE id = ?`,
      [newBalance, newTotalPaid, newPaidHands, original.client_id]
    );
  });

  return {
    id: reversalId,
    clientId: original.client_id,
    memberId: original.client_id,
    collectorId,
    businessId: original.business_id || undefined,
    solGroupId: original.sol_group_id || undefined,
    amount: original.amount,
    handsCovered: original.hands_covered || 1,
    type: 'REVERSAL',
    paymentMethod: 'CASH',
    note: `ANNULATION [Réf #${original.id.slice(0, 8)}] : ${reason}`,
    createdAtLocal: now,
    syncStatus: 'PENDING',
  };
}
