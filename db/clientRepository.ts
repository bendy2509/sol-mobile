import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { Client, ClientType, SyncStatus } from '@/types';
import { getActiveCollectorId, getDatabase } from './sqlite';
import { getActiveBusinessConfig } from './businessRepository';

export async function getAllClients(options?: {
  search?: string;
  type?: ClientType;
  collectorId?: string;
  businessId?: string;
}): Promise<Client[]> {
  const db = await getDatabase();
  const collectorId = options?.collectorId || (await getActiveCollectorId());

  let query = `
    SELECT 
      id,
      business_id,
      collector_id,
      full_name,
      phone_number,
      type,
      daily_amount,
      current_balance,
      payout_rank,
      has_received_payout,
      qr_code_token,
      created_at,
      sync_status
    FROM clients 
    WHERE collector_id = ?
  `;
  const params: (string | number)[] = [collectorId];

  if (options?.businessId) {
    query += ` AND business_id = ?`;
    params.push(options.businessId);
  }

  if (options?.type) {
    query += ` AND type = ?`;
    params.push(options.type);
  }

  if (options?.search && options.search.trim().length > 0) {
    const term = `%${options.search.trim()}%`;
    query += ` AND (full_name LIKE ? OR phone_number LIKE ? OR qr_code_token LIKE ?)`;
    params.push(term, term, term);
  }

  query += ` ORDER BY payout_rank ASC, full_name ASC`;

  const rows = await db.getAllAsync<{
    id: string;
    business_id: string | null;
    collector_id: string;
    full_name: string;
    phone_number: string;
    type: string;
    daily_amount: number;
    current_balance: number;
    payout_rank: number | null;
    has_received_payout: number;
    qr_code_token: string;
    created_at: string;
    sync_status: SyncStatus;
  }>(query, params);

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id || undefined,
    collectorId: r.collector_id,
    fullName: r.full_name,
    phoneNumber: r.phone_number,
    type: r.type as any,
    dailyAmount: Number(r.daily_amount),
    currentBalance: Number(r.current_balance),
    payoutRank: r.payout_rank !== null ? Number(r.payout_rank) : null,
    hasReceivedPayout: Boolean(r.has_received_payout),
    qrCodeToken: r.qr_code_token,
    createdAt: r.created_at,
    syncStatus: r.sync_status,
    paymentStatusToday: 'UNPAID_TODAY',
    overdueRoundsCount: 0,
    totalPaidInCycle: Number(r.current_balance),
  }));
}

export async function getClientById(id: string): Promise<Client | null> {
  const db = await getDatabase();
  const r = await db.getFirstAsync<{
    id: string;
    business_id: string | null;
    collector_id: string;
    full_name: string;
    phone_number: string;
    type: string;
    daily_amount: number;
    current_balance: number;
    payout_rank: number | null;
    has_received_payout: number;
    qr_code_token: string;
    created_at: string;
    sync_status: SyncStatus;
  }>(`SELECT * FROM clients WHERE id = ?`, [id]);

  if (!r) return null;

  return {
    id: r.id,
    businessId: r.business_id || undefined,
    collectorId: r.collector_id,
    fullName: r.full_name,
    phoneNumber: r.phone_number,
    type: r.type as any,
    dailyAmount: Number(r.daily_amount),
    currentBalance: Number(r.current_balance),
    payoutRank: r.payout_rank !== null ? Number(r.payout_rank) : null,
    hasReceivedPayout: Boolean(r.has_received_payout),
    qrCodeToken: r.qr_code_token,
    createdAt: r.created_at,
    syncStatus: r.sync_status,
    paymentStatusToday: 'UNPAID_TODAY',
    overdueRoundsCount: 0,
    totalPaidInCycle: Number(r.current_balance),
  };
}

export async function getClientByQrToken(qrCodeToken: string): Promise<Client | null> {
  const db = await getDatabase();
  const tokenClean = qrCodeToken.trim();
  const r = await db.getFirstAsync<{
    id: string;
    business_id: string | null;
    collector_id: string;
    full_name: string;
    phone_number: string;
    type: string;
    daily_amount: number;
    current_balance: number;
    payout_rank: number | null;
    has_received_payout: number;
    qr_code_token: string;
    created_at: string;
    sync_status: SyncStatus;
  }>(`SELECT * FROM clients WHERE qr_code_token = ? OR id = ?`, [tokenClean, tokenClean]);

  if (!r) return null;

  return {
    id: r.id,
    businessId: r.business_id || undefined,
    collectorId: r.collector_id,
    fullName: r.full_name,
    phoneNumber: r.phone_number,
    type: r.type as any,
    dailyAmount: Number(r.daily_amount),
    currentBalance: Number(r.current_balance),
    payoutRank: r.payout_rank !== null ? Number(r.payout_rank) : null,
    hasReceivedPayout: Boolean(r.has_received_payout),
    qrCodeToken: r.qr_code_token,
    createdAt: r.created_at,
    syncStatus: r.sync_status,
    paymentStatusToday: 'UNPAID_TODAY',
    overdueRoundsCount: 0,
    totalPaidInCycle: Number(r.current_balance),
  };
}

export async function createClient(data: {
  fullName: string;
  phoneNumber: string;
  type: ClientType;
  dailyAmount: number;
  initialDeposit?: number;
  initialBalance?: number;
  payoutRank?: number;
  businessId?: string;
  collectorId?: string;
}): Promise<Client> {
  const db = await getDatabase();
  const collectorId = data.collectorId || (await getActiveCollectorId());
  const activeBusiness = await getActiveBusinessConfig();
  const businessId = data.businessId || activeBusiness?.id || null;

  const countRow = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM clients WHERE collector_id = ?`,
    [collectorId]
  );
  const payoutRank = data.payoutRank || (countRow?.count || 0) + 1;

  const id = uuidv4();
  const shortId = id.replace(/-/g, '').substring(0, 8).toUpperCase();
  const qrCodeToken = `SOL-${shortId}`;
  const now = new Date().toISOString();
  const initialBalance = data.initialDeposit !== undefined ? data.initialDeposit : data.initialBalance || 0;

  await db.runAsync(
    `INSERT INTO clients (id, business_id, collector_id, full_name, phone_number, type, daily_amount, current_balance, payout_rank, has_received_payout, qr_code_token, created_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'PENDING')`,
    [
      id,
      businessId,
      collectorId,
      data.fullName.trim(),
      data.phoneNumber.trim(),
      data.type,
      data.dailyAmount,
      initialBalance,
      payoutRank,
      qrCodeToken,
      now,
    ]
  );

  // If initial deposit > 0, record initial transaction
  if (initialBalance > 0) {
    const txId = uuidv4();
    await db.runAsync(
      `INSERT INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, type, payment_method, created_at_local, sync_status)
       VALUES (?, ?, ?, NULL, ?, ?, ?, 'CASH', ?, 'PENDING')`,
      [
        txId,
        id,
        collectorId,
        businessId,
        initialBalance,
        data.type === 'SOL' ? 'SOL_CONTRIBUTION' : 'SABOTAY_DEPOSIT',
        now,
      ]
    );
  }

  return {
    id,
    businessId: businessId || undefined,
    collectorId,
    fullName: data.fullName.trim(),
    phoneNumber: data.phoneNumber.trim(),
    type: data.type,
    dailyAmount: data.dailyAmount,
    currentBalance: initialBalance,
    payoutRank,
    hasReceivedPayout: false,
    qrCodeToken,
    createdAt: now,
    syncStatus: 'PENDING',
    paymentStatusToday: initialBalance > 0 ? 'PAID_TODAY' : 'UNPAID_TODAY',
    overdueRoundsCount: 0,
    totalPaidInCycle: initialBalance,
  };
}

export async function updateClientBalance(clientId: string, newBalance: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE clients SET current_balance = ?, sync_status = 'PENDING' WHERE id = ?`,
    [newBalance, clientId]
  );
}
