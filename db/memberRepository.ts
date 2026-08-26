import { FilterStatus, Member, MemberPaymentStatus, SortOption, Transaction } from '@/types';
import { getActiveBusinessConfig } from './businessRepository';
import { getActiveCollectorId, getDatabase } from './sqlite';
import { createTransaction } from './transactionRepository';
import { calculateClientPaymentStatus } from '@/services/financialService';

export async function getMembersWithPaymentStatus(options?: {
  businessId?: string;
  filter?: FilterStatus;
  sort?: SortOption;
  search?: string;
}): Promise<Member[]> {
  const db = await getDatabase();
  const collectorId = await getActiveCollectorId();
  const business = await getActiveBusinessConfig();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayIso = startOfDay.toISOString();
  const todayStr = startOfDayIso.split('T')[0];

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

  if (options?.search && options.search.trim().length > 0) {
    const term = `%${options.search.trim()}%`;
    query += ` AND (full_name LIKE ? OR phone_number LIKE ? OR qr_code_token LIKE ?)`;
    params.push(term, term, term);
  }

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
    sync_status: string;
  }>(query, params);

  const unitAmount = business?.contributionAmount || 250;
  const members: Member[] = [];

  for (const r of rows) {
    // Check if member paid today
    const paidTodayRow = await db.getFirstAsync<{ count: number; last_date: string }>(
      `SELECT count(*) as count, MAX(created_at_local) as last_date FROM transactions 
       WHERE client_id = ? AND type IN ('CONTRIBUTION', 'SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION') AND created_at_local >= ?`,
      [r.id, startOfDayIso]
    );
    const hasPaidToday = (paidTodayRow?.count || 0) > 0;

    // Get last overall payment date
    const lastTxRow = await db.getFirstAsync<{ last_date: string }>(
      `SELECT MAX(created_at_local) as last_date FROM transactions WHERE client_id = ?`,
      [r.id]
    );

    const balance = Number(r.current_balance || 0);
    const totalPaid = Number(r.total_paid_amount || balance);
    const paidHands = Number(r.paid_hands_count || Math.floor(balance / (unitAmount || 1)));
    const paidUntil = r.paid_until_date || null;
    const hasReceived = Boolean(r.has_received_hand || r.has_received_payout);

    const calculated = calculateClientPaymentStatus({
      todayStr,
      paidUntilDate: paidUntil,
      hasPaidToday,
      currentBalance: balance,
      unitAmount,
    });

    const paymentStatusToday: MemberPaymentStatus = calculated.status;
    const overdueRoundsCount = calculated.overdueRoundsCount;
    const handsCoveredAhead = calculated.handsCoveredAhead;

    members.push({
      id: r.id,
      businessId: r.business_id || undefined,
      collectorId: r.collector_id,
      fullName: r.full_name,
      phoneNumber: r.phone_number,
      type: (r.type as any) || 'SABOTAY',
      dailyAmount: Number(r.daily_amount || unitAmount),
      currentBalance: balance,
      payoutRank: r.payout_rank !== null && r.payout_rank !== undefined ? Number(r.payout_rank) : null,
      rankOrder: r.payout_rank !== null && r.payout_rank !== undefined ? Number(r.payout_rank) : undefined,
      hasReceivedHand: hasReceived,
      hasReceivedPayout: hasReceived,
      handReceivedDate: r.hand_received_date || undefined,
      totalPaidAmount: totalPaid,
      paidHandsCount: paidHands,
      paidUntilDate: paidUntil || todayStr,
      qrCodeToken: r.qr_code_token,
      createdAt: r.created_at,
      syncStatus: (r.sync_status as any) || 'PENDING',
      paymentStatusToday,
      overdueRoundsCount,
      lastPaymentDate: paidTodayRow?.last_date || lastTxRow?.last_date || null,
      totalPaidInCycle: totalPaid,
      handsCoveredAhead,
    });
  }

  // Apply Filter
  let filtered = members;
  if (options?.filter && options.filter !== 'ALL') {
    switch (options.filter) {
      case 'PAID_TODAY':
        filtered = filtered.filter(
          (m) => m.paymentStatusToday === 'PAID_TODAY' || m.paymentStatusToday === 'PAID_IN_ADVANCE'
        );
        break;
      case 'UNPAID_TODAY':
        filtered = filtered.filter((m) => m.paymentStatusToday === 'UNPAID_TODAY');
        break;
      case 'OVERDUE':
        filtered = filtered.filter((m) => m.paymentStatusToday === 'OVERDUE');
        break;
      case 'HAND_RECEIVED':
        filtered = filtered.filter((m) => m.hasReceivedHand);
        break;
      case 'HAND_PENDING':
        filtered = filtered.filter((m) => !m.hasReceivedHand);
        break;
      case 'UPCOMING_PAYOUT':
        filtered = filtered.filter((m) => !m.hasReceivedHand && m.payoutRank !== null);
        break;
    }
  }

  // Apply Sorting
  const sort = options?.sort || 'PAYOUT_RANK';
  filtered.sort((a, b) => {
    switch (sort) {
      case 'NAME':
        return a.fullName.localeCompare(b.fullName);
      case 'PAYOUT_RANK': {
        const rankA = a.payoutRank ?? 9999;
        const rankB = b.payoutRank ?? 9999;
        return rankA - rankB;
      }
      case 'BALANCE':
        return b.currentBalance - a.currentBalance;
      case 'OVERDUE':
        return b.overdueRoundsCount - a.overdueRoundsCount;
      case 'RECENT':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  return filtered;
}

export async function payoutMemberHand(
  memberId: string,
  amount: number,
  note?: string,
  businessId?: string
): Promise<Transaction> {
  const db = await getDatabase();
  const collectorId = await getActiveCollectorId();
  const todayStr = new Date().toISOString().split('T')[0];

  const tx = await createTransaction({
    clientId: memberId,
    businessId: businessId || null,
    amount,
    type: 'HAND_PAYOUT',
    collectorId,
    paymentMethod: 'CASH',
    note: note || 'Remise de la main complète du SOL',
  });

  // Flag hand received on client record but KEEP client in cycle
  await db.runAsync(
    `UPDATE clients 
     SET has_received_hand = 1, has_received_payout = 1, hand_received_date = ?, sync_status = 'PENDING' 
     WHERE id = ?`,
    [todayStr, memberId]
  );

  return tx;
}
