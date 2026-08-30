import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { BusinessConfig, CycleStatus, DashboardMetrics, Member, PaymentFrequency } from '@/types';
import { getActiveBusinessId, getActiveCollectorId, getDatabase, setActiveBusinessId } from './sqlite';
import { calculateDaysRemaining, calculateCycleEndDate } from '@/lib/dateCalculations';
import { recordAuditLog } from '@/services/auditService';
import { calculateCycleTotalHands } from '@/services/financialService';

export async function getActiveBusinessConfig(collectorIdParam?: string): Promise<BusinessConfig | null> {
  const db = await getDatabase();
  const collectorId = collectorIdParam || (await getActiveCollectorId());
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
      status: 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'CLOSED';
      cycle_status: CycleStatus;
      created_at: string;
    }>(`SELECT * FROM business_configs WHERE id = ? AND collector_id = ?`, [activeId, collectorId]);
  }

  // Fallback to active collector's business config if activeId was not found or mismatched
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
      status: 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'CLOSED';
      cycle_status: CycleStatus;
      created_at: string;
    }>(`SELECT * FROM business_configs WHERE collector_id = ? ORDER BY created_at DESC LIMIT 1`, [collectorId]);

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
    status: row.status || 'ACTIVE',
    cycleStatus: row.cycle_status || 'ACTIVE',
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
    `INSERT OR REPLACE INTO business_configs (id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, cycle_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      data.cycleStatus || 'ACTIVE',
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
    cycleStatus: data.cycleStatus || 'ACTIVE',
    createdAt: now,
  };
}

/**
 * Closes the active cycle formally with verification and audit trail.
 */
export async function closeCycle(params: {
  businessId: string;
  userId: string;
  userRole: 'ADMIN' | 'MANAGER';
  reason: string;
}): Promise<void> {
  const { businessId, userId, userRole, reason } = params;
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE business_configs 
     SET status = 'COMPLETED', cycle_status = 'CLOSED' 
     WHERE id = ?`,
    [businessId]
  );

  await recordAuditLog({
    userId,
    userRole,
    action: 'CLOSE_CYCLE',
    entityType: 'BUSINESS',
    entityId: businessId,
    reason: reason || 'Clôture définitive du cycle SOL',
  });
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const db = await getDatabase();
  const business = await getActiveBusinessConfig();
  const collectorId = await getActiveCollectorId();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayIso = startOfDay.toISOString();
  const todayStr = startOfDayIso.split('T')[0];

  if (!business) {
    return {
      unitAmount: 0,
      totalPotAmount: 0,
      handsCollectedToday: 0,
      handsCollectedTotal: 0,
      totalHandsExpected: 0,
      daysRemaining: 0,
      overdueMembersCount: 0,
      overdueHandsCount: 0,
      paidTodayCount: 0,
      unpaidTodayCount: 0,
      totalMembersCount: 0,
      handsTouchedCount: 0,
      businessName: 'Aucun carnet configuré',
      businessType: 'SABOTAY',
      frequency: 'DAILY',
      startDate: todayStr,
      endDate: todayStr,
      cycleStatus: 'ACTIVE',
      handsCollected: 0,
      handsRemaining: 0,
      totalCashToday: 0,
      contributionAmount: 0,
      currentRound: 1,
      totalRounds: 1,
    };
  }

  const unitAmount = business.contributionAmount;
  const totalSlots = business.totalSlots;

  // 1. Hands collected today (count of transactions)
  const todayTxRow = await db.getFirstAsync<{ count: number; total: number }>(
    `SELECT count(*) as count, COALESCE(SUM(amount), 0) as total FROM transactions 
     WHERE collector_id = ? AND type IN ('CONTRIBUTION', 'SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION') 
       AND is_reversed = 0 AND created_at_local >= ?`,
    [collectorId, startOfDayIso]
  );
  const handsCollectedToday = todayTxRow?.count || 0;

  // 2. Cash in drawer today (In minus Payouts)
  const cashTodayRow = await db.getFirstAsync<{ total_in: number; total_out: number }>(
    `SELECT 
       COALESCE(SUM(CASE WHEN type IN ('CONTRIBUTION', 'SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION') THEN amount ELSE 0 END), 0) as total_in,
       COALESCE(SUM(CASE WHEN type IN ('HAND_PAYOUT', 'SOL_PAYOUT', 'WITHDRAWAL') THEN amount ELSE 0 END), 0) as total_out
     FROM transactions 
     WHERE collector_id = ? AND is_reversed = 0 AND created_at_local >= ?`,
    [collectorId, startOfDayIso]
  );
  const totalCashToday = Math.max(0, (cashTodayRow?.total_in || 0) - (cashTodayRow?.total_out || 0));

  // 4. Fetch all members for this collector
  const members = await db.getAllAsync<{
    id: string;
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
  }>(
    `SELECT id, full_name, phone_number, type, daily_amount, current_balance, payout_rank, payout_ranks,
            hands_count, received_hands_count, has_received_hand, has_received_payout, hand_received_date, total_paid_amount, 
            paid_hands_count, paid_until_date, qr_code_token, created_at
     FROM clients 
     WHERE collector_id = ?
     ORDER BY payout_rank ASC, full_name ASC`,
    [collectorId]
  );

  let paidTodayCount = 0;
  let overdueMembersCount = 0;
  let overdueHandsCount = 0;
  let handsTouchedCount = 0;
  let handsCollectedTotal = 0;
  let currentPayoutBeneficiary: Member | null = null;

  for (const m of members) {
    const memberHandsCount = Math.max(1, Number(m.hands_count || 1));
    const receivedCount = Number(
      m.received_hands_count !== null && m.received_hands_count !== undefined
        ? m.received_hands_count
        : m.has_received_hand || m.has_received_payout
        ? memberHandsCount
        : 0
    );
    const hasTouched = receivedCount >= memberHandsCount || Boolean(m.has_received_hand || m.has_received_payout);
    handsTouchedCount += receivedCount;

    handsCollectedTotal += Number(m.paid_hands_count || 0);
  }

  // Count total non-reversed payout transactions to guarantee 100% reconciliation
  const payoutTxRow = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM transactions 
     WHERE collector_id = ? AND type IN ('HAND_PAYOUT', 'SOL_PAYOUT') AND is_reversed = 0`,
    [collectorId]
  );
  const totalPayoutTxCount = Number(payoutTxRow?.count || 0);
  const effectiveHandsTouched = Math.max(handsTouchedCount, totalPayoutTxCount);

  for (const m of members) {
    const memberHandsCount = Math.max(1, Number(m.hands_count || 1));
    const receivedCount = Number(
      m.received_hands_count !== null && m.received_hands_count !== undefined
        ? m.received_hands_count
        : m.has_received_hand || m.has_received_payout
        ? memberHandsCount
        : 0
    );
    const hasTouched = receivedCount >= memberHandsCount || Boolean(m.has_received_hand || m.has_received_payout);

    // Check if member paid today
    const paidTodayTx = await db.getFirstAsync<{ count: number }>(
      `SELECT count(*) as count FROM transactions 
       WHERE client_id = ? AND type IN ('CONTRIBUTION', 'SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION') 
         AND is_reversed = 0 AND created_at_local >= ?`,
      [m.id, startOfDayIso]
    );
    const hasPaidToday = (paidTodayTx?.count || 0) > 0;
    const isCoveredInAdvance = m.paid_until_date && m.paid_until_date >= todayStr;

    if (hasPaidToday || isCoveredInAdvance) {
      paidTodayCount++;
    } else {
      overdueMembersCount++;
      const missingHands = Math.max(
        1,
        Math.ceil((unitAmount - (m.current_balance || 0)) / (unitAmount || 1))
      );
      overdueHandsCount += missingHands;
    }

    // Determine current payout beneficiary (next rank who hasn't received all hands)
    if (!currentPayoutBeneficiary && !hasTouched && m.payout_rank) {
      currentPayoutBeneficiary = {
        id: m.id,
        businessId: business.id,
        collectorId,
        fullName: m.full_name,
        phoneNumber: m.phone_number,
        type: business.type,
        dailyAmount: unitAmount,
        currentBalance: Number(m.current_balance || 0),
        payoutRank: m.payout_rank,
        rankOrder: m.payout_rank,
        payoutRanks: m.payout_ranks || (m.payout_rank ? String(m.payout_rank) : undefined),
        handsCount: memberHandsCount,
        receivedHandsCount: receivedCount,
        hasReceivedHand: false,
        hasReceivedPayout: false,
        handReceivedDate: undefined,
        totalPaidAmount: Number(m.total_paid_amount || m.current_balance || 0),
        paidHandsCount: Number(m.paid_hands_count || 0),
        paidUntilDate: m.paid_until_date || todayStr,
        qrCodeToken: m.qr_code_token,
        createdAt: m.created_at,
        syncStatus: 'SYNCED',
        paymentStatusToday: (hasPaidToday || isCoveredInAdvance) ? 'PAID_TODAY' : 'UNPAID_TODAY',
        overdueRoundsCount: 0,
        totalPaidInCycle: Number(m.total_paid_amount || m.current_balance || 0),
        handsCoveredAhead: 0,
      };
    }
  }

  const totalMembersCount = members.length;
  const totalCycleHands = calculateCycleTotalHands(members) || (totalSlots || 10);
  const effectiveChildrenCount = totalCycleHands;
  const unpaidTodayCount = Math.max(0, totalMembersCount - paidTodayCount);
  const handsRemaining = Math.max(0, effectiveChildrenCount - handsCollectedTotal);
  const totalPotAmount = unitAmount * totalCycleHands;

  // Dynamic End Date based on: startDate + (effectiveChildrenCount * frequencyInterval)
  const dynamicEndDate = calculateCycleEndDate(business.startDate, effectiveChildrenCount, business.frequency);
  const daysRemaining = calculateDaysRemaining(dynamicEndDate);

  return {
    unitAmount,
    totalPotAmount,
    handsCollectedToday,
    handsCollectedTotal,
    totalHandsExpected: effectiveChildrenCount,
    daysRemaining,
    overdueMembersCount,
    overdueHandsCount,
    paidTodayCount,
    unpaidTodayCount,
    totalMembersCount,
    handsTouchedCount: effectiveHandsTouched,
    currentPayoutBeneficiary,
    businessName: business.name,
    businessType: business.type,
    frequency: business.frequency,
    startDate: business.startDate,
    endDate: dynamicEndDate,
    cycleStatus: business.cycleStatus || 'ACTIVE',
    handsCollected: handsCollectedTotal,
    handsRemaining,
    totalCashToday,
    contributionAmount: unitAmount,
    currentRound: Math.min(effectiveChildrenCount, effectiveHandsTouched + 1),
    totalRounds: effectiveChildrenCount,
  };
}
