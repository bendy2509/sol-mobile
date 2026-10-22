import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { BusinessConfig, ClosedCycle, CycleStatus, DashboardMetrics, Member, PaymentFrequency } from '@/types';
import { getActiveBusinessId, getActiveCollectorId, getDatabase, setActiveBusinessId } from './sqlite';
import { calculateDaysRemaining, calculateCycleEndDate } from '@/lib/dateCalculations';
import { recordAuditLog } from '@/services/auditService';
import { calculateCycleTotalHands } from '@/services/financialService';
import { supabase, isCloudSyncActive } from '@/lib/supabase';

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
export interface RenewCycleParams {
  businessId: string;
  collectorId?: string;
  mode: 'RENEW_SAME_MEMBERS' | 'START_FRESH';
  userId: string;
  userRole: 'MANAGER' | 'USER' | 'COLLECTOR';
  name: string;
  contributionAmount: number;
  frequency: PaymentFrequency;
  totalSlots?: number;
  startDate?: string;
  reason?: string;
}

/**
 * Renews or restarts a SOL cycle:
 * Mode 'RENEW_SAME_MEMBERS': Keeps registered children and their subscribed hands, resets financial counters (balances, paid hands, received hands) to 0.
 * Mode 'START_FRESH': Clears the children list to start a brand new SOL from scratch.
 */
export async function renewSolCycle(params: RenewCycleParams): Promise<BusinessConfig> {
  const db = await getDatabase();
  const collectorId = params.collectorId || (await getActiveCollectorId());
  const now = new Date().toISOString();
  const todayStr = params.startDate || now.split('T')[0];
  const unitAmount = Math.max(1, Number(params.contributionAmount) || 250);
  const frequency = params.frequency || 'DAILY';

  // 1. Record an audit log for cycle renewal
  await recordAuditLog({
    userId: params.userId,
    userRole: params.userRole as any,
    action: 'CLOSE_CYCLE',
    entityType: 'BUSINESS',
    entityId: params.businessId,
    reason:
      params.reason ||
      (params.mode === 'RENEW_SAME_MEMBERS'
        ? `Renouvellement Sol (${params.name}) avec les mêmes adhérents`
        : `Nouveau départ Sol (${params.name}) à zéro`),
    newData: JSON.stringify({
      mode: params.mode,
      name: params.name,
      contributionAmount: unitAmount,
      frequency,
      startDate: todayStr,
    }),
  });

  // 2. Archive complete state of the closed cycle for manager history and PDF downloads
  try {
    await saveClosedCycleSnapshot(collectorId, params.businessId, params.reason);
  } catch (archiveErr) {
    console.warn('Notice: Could not archive closed cycle snapshot:', archiveErr);
  }

  if (params.mode === 'RENEW_SAME_MEMBERS') {
    // Purge any clients that were previously deleted so they can never resurface
    await db.runAsync(`DELETE FROM clients WHERE id IN (SELECT id FROM deleted_clients)`);

    // A. Reset financial timeline counters for all remaining active children of this collector
    await db.runAsync(
      `UPDATE clients 
       SET current_balance = 0,
           total_paid_amount = 0,
           paid_hands_count = 0,
           received_hands_count = 0,
           has_received_hand = 0,
           has_received_payout = 0,
           hand_received_date = NULL,
           paid_until_date = ?,
           daily_amount = ?,
           sync_status = 'PENDING'
       WHERE (collector_id = ? OR business_id = ?)
         AND id NOT IN (SELECT id FROM deleted_clients)`,
      [todayStr, unitAmount, collectorId, params.businessId]
    );

    // Calculate dynamic end date based on actual registered hands (excluding deleted)
    const totalHandsRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(COALESCE(hands_count, 1)), 0) as total 
       FROM clients 
       WHERE (collector_id = ? OR business_id = ?) 
         AND id NOT IN (SELECT id FROM deleted_clients)`,
      [collectorId, params.businessId]
    );
    const totalCycleHands = Math.max(1, Number(totalHandsRow?.total || 0), params.totalSlots || 10);
    const endDate = calculateCycleEndDate(todayStr, totalCycleHands, frequency);

    // Update business config with new cycle info
    await db.runAsync(
      `UPDATE business_configs
       SET name = ?,
           contribution_amount = ?,
           frequency = ?,
           total_slots = ?,
           start_date = ?,
           end_date = ?,
           status = 'ACTIVE',
           cycle_status = 'ACTIVE'
       WHERE id = ?`,
      [
        params.name.trim(),
        unitAmount,
        frequency,
        totalCycleHands,
        todayStr,
        endDate,
        params.businessId,
      ]
    );

    return {
      id: params.businessId,
      collectorId,
      name: params.name.trim(),
      type: 'SOL',
      contributionAmount: unitAmount,
      frequency,
      totalSlots: totalCycleHands,
      startDate: todayStr,
      endDate,
      status: 'ACTIVE',
      cycleStatus: 'ACTIVE',
      createdAt: now,
    };
  } else {
    // B. Start completely fresh: Remove existing clients for this collector / business
    // Record all existing clients in deleted_clients tombstone table so syncEngine never re-pulls them!
    const existingClients = await db.getAllAsync<{ id: string; qr_code_token?: string; phone_number?: string }>(
      `SELECT id, qr_code_token, phone_number FROM clients WHERE collector_id = ? OR business_id = ?`,
      [collectorId, params.businessId]
    );

    for (const ec of existingClients) {
      await db.runAsync(
        `INSERT OR REPLACE INTO deleted_clients (id, qr_code_token, phone_number, collector_id, deleted_at, sync_status)
         VALUES (?, ?, ?, ?, ?, 'PENDING')`,
        [ec.id, ec.qr_code_token || null, ec.phone_number || null, collectorId, now]
      );

      if (isCloudSyncActive) {
        try {
          await supabase.from('transactions').delete().eq('client_id', ec.id);
          if (ec.qr_code_token) {
            await supabase.from('clients').delete().or(`id.eq.${ec.id},qr_code_token.eq.${ec.qr_code_token}`);
          } else {
            await supabase.from('clients').delete().eq('id', ec.id);
          }
        } catch (sbErr) {
          console.warn('START_FRESH remote client cleanup notice:', sbErr);
        }
      }
    }

    // Delete transactions and clients locally
    await db.runAsync(
      `DELETE FROM transactions WHERE client_id IN (SELECT id FROM clients WHERE collector_id = ? OR business_id = ?)`,
      [collectorId, params.businessId]
    );
    await db.runAsync(`DELETE FROM clients WHERE collector_id = ? OR business_id = ?`, [collectorId, params.businessId]);

    const totalSlots = Math.max(1, Number(params.totalSlots) || 10);
    const endDate = calculateCycleEndDate(todayStr, totalSlots, frequency);

    await db.runAsync(
      `UPDATE business_configs
       SET name = ?,
           contribution_amount = ?,
           frequency = ?,
           total_slots = ?,
           start_date = ?,
           end_date = ?,
           status = 'ACTIVE',
           cycle_status = 'ACTIVE'
       WHERE id = ?`,
      [
        params.name.trim(),
        unitAmount,
        frequency,
        totalSlots,
        todayStr,
        endDate,
        params.businessId,
      ]
    );

    return {
      id: params.businessId,
      collectorId,
      name: params.name.trim(),
      type: 'SOL',
      contributionAmount: unitAmount,
      frequency,
      totalSlots,
      startDate: todayStr,
      endDate,
      status: 'ACTIVE',
      cycleStatus: 'ACTIVE',
      createdAt: now,
    };
  }
}

/**
 * Closes the active cycle formally with verification and audit trail.
 */
export async function closeCycle(params: {
  businessId: string;
  userId: string;
  userRole: 'MANAGER';
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
    const parsedRanksCount = m.payout_ranks ? String(m.payout_ranks).split(/[,;\s]+/).filter(Boolean).length : 1;
    const memberHandsCount = Math.max(1, Number(m.hands_count || 1), parsedRanksCount);
    const rawReceived = Number(m.received_hands_count || 0);
    const receivedCount = rawReceived > 0
      ? rawReceived
      : (m.has_received_hand || m.has_received_payout)
        ? (memberHandsCount === 1 ? 1 : 0)
        : 0;
    const hasTouched = receivedCount >= memberHandsCount;
    handsTouchedCount += receivedCount;

    handsCollectedTotal += Number(m.paid_hands_count || 0);
  }

  // Count total non-reversed payout transactions for the current cycle to guarantee 100% reconciliation
  const cycleStartIso = business.startDate ? new Date(business.startDate).toISOString() : startOfDayIso;
  const payoutTxRow = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM transactions 
     WHERE collector_id = ? AND type IN ('HAND_PAYOUT', 'SOL_PAYOUT') AND is_reversed = 0 AND created_at_local >= ?`,
    [collectorId, cycleStartIso]
  );
  const totalPayoutTxCount = Number(payoutTxRow?.count || 0);
  const effectiveHandsTouched = Math.max(handsTouchedCount, totalPayoutTxCount);

  // Batch query: All client IDs who paid today (1 fast query instead of looping N queries)
  const todayTxRows = await db.getAllAsync<{ client_id: string }>(
    `SELECT client_id FROM transactions 
     WHERE collector_id = ? 
       AND type IN ('CONTRIBUTION', 'SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION') 
       AND is_reversed = 0 
       AND created_at_local >= ?
     GROUP BY client_id`,
    [collectorId, startOfDayIso]
  );
  const paidTodayClientIds = new Set(todayTxRows.map((t) => t.client_id));

  for (const m of members) {
    const parsedRanksCount = m.payout_ranks ? String(m.payout_ranks).split(/[,;\s]+/).filter(Boolean).length : 1;
    const memberHandsCount = Math.max(1, Number(m.hands_count || 1), parsedRanksCount);
    const rawReceived = Number(m.received_hands_count || 0);
    const receivedCount = rawReceived > 0
      ? rawReceived
      : (m.has_received_hand || m.has_received_payout)
        ? (memberHandsCount === 1 ? 1 : 0)
        : 0;
    const hasTouched = receivedCount >= memberHandsCount;

    // Check if member paid today
    const hasPaidToday = paidTodayClientIds.has(m.id);
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
  // Direct SQL SUM of all active clients for guaranteed accuracy
  const totalHandsRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(COALESCE(hands_count, 1)), 0) as total FROM clients WHERE collector_id = ? AND id NOT IN (SELECT id FROM deleted_clients)`,
    [collectorId]
  );
  const calculatedTotal = calculateCycleTotalHands(members);
  const dbHandsTotal = Number(totalHandsRow?.total || 0);

  // The total number of hands in SOL/SABOTAY is determined by the sum of hands of each enrolled child,
  // NOT predetermined in advance.
  const totalCycleHands = (totalMembersCount > 0 || dbHandsTotal > 0)
    ? Math.max(calculatedTotal, dbHandsTotal)
    : (totalSlots > 0 ? totalSlots : 0);

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

/**
 * Saves a complete snapshot of the closing/renewing cycle into closed_cycles table.
 * Preserves all members, payments, and financial metrics so managers can download PDF reports anytime.
 */
export async function saveClosedCycleSnapshot(
  collectorIdParam?: string,
  businessIdParam?: string,
  reason?: string
): Promise<ClosedCycle | null> {
  const db = await getDatabase();
  const collectorId = collectorIdParam || (await getActiveCollectorId());
  const business = await getActiveBusinessConfig(collectorId);
  if (!business) return null;

  const businessId = businessIdParam || business.id;
  const now = new Date().toISOString();

  // 1. Get collector details
  const collector = await db.getFirstAsync<{ full_name: string; phone_number: string; zone?: string }>(
    `SELECT full_name, phone_number, zone FROM collectors WHERE id = ?`,
    [collectorId]
  );

  // 2. Fetch all clients and metrics for this cycle
  const clientRows = await db.getAllAsync<{
    id: string;
    full_name: string;
    phone_number: string;
    payout_rank: number | null;
    hands_count: number;
    received_hands_count: number;
    has_received_hand: number;
    has_received_payout: number;
    total_paid_amount: number;
    current_balance: number;
    paid_hands_count: number;
  }>(
    `SELECT id, full_name, phone_number, payout_rank, hands_count, received_hands_count, has_received_hand, has_received_payout, total_paid_amount, current_balance, paid_hands_count
     FROM clients 
     WHERE (collector_id = ? OR business_id = ?) 
       AND id NOT IN (SELECT id FROM deleted_clients)
     ORDER BY payout_rank ASC, full_name ASC`,
    [collectorId, businessId]
  );

  const unitAmount = business.contributionAmount || 250;
  let totalCycleHands = 0;
  let totalCashCollected = 0;
  let totalDistributed = 0;
  let handsCollectedTotal = 0;

  const membersSnapshot = clientRows.map((c, index) => {
    const hCount = Math.max(1, Number(c.hands_count || 1));
    const paidAmount = Number(c.total_paid_amount || c.current_balance || 0);
    const hasReceived = (c.received_hands_count || 0) >= hCount || c.has_received_payout === 1 || c.has_received_hand === 1;
    const handsCovered = Number(c.paid_hands_count || Math.floor(paidAmount / (unitAmount || 1)));

    totalCycleHands += hCount;
    totalCashCollected += paidAmount;
    handsCollectedTotal += handsCovered;
    if (hasReceived) {
      totalDistributed += unitAmount * totalCycleHands;
    }

    return {
      rank: c.payout_rank || (index + 1),
      fullName: c.full_name,
      phoneNumber: c.phone_number,
      totalPaid: paidAmount,
      handsCovered,
      coverageStatus: handsCovered >= hCount ? 'À JOUR' : 'RETARD',
      hasReceivedPayout: hasReceived,
    };
  });

  const effectiveHands = totalCycleHands > 0 ? totalCycleHands : (business.totalSlots || 10);
  const totalPotAmount = unitAmount * effectiveHands;
  const netReserveBalance = totalCashCollected - totalDistributed;
  const completionRate = effectiveHands > 0 ? Math.min(100, (handsCollectedTotal / (effectiveHands * effectiveHands)) * 100) : 0;

  // 3. Determine cycle number
  const countRow = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM closed_cycles WHERE collector_id = ?`,
    [collectorId]
  );
  const cycleNumber = Number(countRow?.cnt || 0) + 1;

  // 4. Detailed snapshot for ManagerBusinessReportPdfData
  const pdfDataSnapshot = {
    businessName: business.name,
    collectorName: collector?.full_name || 'Responsable SOL',
    collectorPhone: collector?.phone_number || '',
    collectorZone: collector?.zone,
    unitAmount,
    totalSlots: effectiveHands,
    registeredChildrenCount: clientRows.length,
    totalPotAmount,
    cycleStartDate: business.startDate,
    cycleEndDate: business.endDate,
    cycleNumber,
    handsCollectedTotal,
    totalCashCollected,
    totalDistributed,
    netReserveBalance,
    completionRate,
    members: membersSnapshot,
    generatedAt: now,
    reason: reason || 'Clôture et archivage du cycle SOL',
  };

  const snapshotJson = JSON.stringify(pdfDataSnapshot);
  const id = uuidv4();

  await db.runAsync(
    `INSERT INTO closed_cycles (
      id, collector_id, business_id, business_name, cycle_number,
      start_date, end_date, closed_at, unit_amount, total_slots,
      total_hands, total_pot, total_collected, total_distributed,
      net_reserve, completion_rate, members_count, snapshot_data, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      collectorId,
      businessId,
      business.name,
      cycleNumber,
      business.startDate,
      business.endDate,
      now,
      unitAmount,
      business.totalSlots,
      effectiveHands,
      totalPotAmount,
      totalCashCollected,
      totalDistributed,
      netReserveBalance,
      completionRate,
      clientRows.length,
      snapshotJson,
      now,
    ]
  );

  return {
    id,
    collectorId,
    businessId,
    businessName: business.name,
    cycleNumber,
    startDate: business.startDate,
    endDate: business.endDate,
    closedAt: now,
    unitAmount,
    totalSlots: business.totalSlots,
    totalHands: effectiveHands,
    totalPot: totalPotAmount,
    totalCollected: totalCashCollected,
    totalDistributed,
    netReserve: netReserveBalance,
    completionRate,
    membersCount: clientRows.length,
    snapshotData: snapshotJson,
    createdAt: now,
  };
}

/**
 * Retrieves all closed cycles for a collector.
 */
/**
 * Returns the ISO instant at which the collector's current cycle started.
 * Transactions recorded before it belong to a closed cycle.
 * Uses the most recent closed_cycles archive (exact renewal moment), falling back to
 * the active business start date for collectors that never archived a cycle.
 */
export async function getCurrentCycleBoundary(collectorIdParam?: string): Promise<string | null> {
  const collectorId = collectorIdParam || (await getActiveCollectorId());

  try {
    const closed = await getClosedCycles(collectorId);
    const lastClosedAt = closed.reduce<string | null>(
      (latest, c) => (c.closedAt && (!latest || c.closedAt > latest) ? c.closedAt : latest),
      null
    );
    if (lastClosedAt) return lastClosedAt;
  } catch (err) {
    console.warn('Notice: Could not read closed cycles for boundary:', err);
  }

  const business = await getActiveBusinessConfig(collectorId);
  return business?.startDate ? new Date(business.startDate).toISOString() : null;
}

export async function getClosedCycles(collectorIdParam?: string): Promise<ClosedCycle[]> {
  const db = await getDatabase();
  const collectorId = collectorIdParam || (await getActiveCollectorId());

  const rows = await db.getAllAsync<{
    id: string;
    collector_id: string;
    business_id: string;
    business_name: string;
    cycle_number: number;
    start_date: string;
    end_date: string;
    closed_at: string;
    unit_amount: number;
    total_slots: number;
    total_hands: number;
    total_pot: number;
    total_collected: number;
    total_distributed: number;
    net_reserve: number;
    completion_rate: number;
    members_count: number;
    snapshot_data: string;
    created_at: string;
  }>(
    `SELECT * FROM closed_cycles WHERE collector_id = ? ORDER BY cycle_number DESC, closed_at DESC`,
    [collectorId]
  );

  return rows.map((r) => ({
    id: r.id,
    collectorId: r.collector_id,
    businessId: r.business_id,
    businessName: r.business_name,
    cycleNumber: Number(r.cycle_number),
    startDate: r.start_date,
    endDate: r.end_date,
    closedAt: r.closed_at,
    unitAmount: Number(r.unit_amount),
    totalSlots: Number(r.total_slots),
    totalHands: Number(r.total_hands),
    totalPot: Number(r.total_pot),
    totalCollected: Number(r.total_collected),
    totalDistributed: Number(r.total_distributed),
    netReserve: Number(r.net_reserve || 0),
    completionRate: Number(r.completion_rate || 0),
    membersCount: Number(r.members_count || 0),
    snapshotData: r.snapshot_data,
    createdAt: r.created_at,
  }));
}
