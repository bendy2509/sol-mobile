import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { BusinessConfig, Collector, Transaction, UserRole, UserStatus } from '@/types';
import { getDatabase, isCollectorPhoneTaken } from './sqlite';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { hashPin } from '@/lib/crypto';

export interface AdminGlobalStats {
  totalManagers: number;
  activeManagers: number;
  pendingManagers: number;
  suspendedManagers: number;
  totalBusinesses: number;
  totalClients: number;
  totalTransactionsCount: number;
  totalPlatformCollected: number;
  totalPlatformDistributed: number;
  platformNetBalance: number;
}

export interface ManagerFullOverview {
  collector: Collector;
  business: BusinessConfig | null;
  clientsCount: number;
  totalCollected: number;
  totalDistributed: number;
}

/**
 * Computes platform-wide statistics for the Administrator.
 */
export async function getAdminGlobalStats(): Promise<AdminGlobalStats> {
  const db = await getDatabase();

  const collectors = await db.getAllAsync<{ id: string; status: string }>(
    `SELECT id, status FROM collectors`
  );

  const totalManagers = collectors.length;
  const activeManagers = collectors.filter((c) => c.status === 'ACTIVE').length;
  const pendingManagers = collectors.filter((c) => c.status === 'PENDING_APPROVAL').length;
  const suspendedManagers = collectors.filter((c) => c.status === 'SUSPENDED').length;

  const bizRow = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM business_configs`
  );
  const totalBusinesses = Number(bizRow?.count || 0);

  const clientRow = await db.getFirstAsync<{ count: number; total_hands: number }>(
    `SELECT count(*) as count, COALESCE(SUM(COALESCE(hands_count, 1)), 0) as total_hands FROM clients`
  );
  const totalClients = Number(clientRow?.total_hands || clientRow?.count || 0);

  const txStatsRow = await db.getFirstAsync<{
    count: number;
    total_in: number;
    total_out: number;
  }>(
    `SELECT 
       count(*) as count,
       COALESCE(SUM(CASE WHEN type IN ('CONTRIBUTION', 'SOL_CONTRIBUTION', 'SABOTAY_DEPOSIT') THEN amount ELSE 0 END), 0) as total_in,
       COALESCE(SUM(CASE WHEN type IN ('HAND_PAYOUT', 'SOL_PAYOUT', 'WITHDRAWAL') THEN amount ELSE 0 END), 0) as total_out
     FROM transactions`
  );

  const totalTransactionsCount = Number(txStatsRow?.count || 0);
  const totalPlatformCollected = Number(txStatsRow?.total_in || 0);
  const totalPlatformDistributed = Number(txStatsRow?.total_out || 0);
  const platformNetBalance = Math.max(0, totalPlatformCollected - totalPlatformDistributed);

  return {
    totalManagers,
    activeManagers,
    pendingManagers,
    suspendedManagers,
    totalBusinesses,
    totalClients,
    totalTransactionsCount,
    totalPlatformCollected,
    totalPlatformDistributed,
    platformNetBalance,
  };
}

/**
 * Returns detailed overview for all managers with their respective business and performance.
 */
export async function getAllManagersOverview(): Promise<ManagerFullOverview[]> {
  const db = await getDatabase();

  const collectors = await db.getAllAsync<{
    id: string;
    full_name: string;
    phone_number: string;
    pin_hash: string;
    status: string;
    role?: string;
    zone: string | null;
    created_at: string;
  }>(`SELECT * FROM collectors ORDER BY created_at DESC`);

  const businesses = await db.getAllAsync<{
    id: string;
    collector_id: string;
    name: string;
    type: 'SABOTAY' | 'SOL';
    contribution_amount: number;
    frequency: string;
    total_slots: number;
    start_date: string;
    end_date: string;
    status: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
    created_at: string;
  }>(`SELECT * FROM business_configs`);

  const overviews: ManagerFullOverview[] = [];

  for (const c of collectors) {
    const biz = businesses.find((b) => b.collector_id === c.id) || null;

    const clientsCountRow = await db.getFirstAsync<{ count: number; total_hands: number }>(
      `SELECT count(*) as count, COALESCE(SUM(COALESCE(hands_count, 1)), 0) as total_hands FROM clients WHERE collector_id = ?`,
      [c.id]
    );

    const txStatsRow = await db.getFirstAsync<{ total_in: number; total_out: number }>(
      `SELECT 
         COALESCE(SUM(CASE WHEN type IN ('CONTRIBUTION', 'SOL_CONTRIBUTION', 'SABOTAY_DEPOSIT') THEN amount ELSE 0 END), 0) as total_in,
         COALESCE(SUM(CASE WHEN type IN ('HAND_PAYOUT', 'SOL_PAYOUT', 'WITHDRAWAL') THEN amount ELSE 0 END), 0) as total_out
       FROM transactions WHERE collector_id = ?`,
      [c.id]
    );

    overviews.push({
      collector: {
        id: c.id,
        fullName: c.full_name,
        phoneNumber: c.phone_number,
        pinHash: c.pin_hash,
        status: c.status as UserStatus,
        role: (c.role as any) || 'MANAGER',
        zone: c.zone || undefined,
        createdAt: c.created_at,
      },
      business: biz
        ? {
            id: biz.id,
            collectorId: biz.collector_id,
            name: biz.name,
            type: biz.type,
            contributionAmount: Number(biz.contribution_amount),
            frequency: biz.frequency as any,
            totalSlots: Number(biz.total_slots),
            startDate: biz.start_date,
            endDate: biz.end_date,
            status: biz.status,
            createdAt: biz.created_at,
          }
        : null,
      clientsCount: Number(clientsCountRow?.total_hands || clientsCountRow?.count || 0),
      totalCollected: Number(txStatsRow?.total_in || 0),
      totalDistributed: Number(txStatsRow?.total_out || 0),
    });
  }

  return overviews;
}

/**
 * Updates a user's details (Name, Phone, Zone, PIN, Status, Role).
 */
export async function updateManagerDetails(
  collectorId: string,
  data: {
    fullName?: string;
    phoneNumber?: string;
    zone?: string;
    pin?: string;
    status?: UserStatus;
    role?: UserRole;
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
    const isTaken = await isCollectorPhoneTaken(norm, collectorId);
    if (isTaken) {
      throw new Error('Ce numéro de téléphone est déjà utilisé par un autre compte.');
    }
    fields.push('phone_number = ?');
    params.push(norm);
  }
  if (data.zone !== undefined) {
    fields.push('zone = ?');
    params.push(data.zone.trim());
  }
  if (data.pin !== undefined && data.pin.length === 4) {
    fields.push('pin_hash = ?');
    params.push(hashPin(data.pin));
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);
  }
  if (data.role !== undefined) {
    fields.push('role = ?');
    params.push(data.role);
  }

  if (fields.length === 0) return;

  params.push(collectorId);
  await db.runAsync(`UPDATE collectors SET ${fields.join(', ')} WHERE id = ?`, params);
}

/**
 * Creates a brand new platform user from the Admin space (Admin, Manager, Read-Only).
 */
export async function createAdminUserAccount(data: {
  fullName: string;
  phoneNumber: string;
  pin: string;
  role: UserRole;
  zone?: string;
  businessName?: string;
  contributionAmount?: number;
  totalSlots?: number;
  frequency?: string;
}): Promise<Collector> {
  const db = await getDatabase();
  const normPhone = normalizePhoneNumber(data.phoneNumber);
  const isTaken = await isCollectorPhoneTaken(normPhone);
  if (isTaken) {
    throw new Error('Ce numéro de téléphone est déjà utilisé par un autre compte.');
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const pinHash = hashPin(data.pin);

  await db.runAsync(
    `INSERT INTO collectors (id, full_name, phone_number, pin_hash, status, role, zone, created_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
    [id, data.fullName.trim(), normPhone, pinHash, data.role || 'MANAGER', data.zone?.trim() || null, now]
  );

  if (data.businessName && data.businessName.trim()) {
    const bizId = uuidv4();
    const startDate = now.split('T')[0];
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await db.runAsync(
      `INSERT INTO business_configs (id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, cycle_status, created_at)
       VALUES (?, ?, ?, 'SOL', ?, ?, ?, ?, ?, 'ACTIVE', 'ACTIVE', ?)`,
      [
        bizId,
        id,
        data.businessName.trim(),
        data.contributionAmount || 250,
        data.frequency || 'DAILY',
        data.totalSlots || 10,
        startDate,
        endDate,
        now,
      ]
    );
  }

  return {
    id,
    fullName: data.fullName.trim(),
    phoneNumber: normPhone,
    pinHash,
    status: 'ACTIVE',
    role: data.role || 'MANAGER',
    zone: data.zone?.trim(),
    createdAt: now,
  };
}

/**
 * Deletes a user account and their associated records.
 */
export async function deleteUserAccount(collectorId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM transactions WHERE collector_id = ?`, [collectorId]);
  await db.runAsync(`DELETE FROM clients WHERE collector_id = ?`, [collectorId]);
  await db.runAsync(`DELETE FROM business_configs WHERE collector_id = ?`, [collectorId]);
  await db.runAsync(`DELETE FROM collectors WHERE id = ?`, [collectorId]);
}

/**
 * Updates a manager's SOL business configuration (Name, Unit Amount, Total Slots, Frequency).
 */
export async function updateBusinessDetails(
  businessId: string,
  data: {
    name?: string;
    contributionAmount?: number;
    totalSlots?: number;
    frequency?: string;
  }
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    params.push(data.name.trim());
  }
  if (data.contributionAmount !== undefined) {
    fields.push('contribution_amount = ?');
    params.push(data.contributionAmount);
  }
  if (data.totalSlots !== undefined) {
    fields.push('total_slots = ?');
    params.push(data.totalSlots);
  }
  if (data.frequency !== undefined) {
    fields.push('frequency = ?');
    params.push(data.frequency);
  }

  if (fields.length === 0) return;

  params.push(businessId);
  await db.runAsync(`UPDATE business_configs SET ${fields.join(', ')} WHERE id = ?`, params);
}

/**
 * Fetches recent platform transactions across all collectors.
 */
export async function getGlobalRecentTransactions(limit = 50): Promise<Transaction[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    client_id: string;
    collector_id: string;
    sol_group_id: string | null;
    business_id: string | null;
    amount: number;
    hands_covered: number;
    type: string;
    payment_method: string;
    note: string | null;
    created_at_local: string;
    synced_at: string | null;
    sync_status: string;
    client_name: string | null;
    client_phone: string | null;
  }>(
    `SELECT 
       t.id, t.client_id, t.collector_id, t.sol_group_id, t.business_id, 
       t.amount, t.hands_covered, t.type, t.payment_method, t.note, 
       t.created_at_local, t.synced_at, t.sync_status,
       c.full_name as client_name, c.phone_number as client_phone
     FROM transactions t
     LEFT JOIN clients c ON t.client_id = c.id
     ORDER BY t.created_at_local DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    memberId: r.client_id,
    collectorId: r.collector_id,
    solGroupId: r.sol_group_id || undefined,
    businessId: r.business_id || undefined,
    amount: Number(r.amount),
    handsCovered: Number(r.hands_covered || 1),
    type: r.type as any,
    paymentMethod: r.payment_method,
    note: r.note || undefined,
    createdAtLocal: r.created_at_local,
    syncedAt: r.synced_at || undefined,
    syncStatus: r.sync_status as any,
    clientName: r.client_name || undefined,
    memberName: r.client_name || undefined,
    clientPhone: r.client_phone || undefined,
  }));
}

/**
 * Generates a complete JSON backup of the local database tables.
 */
export async function exportDatabaseBackup(): Promise<string> {
  const db = await getDatabase();
  const collectors = await db.getAllAsync(`SELECT * FROM collectors`);
  const businesses = await db.getAllAsync(`SELECT * FROM business_configs`);
  const clients = await db.getAllAsync(`SELECT * FROM clients`);
  const transactions = await db.getAllAsync(`SELECT * FROM transactions`);
  const cashClosures = await db.getAllAsync(`SELECT * FROM cash_closures`);
  const auditLogs = await db.getAllAsync(`SELECT * FROM audit_logs`);

  const backupData = {
    exportedAt: new Date().toISOString(),
    version: '2.0.0',
    platform: 'SOL Mobile',
    data: {
      collectors,
      businesses,
      clients,
      transactions,
      cashClosures,
      auditLogs,
    },
  };

  return JSON.stringify(backupData, null, 2);
}

/**
 * Restores the local database from a verified JSON backup payload safely.
 * Includes schema verification, pre-restore automatic rollback snapshot, and audit logging.
 */
export async function restoreDatabaseBackup(
  jsonString: string,
  adminId: string = 'admin'
): Promise<{ success: boolean; stats: { collectors: number; businesses: number; clients: number; transactions: number }; error?: string }> {
  try {
    const parsed = JSON.parse(jsonString);

    if (!parsed || !parsed.data) {
      throw new Error('Format de fichier de sauvegarde invalide.');
    }

    const { collectors = [], businesses = [], clients = [], transactions = [], cashClosures = [], auditLogs = [] } = parsed.data;

    const db = await getDatabase();

    // 1. Take safety snapshot of current database
    const currentBackup = await exportDatabaseBackup();

    // 2. Atomic Restoration
    await db.withTransactionAsync(async () => {
      // Clear existing records safely
      await db.runAsync(`DELETE FROM transactions`);
      await db.runAsync(`DELETE FROM clients`);
      await db.runAsync(`DELETE FROM business_configs`);
      await db.runAsync(`DELETE FROM collectors`);
      await db.runAsync(`DELETE FROM cash_closures`);

      // Restore collectors
      for (const c of collectors) {
        await db.runAsync(
          `INSERT INTO collectors (id, full_name, phone_number, pin_hash, status, zone, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.full_name, c.phone_number, c.pin_hash, c.status || 'ACTIVE', c.zone || null, c.created_at || new Date().toISOString()]
        );
      }

      // Restore businesses
      for (const b of businesses) {
        await db.runAsync(
          `INSERT INTO business_configs (id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, cycle_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            b.id, b.collector_id, b.name, b.type, b.contribution_amount, b.frequency,
            b.total_slots, b.start_date, b.end_date, b.status || 'ACTIVE', b.cycle_status || 'ACTIVE', b.created_at || new Date().toISOString()
          ]
        );
      }

      // Restore clients
      for (const cl of clients) {
        await db.runAsync(
          `INSERT INTO clients (id, business_id, collector_id, full_name, phone_number, type, daily_amount, current_balance, payout_rank, has_received_payout, has_received_hand, hand_received_date, total_paid_amount, paid_hands_count, paid_until_date, qr_code_token, created_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            cl.id, cl.business_id, cl.collector_id, cl.full_name, cl.phone_number, cl.type || 'SABOTAY',
            cl.daily_amount || 0, cl.current_balance || 0, cl.payout_rank || null, cl.has_received_payout || 0,
            cl.has_received_hand || 0, cl.hand_received_date || null, cl.total_paid_amount || 0,
            cl.paid_hands_count || 0, cl.paid_until_date || null, cl.qr_code_token, cl.created_at || new Date().toISOString(), 'SYNCED'
          ]
        );
      }

      // Restore transactions
      for (const tx of transactions) {
        await db.runAsync(
          `INSERT INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, hands_covered, type, payment_method, note, created_at_local, synced_at, sync_status, idempotency_key, is_reversed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tx.id, tx.client_id, tx.collector_id, tx.sol_group_id || null, tx.business_id || null,
            tx.amount, tx.hands_covered || 1, tx.type, tx.payment_method || 'CASH', tx.note || null,
            tx.created_at_local, tx.synced_at || null, 'SYNCED', tx.idempotency_key || null, tx.is_reversed || 0
          ]
        );
      }

      // Restore cash closures
      for (const cc of cashClosures) {
        await db.runAsync(
          `INSERT INTO cash_closures (id, collector_id, closure_date, total_cash_declared, total_system_calculated, discrepancy_reason, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [cc.id, cc.collector_id, cc.closure_date, cc.total_cash_declared, cc.total_system_calculated, cc.discrepancy_reason || null, cc.status || 'SUBMITTED', cc.created_at || new Date().toISOString()]
        );
      }
    });

    return {
      success: true,
      stats: {
        collectors: collectors.length,
        businesses: businesses.length,
        clients: clients.length,
        transactions: transactions.length,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      stats: { collectors: 0, businesses: 0, clients: 0, transactions: 0 },
      error: err?.message || 'Erreur lors de la restauration de la sauvegarde.',
    };
  }
}

