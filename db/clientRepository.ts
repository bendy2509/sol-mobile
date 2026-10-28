import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { Client, ClientType, SyncStatus } from '@/types';
import { getActiveCollectorId, getDatabase, isClientPhoneTaken } from './sqlite';
import { assertEnrollmentOpen, getActiveBusinessConfig, getCurrentCycleBoundary, getCycleHandsTotal, recomputeCycleShape } from './businessRepository';
import { normalizePhoneNumber, extractRaw8Digits, arePhoneNumbersEqual } from '@/lib/phoneUtils';
import { supabase, isCloudSyncActive } from '@/lib/supabase';
import { localDateString } from '@/lib/dates';

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
      payout_ranks,
      hands_count,
      received_hands_count,
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
      AND id NOT IN (SELECT id FROM deleted_clients)
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
    payout_ranks: string | null;
    hands_count: number | null;
    received_hands_count: number | null;
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

  const todayStr = localDateString();

  return rows.map((r) => {
    const parsedRanksCount = r.payout_ranks ? String(r.payout_ranks).split(/[,;\s]+/).filter(Boolean).length : 1;
    const handsCount = Math.max(1, Number(r.hands_count || 1), parsedRanksCount);
    const receivedHandsCount = Number(
      r.received_hands_count !== null && r.received_hands_count !== undefined
        ? r.received_hands_count
        : r.has_received_hand || r.has_received_payout
        ? handsCount
        : 0
    );
    const hasHand = receivedHandsCount >= handsCount || Boolean(r.has_received_hand || r.has_received_payout);
    const unitAmount = Number(r.daily_amount || 250);
    const balance = Number(r.current_balance || 0);
    const totalPaid = Number(r.total_paid_amount || balance);
    const paidHands = Math.max(
      Number(r.paid_hands_count || 0),
      Math.floor(balance / (unitAmount || 1)),
      Math.floor(totalPaid / (unitAmount || 1))
    );

    return {
      id: r.id,
      businessId: r.business_id || undefined,
      collectorId: r.collector_id,
      fullName: r.full_name,
      phoneNumber: r.phone_number,
      type: (r.type as any) || 'SABOTAY',
      dailyAmount: unitAmount,
      currentBalance: balance,
      payoutRank: r.payout_rank !== null ? Number(r.payout_rank) : null,
      rankOrder: r.payout_rank !== null ? Number(r.payout_rank) : undefined,
      payoutRanks: r.payout_ranks || (r.payout_rank ? String(r.payout_rank) : undefined),
      handsCount,
      receivedHandsCount,
      hasReceivedHand: hasHand,
      hasReceivedPayout: hasHand,
      handReceivedDate: r.hand_received_date || undefined,
      totalPaidAmount: totalPaid,
      paidHandsCount: paidHands,
      paidUntilDate: r.paid_until_date || '', // '' = not covered yet (never paid)
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
    payout_ranks: string | null;
    hands_count: number | null;
    received_hands_count: number | null;
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

  const todayStr = localDateString();
  const parsedRanksCount = r.payout_ranks ? String(r.payout_ranks).split(/[,;\s]+/).filter(Boolean).length : 1;
  const handsCount = Math.max(1, Number(r.hands_count || 1), parsedRanksCount);
  const receivedHandsCount = Number(
    r.received_hands_count !== null && r.received_hands_count !== undefined
      ? r.received_hands_count
      : r.has_received_hand || r.has_received_payout
      ? handsCount
      : 0
  );
  const hasHand = receivedHandsCount >= handsCount || Boolean(r.has_received_hand || r.has_received_payout);
  const unitAmount = Number(r.daily_amount || 250);
  const balance = Number(r.current_balance || 0);
  const totalPaid = Number(r.total_paid_amount || balance);
  const paidHands = Math.max(
    Number(r.paid_hands_count || 0),
    Math.floor(balance / (unitAmount || 1)),
    Math.floor(totalPaid / (unitAmount || 1))
  );

  return {
    id: r.id,
    businessId: r.business_id || undefined,
    collectorId: r.collector_id,
    fullName: r.full_name,
    phoneNumber: r.phone_number,
    type: (r.type as any) || 'SABOTAY',
    dailyAmount: unitAmount,
    currentBalance: balance,
    payoutRank: r.payout_rank !== null ? Number(r.payout_rank) : null,
    rankOrder: r.payout_rank !== null ? Number(r.payout_rank) : undefined,
    payoutRanks: r.payout_ranks || (r.payout_rank ? String(r.payout_rank) : undefined),
    handsCount,
    receivedHandsCount,
    hasReceivedHand: hasHand,
    hasReceivedPayout: hasHand,
    handReceivedDate: r.hand_received_date || undefined,
    totalPaidAmount: totalPaid,
    paidHandsCount: paidHands,
    paidUntilDate: r.paid_until_date || '', // '' = not covered yet (never paid)
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
    payout_ranks: string | null;
    hands_count: number | null;
    received_hands_count: number | null;
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

  const todayStr = localDateString();
  const parsedQrRanksCount = r.payout_ranks ? String(r.payout_ranks).split(/[,;\s]+/).filter(Boolean).length : 1;
  const handsCount = Math.max(1, Number(r.hands_count || 1), parsedQrRanksCount);
  const receivedHandsCount = Number(
    r.received_hands_count !== null && r.received_hands_count !== undefined
      ? r.received_hands_count
      : r.has_received_hand || r.has_received_payout
      ? handsCount
      : 0
  );
  const hasHand = receivedHandsCount >= handsCount || Boolean(r.has_received_hand || r.has_received_payout);
  const unitAmount = Number(r.daily_amount || 250);
  const balance = Number(r.current_balance || 0);
  const totalPaid = Number(r.total_paid_amount || balance);
  const paidHands = Math.max(
    Number(r.paid_hands_count || 0),
    Math.floor(balance / (unitAmount || 1)),
    Math.floor(totalPaid / (unitAmount || 1))
  );

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
    payoutRanks: r.payout_ranks || (r.payout_rank ? String(r.payout_rank) : undefined),
    handsCount,
    receivedHandsCount,
    hasReceivedHand: hasHand,
    hasReceivedPayout: hasHand,
    handReceivedDate: r.hand_received_date || undefined,
    totalPaidAmount: totalPaid,
    paidHandsCount: paidHands,
    paidUntilDate: r.paid_until_date || '', // '' = not covered yet (never paid)
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
  handsCount?: number;
  payoutRank?: number;
  payoutRanks?: string | number[];
  businessId?: string;
  collectorId?: string;
}): Promise<Client> {
  const db = await getDatabase();
  const collectorId = data.collectorId || (await getActiveCollectorId());
  const activeBusiness = await getActiveBusinessConfig();
  const businessId = data.businessId || activeBusiness?.id || null;

  // A hand already paid out fixes the pot: no new member until that payout is reversed
  await assertEnrollmentOpen(collectorId);

  const currentTotalHands = await getCycleHandsTotal(collectorId);
  const startingRank = currentTotalHands + 1;
  let handsCount = Math.max(1, Number(data.handsCount) || 1);
  if (data.payoutRanks) {
    const parsedRanks = (Array.isArray(data.payoutRanks) ? data.payoutRanks : String(data.payoutRanks).split(/[,;\s]+/))
      .map((r) => String(r).trim())
      .filter(Boolean);
    if (parsedRanks.length > handsCount) {
      handsCount = parsedRanks.length;
    }
  }
  const payoutRank = data.payoutRank || startingRank;

  let payoutRanksStr: string;
  if (Array.isArray(data.payoutRanks)) {
    payoutRanksStr = data.payoutRanks.join(',');
  } else if (data.payoutRanks) {
    payoutRanksStr = String(data.payoutRanks);
  } else {
    const ranks = [];
    for (let i = 0; i < handsCount; i++) {
      ranks.push(payoutRank + i);
    }
    payoutRanksStr = ranks.join(',');
  }

  const id = uuidv4();
  const shortId = id.replace(/-/g, '').substring(0, 8).toUpperCase();
  const qrCodeToken = `SOL-${shortId}`;
  const now = new Date().toISOString();
  const todayStr = localDateString();
  // Nothing is paid at enrolment: the first contribution goes through createTransaction
  // (cycle limits, coverage from today, audit log, receipt) like every other collection.
  const initialBalance = 0;
  const initialHandsCount = 0;

  const normalizedPhone = normalizePhoneNumber(data.phoneNumber);

  const isPhoneTaken = await isClientPhoneTaken(normalizedPhone, collectorId);
  if (isPhoneTaken) {
    throw new Error('Ce numéro de téléphone est déjà attribué à un autre adhérent de ce carnet.');
  }

  await db.runAsync(
    `INSERT INTO clients (
      id, business_id, collector_id, full_name, phone_number, type, 
      daily_amount, current_balance, payout_rank, payout_ranks, 
      hands_count, received_hands_count, has_received_hand, has_received_payout, 
      hand_received_date, total_paid_amount, paid_hands_count, paid_until_date, 
      qr_code_token, created_at, sync_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      payoutRanksStr,
      handsCount,
      0, // received_hands_count
      0, // has_received_hand
      0, // has_received_payout
      null, // hand_received_date
      initialBalance, // total_paid_amount
      initialHandsCount, // paid_hands_count
      null, // paid_until_date: not covered until the first payment (was today, which pushed
      //      the first payment's coverage to tomorrow and showed the member as paid)
      qrCodeToken,
      now,
      'PENDING',
    ]
  );

  // One round per hand: the cycle gains rounds and its end date moves
  if (activeBusiness) await recomputeCycleShape(collectorId);

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
    payoutRanks: payoutRanksStr || undefined,
    handsCount,
    receivedHandsCount: 0,
    hasReceivedHand: false,
    hasReceivedPayout: false,
    handReceivedDate: undefined,
    totalPaidAmount: initialBalance,
    paidHandsCount: initialHandsCount,
    paidUntilDate: '', // not covered until the first payment
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
    payoutRanks?: string | number[];
    handsCount?: number;
  }
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const params: any[] = [];

  // Hands and payout ranks shape every round's pot: frozen once a hand is paid out
  if (data.handsCount !== undefined || data.payoutRanks !== undefined || data.payoutRank !== undefined) {
    const current = await db.getFirstAsync<{ collector_id: string; hands_count: number | null; payout_rank: number | null; payout_ranks: string | null }>(
      `SELECT collector_id, hands_count, payout_rank, payout_ranks FROM clients WHERE id = ?`,
      [clientId]
    );
    const newRanks = data.payoutRanks === undefined ? undefined : Array.isArray(data.payoutRanks) ? data.payoutRanks.join(',') : String(data.payoutRanks);
    const changes =
      (data.handsCount !== undefined && Math.max(1, Number(data.handsCount) || 1) !== Math.max(1, Number(current?.hands_count || 1))) ||
      (newRanks !== undefined && newRanks.replace(/\s/g, '') !== String(current?.payout_ranks || '').replace(/\s/g, '')) ||
      (data.payoutRank !== undefined && Number(data.payoutRank) !== Number(current?.payout_rank));
    if (changes) await assertEnrollmentOpen(current?.collector_id);
  }

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
  if (data.payoutRanks !== undefined) {
    const ranksStr = Array.isArray(data.payoutRanks) ? data.payoutRanks.join(',') : data.payoutRanks;
    fields.push('payout_ranks = ?');
    params.push(ranksStr);
  }
  if (data.handsCount !== undefined) {
    fields.push('hands_count = ?');
    params.push(Math.max(1, Number(data.handsCount) || 1));
  }

  if (fields.length === 0) return;

  fields.push("sync_status = 'PENDING'");
  params.push(clientId);

  await db.runAsync(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`, params);

  // Hands may have changed: rounds and end date follow
  try {
    const clientRow = await db.getFirstAsync<{ collector_id: string }>(`SELECT collector_id FROM clients WHERE id = ?`, [clientId]);
    await recomputeCycleShape(clientRow?.collector_id);
  } catch (bizErr) {
    console.warn('Could not recalculate cycle total slots after client update:', bizErr);
  }
}

export const DELETE_WITH_OPERATIONS_MESSAGE =
  'Cet adhérent a des opérations enregistrées : annulez-les avant de le retirer du carnet.';

export async function deleteClient(clientId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  // 1. Fetch client info before deletion for tombstone & collector attribution
  const client = await db.getFirstAsync<{ id: string; collector_id: string; full_name: string; qr_code_token?: string; phone_number?: string }>(
    `SELECT id, collector_id, full_name, qr_code_token, phone_number FROM clients WHERE id = ?`,
    [clientId]
  );
  const collectorId = client?.collector_id || (await getActiveCollectorId());

  // Removing a member changes the rounds (frozen after a payout) and would erase their
  // operations: no collection may disappear, so their operations must be reversed first
  await assertEnrollmentOpen(collectorId);
  // Operations of the current cycle only: earlier cycles are archived
  const boundary = await getCurrentCycleBoundary(collectorId);
  const ops = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM transactions
     WHERE client_id = ? AND type != 'REVERSAL' AND is_reversed = 0 AND created_at_local >= ?`,
    [clientId, boundary || '']
  );
  if (Number(ops?.count || 0) > 0) {
    throw new Error(DELETE_WITH_OPERATIONS_MESSAGE);
  }

  const token = client?.qr_code_token || null;
  const phone = client?.phone_number || null;

  // 2. Insert into deleted_clients tombstone table so syncEngine never resurrects it
  await db.runAsync(
    `INSERT OR REPLACE INTO deleted_clients (id, qr_code_token, phone_number, collector_id, deleted_at, sync_status) VALUES (?, ?, ?, ?, ?, 'PENDING')`,
    [clientId, token, phone, collectorId, now]
  );

  // 3. Delete related transactions locally
  await db.runAsync(`DELETE FROM transactions WHERE client_id = ?`, [clientId]);

  // 4. Delete client locally
  await db.runAsync(`DELETE FROM clients WHERE id = ?`, [clientId]);

  // 5. The cycle loses this member's rounds
  try {
    await recomputeCycleShape(collectorId);
  } catch (bizErr) {
    console.warn('Could not update cycle total slots after deletion:', bizErr);
  }

  // 6. Delete from Supabase if online (by ID and by unique qr_code_token)
  if (isCloudSyncActive) {
    try {
      await supabase.from('transactions').delete().eq('client_id', clientId);
      let delError;
      if (token) {
        const res = await supabase.from('clients').delete().or(`id.eq.${clientId},qr_code_token.eq.${token}`);
        delError = res.error;
      } else {
        const res = await supabase.from('clients').delete().eq('id', clientId);
        delError = res.error;
      }
      if (!delError) {
        await db.runAsync(`UPDATE deleted_clients SET sync_status = 'SYNCED' WHERE id = ?`, [clientId]);
      }
    } catch (err) {
      console.warn('Supabase delete error (will be synced later):', err);
    }
  }
}
