import { FilterStatus, Member, MemberPaymentStatus, SortOption, Transaction } from '@/types';
import { getActiveBusinessConfig } from './businessRepository';
import { getActiveCollectorId, getDatabase } from './sqlite';
import { createTransaction } from './transactionRepository';

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
    has_received_payout: number;
    qr_code_token: string;
    created_at: string;
    sync_status: string;
  }>(query, params);

  const contributionTarget = business?.contributionAmount || 250;

  const members: Member[] = [];

  for (const r of rows) {
    // Check if member paid today
    const paidTodayRow = await db.getFirstAsync<{ count: number; last_date: string }>(
      `SELECT count(*) as count, MAX(created_at_local) as last_date FROM transactions 
       WHERE client_id = ? AND type IN ('SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION') AND created_at_local >= ?`,
      [r.id, startOfDayIso]
    );
    const hasPaidToday = (paidTodayRow?.count || 0) > 0;

    // Get last overall payment date
    const lastTxRow = await db.getFirstAsync<{ last_date: string }>(
      `SELECT MAX(created_at_local) as last_date FROM transactions WHERE client_id = ?`,
      [r.id]
    );

    const balance = Number(r.current_balance || 0);
    let paymentStatusToday: MemberPaymentStatus = hasPaidToday ? 'PAID_TODAY' : 'UNPAID_TODAY';
    let overdueRoundsCount = 0;

    if (!hasPaidToday && balance < contributionTarget) {
      paymentStatusToday = 'OVERDUE';
      overdueRoundsCount = Math.max(1, Math.ceil((contributionTarget - balance) / (contributionTarget || 1)));
    }

    members.push({
      id: r.id,
      businessId: r.business_id || undefined,
      collectorId: r.collector_id,
      fullName: r.full_name,
      phoneNumber: r.phone_number,
      type: r.type as any,
      dailyAmount: Number(r.daily_amount || contributionTarget),
      currentBalance: balance,
      payoutRank: r.payout_rank !== null ? Number(r.payout_rank) : null,
      hasReceivedPayout: Boolean(r.has_received_payout),
      qrCodeToken: r.qr_code_token,
      createdAt: r.created_at,
      syncStatus: r.sync_status as any,
      paymentStatusToday,
      overdueRoundsCount,
      lastPaymentDate: paidTodayRow?.last_date || lastTxRow?.last_date || null,
      totalPaidInCycle: balance,
    });
  }

  // Apply Filter
  let filtered = members;
  if (options?.filter && options.filter !== 'ALL') {
    switch (options.filter) {
      case 'PAID_TODAY':
        filtered = filtered.filter((m) => m.paymentStatusToday === 'PAID_TODAY');
        break;
      case 'UNPAID_TODAY':
        filtered = filtered.filter((m) => m.paymentStatusToday === 'UNPAID_TODAY');
        break;
      case 'OVERDUE':
        filtered = filtered.filter((m) => m.paymentStatusToday === 'OVERDUE');
        break;
      case 'UPCOMING_PAYOUT':
        filtered = filtered.filter((m) => !m.hasReceivedPayout && m.payoutRank !== null);
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
  businessId?: string
): Promise<Transaction> {
  const db = await getDatabase();
  const collectorId = await getActiveCollectorId();

  const tx = await createTransaction({
    clientId: memberId,
    businessId: businessId || null,
    amount,
    type: 'SOL_PAYOUT',
    collectorId,
    paymentMethod: 'CASH',
  });

  // Mark member as having received payout
  await db.runAsync(
    `UPDATE clients SET has_received_payout = 1, sync_status = 'PENDING' WHERE id = ?`,
    [memberId]
  );

  return tx;
}
