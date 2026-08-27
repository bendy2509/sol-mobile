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
import {
  calculateCoverageDate,
  calculateHandsCount,
  reconstructClientFinancialTimeline,
} from '@/services/financialService';
import { recordAuditLog } from '@/services/auditService';

// In-memory Mutex to prevent double-submit collisions even during lag or double-clicking
const inFlightTransactions = new Set<string>();

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
  idempotencyKey?: string;
}): Promise<Transaction> {
  const { clientId, amount } = data;

  // Domain Validation 1: Positive Amount
  if (!amount || amount <= 0 || isNaN(amount)) {
    throw new Error('Le montant de la transaction doit être strictement supérieur à 0 HTG.');
  }

  // Domain Validation 2: In-flight Mutex Lock
  const lockKey = data.idempotencyKey || `${clientId}_${data.type}_${amount}`;
  if (inFlightTransactions.has(lockKey)) {
    throw new Error('Une opération identique est déjà en cours de traitement. Veuillez patienter.');
  }

  inFlightTransactions.add(lockKey);

  try {
    const db = await getDatabase();
    const collectorId = data.collectorId || (await getActiveCollectorId());
    const activeBusiness = await getActiveBusinessConfig();
    const businessId = data.businessId !== undefined ? data.businessId : activeBusiness?.id || null;
    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];
    const paymentMethod = data.paymentMethod || 'CASH';
    const idempotencyKey = data.idempotencyKey || uuidv4();

    // Check if transaction with this idempotency key already exists (Idempotent Guard)
    if (data.idempotencyKey) {
      const existing = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM transactions WHERE idempotency_key = ?`,
        [data.idempotencyKey]
      );
      if (existing) {
        const fullExisting = await getTransactions({ clientId, limit: 1 });
        if (fullExisting.length > 0) return fullExisting[0];
      }
    }

    // Fetch current client record
    const client = await db.getFirstAsync<{
      current_balance: number;
      total_paid_amount: number;
      paid_hands_count: number;
      paid_until_date: string | null;
      full_name: string;
      phone_number: string;
      has_received_hand?: number;
    }>(
      `SELECT current_balance, total_paid_amount, paid_hands_count, paid_until_date, full_name, phone_number, has_received_hand 
       FROM clients WHERE id = ?`,
      [clientId]
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
      data.handsCovered && data.handsCovered > 0
        ? data.handsCovered
        : isContribution
        ? calculateHandsCount(amount, unitAmount)
        : 1;

    const currentBalance = Number(client.current_balance || 0);
    const currentTotalPaid = Number(client.total_paid_amount || currentBalance);
    const currentPaidHands = Number(client.paid_hands_count || 0);

    let newBalance = currentBalance;
    let newTotalPaid = currentTotalPaid;
    let newPaidHands = currentPaidHands;
    let newPaidUntilDate = client.paid_until_date || todayStr;

    if (isContribution) {
      newBalance = currentBalance + amount;
      newTotalPaid = currentTotalPaid + amount;
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
      newBalance = Math.max(0, currentBalance - amount);
    }

    let persistedType: TransactionType = 'SOL_CONTRIBUTION';
    if (data.type === 'SABOTAY_DEPOSIT') persistedType = 'SABOTAY_DEPOSIT';
    else if (data.type === 'SOL_CONTRIBUTION' || data.type === 'CONTRIBUTION') persistedType = 'SOL_CONTRIBUTION';
    else if (data.type === 'HAND_PAYOUT' || data.type === 'SOL_PAYOUT') persistedType = 'SOL_PAYOUT';
    else if (data.type === 'WITHDRAWAL') persistedType = 'WITHDRAWAL';

    const id = uuidv4();

    // Atomic database transaction
    await db.withTransactionAsync(async () => {
      // 1. Insert transaction record
      await db.runAsync(
        `INSERT INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, hands_covered, type, payment_method, note, created_at_local, sync_status, idempotency_key, is_reversed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 0)`,
        [
          id,
          clientId,
          collectorId,
          data.solGroupId || null,
          businessId,
          amount,
          calculatedHandsCovered,
          persistedType,
          paymentMethod,
          data.note || null,
          now,
          idempotencyKey,
        ]
      );

      // 2. Update client financial state & coverage date
      await db.runAsync(
        `UPDATE clients 
         SET current_balance = ?, total_paid_amount = ?, paid_hands_count = ?, paid_until_date = ?, sync_status = 'PENDING' 
         WHERE id = ?`,
        [newBalance, newTotalPaid, newPaidHands, newPaidUntilDate, clientId]
      );

      // 3. If payout, flag hand as received but KEEP client in cycle
      if (isPayout) {
        await db.runAsync(
          `UPDATE clients 
           SET has_received_hand = 1, has_received_payout = 1, hand_received_date = ?, sync_status = 'PENDING' 
           WHERE id = ?`,
          [todayStr, clientId]
        );
      }
    });

    // Record internal audit log
    recordAuditLog({
      userId: collectorId,
      userRole: 'COLLECTOR',
      action: isContribution ? 'CREATE_CONTRIBUTION' : 'CREATE_PAYOUT',
      entityType: 'TRANSACTION',
      entityId: id,
      oldData: { balance: currentBalance, paidUntil: client.paid_until_date },
      newData: { amount, handsCovered: calculatedHandsCovered, newBalance, newPaidUntilDate },
      reason: data.note || undefined,
    }).catch(() => {});

    return {
      id,
      memberId: clientId,
      clientId,
      collectorId,
      solGroupId: data.solGroupId || null,
      businessId,
      amount,
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
      idempotencyKey,
    };
  } finally {
    // Release lock with brief debounce buffer
    setTimeout(() => {
      inFlightTransactions.delete(lockKey);
    }, 500);
  }
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
      t.idempotency_key,
      t.is_reversed,
      t.reversal_id,
      t.reversed_at,
      c.full_name as client_name,
      c.phone_number as client_phone
    FROM transactions t
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (options?.collectorId) {
    query += ` AND t.collector_id = ?`;
    params.push(options.collectorId);
  }

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
    idempotency_key: string | null;
    is_reversed: number | null;
    reversal_id: string | null;
    reversed_at: string | null;
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
    idempotencyKey: r.idempotency_key || undefined,
    isReversed: Boolean(r.is_reversed),
    reversalId: r.reversal_id || undefined,
    reversedAt: r.reversed_at || undefined,
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

  // Contribution deposits (excluding reversals)
  const inRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
     WHERE collector_id = ? AND type IN ('CONTRIBUTION', 'SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION') 
       AND is_reversed = 0 AND created_at_local >= ?`,
    [collectorId, startOfDayIso]
  );

  // Payouts & withdrawals
  const outRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
     WHERE collector_id = ? AND type IN ('HAND_PAYOUT', 'SOL_PAYOUT', 'WITHDRAWAL') 
       AND is_reversed = 0 AND created_at_local >= ?`,
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

/**
 * Reverses an erroneous financial transaction with atomic audit trail
 * and exact timeline recalculation from remaining valid transactions.
 */
export async function reverseTransaction(params: {
  transactionId: string;
  reason: string;
  collectorId?: string;
}): Promise<Transaction> {
  const { transactionId, reason } = params;
  if (!reason || reason.trim().length === 0) {
    throw new Error("Une justification est obligatoire pour effectuer l'annulation d'une transaction.");
  }

  const db = await getDatabase();
  const collectorId = params.collectorId || (await getActiveCollectorId());
  const activeBusiness = await getActiveBusinessConfig();
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
    is_reversed: number;
  }>(`SELECT * FROM transactions WHERE id = ?`, [transactionId]);

  if (!original) {
    throw new Error('Transaction originale introuvable.');
  }

  if (original.is_reversed) {
    throw new Error('Cette transaction a déjà été annulée précédemment.');
  }

  if (original.type === 'REVERSAL') {
    throw new Error("Impossible d'annuler une opération d'annulation.");
  }

  // Fetch all transactions for this client to reconstruct financial timeline accurately
  const allClientTxs = await getTransactions({ clientId: original.client_id });

  // Mark original as reversed in memory list
  const updatedTxsList = allClientTxs.map((t) =>
    t.id === original.id ? { ...t, isReversed: true } : t
  );

  // Compute exact reconstructed timeline
  const reconstructed = reconstructClientFinancialTimeline({
    transactions: updatedTxsList,
    unitAmount: activeBusiness?.contributionAmount || 250,
    frequency: activeBusiness?.frequency || 'DAILY',
    cycleStartDate: activeBusiness?.startDate || now.split('T')[0],
  });

  const reversalNote = `ANNULATION [Réf #${original.id.slice(0, 8)}] : ${reason.trim()}`;

  await db.withTransactionAsync(async () => {
    // 1. Mark original transaction as reversed
    await db.runAsync(
      `UPDATE transactions 
       SET is_reversed = 1, reversal_id = ?, reversed_at = ?, sync_status = 'PENDING' 
       WHERE id = ?`,
      [reversalId, now, original.id]
    );

    // 2. Insert Reversal Transaction (Immutable Append-Only Audit Entry)
    await db.runAsync(
      `INSERT INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, hands_covered, type, payment_method, note, created_at_local, sync_status, is_reversed)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'REVERSAL', 'CASH', ?, ?, 'PENDING', 0)`,
      [
        reversalId,
        original.client_id,
        collectorId,
        original.sol_group_id,
        original.business_id,
        original.amount,
        original.hands_covered || 1,
        reversalNote,
        now,
      ]
    );

    // 3. Update Client with exact reconstructed timeline values
    await db.runAsync(
      `UPDATE clients 
       SET current_balance = ?, total_paid_amount = ?, paid_hands_count = ?, 
           has_received_hand = ?, has_received_payout = ?, hand_received_date = ?, 
           paid_until_date = ?, sync_status = 'PENDING' 
       WHERE id = ?`,
      [
        reconstructed.currentBalance,
        reconstructed.totalPaidAmount,
        reconstructed.paidHandsCount,
        reconstructed.hasReceivedHand ? 1 : 0,
        reconstructed.hasReceivedHand ? 1 : 0,
        reconstructed.handReceivedDate,
        reconstructed.paidUntilDate,
        original.client_id,
      ]
    );
  });

  // 4. Record to Audit Logs
  recordAuditLog({
    userId: collectorId,
    userRole: 'COLLECTOR',
    action: 'REVERSE_CONTRIBUTION',
    entityType: 'TRANSACTION',
    entityId: reversalId,
    oldData: { originalId: original.id, amount: original.amount, type: original.type },
    newData: { reconstructed },
    reason: reason.trim(),
  }).catch(() => {});

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
    note: reversalNote,
    createdAtLocal: now,
    syncStatus: 'PENDING',
  };
}
