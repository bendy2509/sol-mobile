import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { BusinessConfig, DashboardMetrics, Member, PaymentFrequency } from '@/types';
import { getActiveBusinessId, getActiveCollectorId, getDatabase, setActiveBusinessId } from './sqlite';
import { calculateDaysRemaining } from '@/lib/dateCalculations';

export async function getActiveBusinessConfig(): Promise<BusinessConfig | null> {
  const db = await getDatabase();
  const activeId = await getActiveBusinessId();

  let row = null;
  if (activeId) {
    row = await db.getFirstAsync<{
      id: string;
      collector_id: string;
      name: string;
      type: 'SABOTAY' | 'SOL';
      contribution_amount: number;
      frequency: PaymentFrequency;
      total_slots: number;
      start_date: string;
      end_date: string;
      status: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
      created_at: string;
    }>(`SELECT * FROM business_configs WHERE id = ?`, [activeId]);
  }

  // Fallback to first active business config if activeId was not found
  if (!row) {
    row = await db.getFirstAsync<{
      id: string;
      collector_id: string;
      name: string;
      type: 'SABOTAY' | 'SOL';
      contribution_amount: number;
      frequency: PaymentFrequency;
      total_slots: number;
      start_date: string;
      end_date: string;
      status: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
      created_at: string;
    }>(`SELECT * FROM business_configs ORDER BY created_at DESC LIMIT 1`);

    if (row) {
      await setActiveBusinessId(row.id);
    }
  }

  if (!row) return null;

  return {
    id: row.id,
    collectorId: row.collector_id,
    name: row.name,
    type: row.type,
    contributionAmount: Number(row.contribution_amount),
    frequency: row.frequency,
    totalSlots: Number(row.total_slots),
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function saveBusinessConfig(
  data: Omit<BusinessConfig, 'id' | 'createdAt'> & { id?: string }
): Promise<BusinessConfig> {
  const db = await getDatabase();
  const collectorId = data.collectorId || (await getActiveCollectorId());
  const id = data.id || uuidv4();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT OR REPLACE INTO business_configs (id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      collectorId,
      data.name.trim(),
      data.type,
      data.contributionAmount,
      data.frequency,
      data.totalSlots,
      data.startDate,
      data.endDate,
      data.status || 'ACTIVE',
      now,
    ]
  );

  await setActiveBusinessId(id);

  return {
    id,
    collectorId,
    name: data.name.trim(),
    type: data.type,
    contributionAmount: data.contributionAmount,
    frequency: data.frequency,
    totalSlots: data.totalSlots,
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status || 'ACTIVE',
    createdAt: now,
  };
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const db = await getDatabase();
  const business = await getActiveBusinessConfig();
  const collectorId = await getActiveCollectorId();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayIso = startOfDay.toISOString();

  if (!business) {
    return {
      handsCollected: 0,
      handsRemaining: 0,
      totalHandsExpected: 0,
      daysRemaining: 0,
      totalCashToday: 0,
      overdueMembersCount: 0,
      overdueHandsCount: 0,
      paidTodayCount: 0,
      unpaidTodayCount: 0,
      totalMembersCount: 0,
      currentRound: 1,
      totalRounds: 1,
      businessName: 'Aucune activité active',
      businessType: 'SABOTAY',
      contributionAmount: 0,
      frequency: 'DAILY',
      startDate: startOfDayIso.split('T')[0],
      endDate: startOfDayIso.split('T')[0],
    };
  }

  // 1. Total hands / contributions collected in this business
  const handsCollectedRow = await db.getFirstAsync<{ count: number; total: number }>(
    `SELECT count(*) as count, COALESCE(SUM(amount), 0) as total FROM transactions 
     WHERE (business_id = ? OR collector_id = ?) AND type IN ('SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION')`,
    [business.id, collectorId]
  );
  const handsCollected = handsCollectedRow?.count || 0;
  const totalHandsExpected = business.totalSlots;
  const handsRemaining = Math.max(0, totalHandsExpected - handsCollected);

  // 2. Days remaining until cycle end date
  const daysRemaining = calculateDaysRemaining(business.endDate);

  // 3. Cash collected today in drawer
  const cashTodayRow = await db.getFirstAsync<{ total_in: number; total_out: number }>(
    `SELECT 
       COALESCE(SUM(CASE WHEN type IN ('SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION') THEN amount ELSE 0 END), 0) as total_in,
       COALESCE(SUM(CASE WHEN type IN ('WITHDRAWAL', 'SOL_PAYOUT') THEN amount ELSE 0 END), 0) as total_out
     FROM transactions 
     WHERE collector_id = ? AND created_at_local >= ?`,
    [collectorId, startOfDayIso]
  );
  const totalCashToday = Math.max(0, (cashTodayRow?.total_in || 0) - (cashTodayRow?.total_out || 0));

  // 4. Members list & today's payment status
  const members = await db.getAllAsync<{
    id: string;
    full_name: string;
    phone_number: string;
    current_balance: number;
    payout_rank: number | null;
    has_received_payout: number;
  }>(
    `SELECT id, full_name, phone_number, current_balance, payout_rank, has_received_payout 
     FROM clients 
     WHERE collector_id = ?
     ORDER BY payout_rank ASC, full_name ASC`,
    [collectorId]
  );

  let paidTodayCount = 0;
  let overdueMembersCount = 0;
  let overdueHandsCount = 0;
  let currentPayoutBeneficiary: Member | null = null;

  for (const m of members) {
    // Check if member paid today
    const paidTodayRow = await db.getFirstAsync<{ count: number }>(
      `SELECT count(*) as count FROM transactions 
       WHERE client_id = ? AND type IN ('SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION') AND created_at_local >= ?`,
      [m.id, startOfDayIso]
    );
    const hasPaidToday = (paidTodayRow?.count || 0) > 0;

    if (hasPaidToday) {
      paidTodayCount++;
    } else {
      // If current balance is 0 or less than expected contribution, consider late/overdue
      if (m.current_balance < business.contributionAmount) {
        overdueMembersCount++;
        const missingRounds = Math.max(
          1,
          Math.ceil((business.contributionAmount - m.current_balance) / (business.contributionAmount || 1))
        );
        overdueHandsCount += missingRounds;
      }
    }

    // Determine current payout beneficiary (first member in rank who hasn't received payout)
    if (!currentPayoutBeneficiary && !m.has_received_payout && m.payout_rank) {
      currentPayoutBeneficiary = {
        id: m.id,
        businessId: business.id,
        collectorId,
        fullName: m.full_name,
        phoneNumber: m.phone_number,
        type: business.type,
        dailyAmount: business.contributionAmount,
        currentBalance: Number(m.current_balance),
        payoutRank: m.payout_rank,
        hasReceivedPayout: false,
        qrCodeToken: '',
        createdAt: '',
        syncStatus: 'SYNCED',
        paymentStatusToday: hasPaidToday ? 'PAID_TODAY' : 'UNPAID_TODAY',
        overdueRoundsCount: 0,
        totalPaidInCycle: Number(m.current_balance),
      };
    }
  }

  const totalMembersCount = members.length;
  const unpaidTodayCount = Math.max(0, totalMembersCount - paidTodayCount);
  const currentRound = Math.min(
    business.totalSlots,
    Math.max(1, members.filter((m) => m.has_received_payout).length + 1)
  );

  return {
    handsCollected,
    handsRemaining,
    totalHandsExpected,
    daysRemaining,
    totalCashToday,
    overdueMembersCount,
    overdueHandsCount,
    paidTodayCount,
    unpaidTodayCount,
    totalMembersCount,
    currentPayoutBeneficiary,
    currentRound,
    totalRounds: business.totalSlots,
    businessName: business.name,
    businessType: business.type,
    contributionAmount: business.contributionAmount,
    frequency: business.frequency,
    startDate: business.startDate,
    endDate: business.endDate,
  };
}
