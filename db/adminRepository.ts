import { BusinessConfig, Collector, Transaction, UserStatus } from '@/types';
import { getDatabase, isCollectorPhoneTaken, isCollectorPinTaken } from './sqlite';
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

  const clientRow = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM clients`
  );
  const totalClients = Number(clientRow?.count || 0);

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

    const clientsCountRow = await db.getFirstAsync<{ count: number }>(
      `SELECT count(*) as count FROM clients WHERE collector_id = ?`,
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
      clientsCount: Number(clientsCountRow?.count || 0),
      totalCollected: Number(txStatsRow?.total_in || 0),
      totalDistributed: Number(txStatsRow?.total_out || 0),
    });
  }

  return overviews;
}

/**
 * Updates a manager's personal details (Name, Phone, Zone, PIN, Status).
 */
export async function updateManagerDetails(
  collectorId: string,
  data: {
    fullName?: string;
    phoneNumber?: string;
    zone?: string;
    pin?: string;
    status?: UserStatus;
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
    const isPinTaken = await isCollectorPinTaken(data.pin, collectorId);
    if (isPinTaken) {
      throw new Error('Ce code PIN est déjà utilisé. Veuillez choisir un code PIN unique.');
    }
    fields.push('pin_hash = ?');
    params.push(hashPin(data.pin));
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);
  }

  if (fields.length === 0) return;

  params.push(collectorId);
  await db.runAsync(`UPDATE collectors SET ${fields.join(', ')} WHERE id = ?`, params);
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

  const backupData = {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    platform: 'SOL Mobile',
    data: {
      collectors,
      businesses,
      clients,
      transactions,
    },
  };

  return JSON.stringify(backupData, null, 2);
}

