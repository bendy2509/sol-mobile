import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { Client, ClientType, SyncStatus } from '@/types';
import { getActiveCollectorId, getDatabase, isClientPhoneTaken } from './sqlite';
import { getActiveBusinessConfig } from './businessRepository';
import { normalizePhoneNumber, extractRaw8Digits, arePhoneNumbersEqual } from '@/lib/phoneUtils';

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
      has_received_hand,
      has_received_payout,
      hand_received_date,
      total_paid_amount,
      paid_hands_count,
      paid_until_date,
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
    has_received_hand: number | null;
    has_received_payout: number | null;
    hand_received_date: string | null;
    total_paid_amount: number | null;
    paid_hands_count: number | null;
    paid_until_date: string | null;
    qr_code_token: string;
    created_at: string;
    sync_status: SyncStatus;
  }>(query, params);

  const todayStr = new Date().toISOString().split('T')[0];

  return rows.map((r) => {
    const hasHand = Boolean(r.has_received_hand || r.has_received_payout);
    const balance = Number(r.current_balance || 0);
    const totalPaid = Number(r.total_paid_amount || balance);
    const paidHands = Number(r.paid_hands_count || 0);

    return {
      id: r.id,
      businessId: r.business_id || undefined,
      collectorId: r.collector_id,
      fullName: r.full_name,
      phoneNumber: r.phone_number,
      type: (r.type as any) || 'SABOTAY',
      dailyAmount: Number(r.daily_amount || 250),
      currentBalance: balance,
      payoutRank: r.payout_rank !== null ? Number(r.payout_rank) : null,
      rankOrder: r.payout_rank !== null ? Number(r.payout_rank) : undefined,
      hasReceivedHand: hasHand,
      hasReceivedPayout: hasHand,
      handReceivedDate: r.hand_received_date || undefined,
      totalPaidAmount: totalPaid,
      paidHandsCount: paidHands,
      paidUntilDate: r.paid_until_date || todayStr,
      qrCodeToken: r.qr_code_token,
      createdAt: r.created_at,
      syncStatus: r.sync_status || 'PENDING',
      paymentStatusToday: 'UNPAID_TODAY',
      overdueRoundsCount: 0,
      totalPaidInCycle: totalPaid,
      handsCoveredAhead: 0,
    };
  });
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
    has_received_hand: number | null;
    has_received_payout: number | null;
    hand_received_date: string | null;
    total_paid_amount: number | null;
    paid_hands_count: number | null;
    paid_until_date: string | null;
    qr_code_token: string;
    created_at: string;
    sync_status: SyncStatus;
  }>(`SELECT * FROM clients WHERE id = ?`, [id]);

  if (!r) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const hasHand = Boolean(r.has_received_hand || r.has_received_payout);
  const balance = Number(r.current_balance || 0);
  const totalPaid = Number(r.total_paid_amount || balance);
  const paidHands = Number(r.paid_hands_count || 0);

  return {
    id: r.id,
    businessId: r.business_id || undefined,
    collectorId: r.collector_id,
    fullName: r.full_name,
    phoneNumber: r.phone_number,
    type: (r.type as any) || 'SABOTAY',
    dailyAmount: Number(r.daily_amount || 250),
    currentBalance: balance,
    payoutRank: r.payout_rank !== null ? Number(r.payout_rank) : null,
    rankOrder: r.payout_rank !== null ? Number(r.payout_rank) : undefined,
    hasReceivedHand: hasHand,
    hasReceivedPayout: hasHand,
    handReceivedDate: r.hand_received_date || undefined,
    totalPaidAmount: totalPaid,
    paidHandsCount: paidHands,
    paidUntilDate: r.paid_until_date || todayStr,
    qrCodeToken: r.qr_code_token,
    createdAt: r.created_at,
    syncStatus: r.sync_status || 'PENDING',
    paymentStatusToday: 'UNPAID_TODAY',
    overdueRoundsCount: 0,
    totalPaidInCycle: totalPaid,
    handsCoveredAhead: 0,
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
    has_received_hand: number | null;
    has_received_payout: number | null;
    hand_received_date: string | null;
    total_paid_amount: number | null;
    paid_hands_count: number | null;
    paid_until_date: string | null;
    qr_code_token: string;
    created_at: string;
    sync_status: SyncStatus;
  }>(`SELECT * FROM clients WHERE qr_code_token = ? OR id = ?`, [tokenClean, tokenClean]);

  if (!r) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const hasHand = Boolean(r.has_received_hand || r.has_received_payout);
  const balance = Number(r.current_balance || 0);
  const totalPaid = Number(r.total_paid_amount || balance);
  const paidHands = Number(r.paid_hands_count || 0);

  return {
    id: r.id,
    businessId: r.business_id || undefined,
    collectorId: r.collector_id,
    fullName: r.full_name,
    phoneNumber: r.phone_number,
    type: (r.type as any) || 'SABOTAY',
    dailyAmount: Number(r.daily_amount || 250),
    currentBalance: balance,
    payoutRank: r.payout_rank !== null ? Number(r.payout_rank) : null,
    rankOrder: r.payout_rank !== null ? Number(r.payout_rank) : undefined,
    hasReceivedHand: hasHand,
    hasReceivedPayout: hasHand,
    handReceivedDate: r.hand_received_date || undefined,
    totalPaidAmount: totalPaid,
    paidHandsCount: paidHands,
    paidUntilDate: r.paid_until_date || todayStr,
    qrCodeToken: r.qr_code_token,
    createdAt: r.created_at,
    syncStatus: r.sync_status || 'PENDING',
    paymentStatusToday: 'UNPAID_TODAY',
    overdueRoundsCount: 0,
    totalPaidInCycle: totalPaid,
    handsCoveredAhead: 0,
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
  const todayStr = now.split('T')[0];
  const initialBalance = data.initialDeposit !== undefined ? data.initialDeposit : data.initialBalance || 0;
  const initialHandsCount = initialBalance > 0 ? Math.max(1, Math.floor(initialBalance / (data.dailyAmount || 1))) : 0;

  const normalizedPhone = normalizePhoneNumber(data.phoneNumber);

  const isPhoneTaken = await isClientPhoneTaken(normalizedPhone, collectorId);
  if (isPhoneTaken) {
    throw new Error('Ce numéro de téléphone est déjà attribué à un autre adhérent de ce carnet.');
  }

  await db.runAsync(
    `INSERT INTO clients (id, business_id, collector_id, full_name, phone_number, type, daily_amount, current_balance, payout_rank, has_received_hand, has_received_payout, hand_received_date, total_paid_amount, paid_hands_count, paid_until_date, qr_code_token, created_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?, ?, ?, ?, 'PENDING')`,
    [
      id,
      businessId,
      collectorId,
      data.fullName.trim(),
      normalizedPhone,
      data.type,
      data.dailyAmount,
      initialBalance,
      payoutRank,
      initialBalance,
      initialHandsCount,
      todayStr,
      qrCodeToken,
      now,
    ]
  );

  // If initial deposit > 0, record initial transaction
  if (initialBalance > 0) {
    const txId = uuidv4();
    await db.runAsync(
      `INSERT INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, hands_covered, type, payment_method, note, created_at_local, sync_status)
       VALUES (?, ?, ?, NULL, ?, ?, ?, 'CONTRIBUTION', 'CASH', 'Dépôt initial', ?, 'PENDING')`,
      [
        txId,
        id,
        collectorId,
        businessId,
        initialBalance,
        initialHandsCount,
        now,
      ]
    );
  }

  return {
    id,
    businessId: businessId || undefined,
    collectorId,
    fullName: data.fullName.trim(),
    phoneNumber: normalizedPhone,
    type: (data.type === 'HYBRID' ? 'SABOTAY' : data.type) as any,
    dailyAmount: data.dailyAmount,
    currentBalance: initialBalance,
    payoutRank,
    rankOrder: payoutRank,
    hasReceivedHand: false,
    hasReceivedPayout: false,
    handReceivedDate: undefined,
    totalPaidAmount: initialBalance,
    paidHandsCount: initialHandsCount,
    paidUntilDate: todayStr,
    qrCodeToken,
    createdAt: now,
    syncStatus: 'PENDING',
    paymentStatusToday: initialBalance > 0 ? 'PAID_TODAY' : 'UNPAID_TODAY',
    overdueRoundsCount: 0,
    totalPaidInCycle: initialBalance,
    handsCoveredAhead: 0,
  };
}

export async function updateClientBalance(clientId: string, newBalance: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE clients SET current_balance = ?, sync_status = 'PENDING' WHERE id = ?`,
    [newBalance, clientId]
  );
}

export async function updateClientDetails(
  clientId: string,
  data: {
    fullName?: string;
    phoneNumber?: string;
    payoutRank?: number;
  }
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const params: any[] = [];

  if (data.fullName !== undefined) {
    fields.push('full_name = ?');
    params.push(data.fullName.trim());
  }
  if (data.phoneNumber !== undefined) {
    const norm = normalizePhoneNumber(data.phoneNumber);
    const existing = await getClientById(clientId);
    if (existing) {
      const isTaken = await isClientPhoneTaken(norm, existing.collectorId, clientId);
      if (isTaken) {
        throw new Error('Ce numéro de téléphone est déjà attribué à un autre adhérent de ce carnet.');
      }
    }
    fields.push('phone_number = ?');
    params.push(norm);
  }
  if (data.payoutRank !== undefined) {
    fields.push('payout_rank = ?');
    params.push(data.payoutRank);
  }

  if (fields.length === 0) return;

  fields.push("sync_status = 'PENDING'");
  params.push(clientId);

  await db.runAsync(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`, params);
}

export async function deleteClient(clientId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM clients WHERE id = ?`, [clientId]);
}
