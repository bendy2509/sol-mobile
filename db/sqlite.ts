import 'react-native-get-random-values';
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { Collector, BusinessConfig, UserStatus } from '@/types';
import { arePhoneNumbersEqual, extractRaw8Digits, normalizePhoneNumber } from '@/lib/phoneUtils';
import { hashPin, verifyPinHash } from '@/lib/crypto';
import { runVersionedMigrations } from './migrations';
import { localDateString } from '@/lib/dates';
import { buildCycleRounds, paidUntilFromHands } from '@/services/scheduleService';
import { DEMO_BUSINESS_NAME, DEMO_COLLECTOR_ID, DEMO_PHONE, DEMO_PIN, isUntouchedDemoAccount, shouldSeedDemo } from './demoAccount';

/** The calls the app uses (expo-sqlite's SQLiteDatabase provides them on every platform). */
export interface UniversalSQLiteDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;
  getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]>;
  withTransactionAsync(callback: () => Promise<void>): Promise<void>;
}

/** The one open database: every caller waits on the same opening (two openings of sol.db fight over the file). */
let dbReady: Promise<UniversalSQLiteDatabase> | null = null;

let activeBusinessIdCache: string | null = null;

export async function getActiveBusinessId(): Promise<string | null> {
  if (activeBusinessIdCache) return activeBusinessIdCache;
  try {
    const saved = await AsyncStorage.getItem('SOL_ACTIVE_BUSINESS_ID');
    if (saved) {
      activeBusinessIdCache = saved;
      return saved;
    }
  } catch {}
  return null;
}

export async function setActiveBusinessId(businessId: string): Promise<void> {
  activeBusinessIdCache = businessId;
  try {
    await AsyncStorage.setItem('SOL_ACTIVE_BUSINESS_ID', businessId);
  } catch {}
}

async function initDatabaseInternal(db: any): Promise<void> {
  // WAL on phones. The web store (OPFS access-handle pool) has few file slots and no shared
  // memory: its default journal keeps one database file and one journal.
  if (Platform.OS !== 'web') {
    try {
      await db.execAsync('PRAGMA journal_mode = WAL;');
    } catch {}
  }
  try {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  } catch {}

  // 1. Create Base Tables
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS collectors (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone_number TEXT UNIQUE NOT NULL,
      pin_hash TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      role TEXT DEFAULT 'MANAGER',
      zone TEXT,
      sync_status TEXT DEFAULT 'PENDING',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_configs (
      id TEXT PRIMARY KEY,
      collector_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      contribution_amount REAL NOT NULL,
      frequency TEXT NOT NULL,
      total_slots INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      cycle_status TEXT DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      collector_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      type TEXT DEFAULT 'SABOTAY',
      daily_amount REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      payout_rank INTEGER,
      payout_ranks TEXT,
      hands_count INTEGER DEFAULT 1,
      received_hands_count INTEGER DEFAULT 0,
      has_received_payout INTEGER DEFAULT 0,
      has_received_hand INTEGER DEFAULT 0,
      hand_received_date TEXT,
      total_paid_amount REAL DEFAULT 0,
      paid_hands_count INTEGER DEFAULT 0,
      paid_until_date TEXT,
      qr_code_token TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'PENDING'
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      collector_id TEXT NOT NULL,
      sol_group_id TEXT,
      business_id TEXT,
      amount REAL NOT NULL,
      hands_covered INTEGER DEFAULT 1,
      type TEXT NOT NULL,
      payment_method TEXT DEFAULT 'CASH',
      note TEXT,
      created_at_local TEXT NOT NULL,
      synced_at TEXT,
      sync_status TEXT DEFAULT 'PENDING',
      idempotency_key TEXT,
      is_reversed INTEGER DEFAULT 0,
      reversal_id TEXT,
      reversed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS cash_closures (
      id TEXT PRIMARY KEY,
      collector_id TEXT NOT NULL,
      business_id TEXT,
      closure_date TEXT NOT NULL,
      total_cash_declared REAL NOT NULL,
      total_system_calculated REAL NOT NULL,
      discrepancy_reason TEXT,
      status TEXT DEFAULT 'SUBMITTED',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_data TEXT,
      new_data TEXT,
      reason TEXT,
      created_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'PENDING'
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      attempts_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS deleted_clients (
      id TEXT PRIMARY KEY,
      qr_code_token TEXT,
      phone_number TEXT,
      collector_id TEXT,
      deleted_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'PENDING'
    );

    CREATE TABLE IF NOT EXISTS closed_cycles (
      id TEXT PRIMARY KEY,
      collector_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      business_name TEXT NOT NULL,
      cycle_number INTEGER DEFAULT 1,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      closed_at TEXT NOT NULL,
      unit_amount REAL NOT NULL,
      total_slots INTEGER NOT NULL,
      total_hands INTEGER NOT NULL,
      total_pot REAL NOT NULL,
      total_collected REAL NOT NULL,
      total_distributed REAL NOT NULL,
      net_reserve REAL DEFAULT 0,
      completion_rate REAL DEFAULT 0,
      members_count INTEGER NOT NULL,
      snapshot_data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // 2. Versioned migrations (PRAGMA user_version): each runs once, inside a transaction;
  //    a failure is reported in Diagnostic and retried at the next start.
  const migrationReport = await runVersionedMigrations(db);
  if (migrationReport.error) console.warn('SQLite migration failed:', migrationReport.error);
  if (!shouldSeedDemo(Platform.OS, __DEV__)) await removeUntouchedDemoAccount(db);

  // 3. Create Indexes safely
  const indexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_clients_collector ON clients(collector_id);',
    'CREATE INDEX IF NOT EXISTS idx_clients_business ON clients(business_id);',
    'CREATE INDEX IF NOT EXISTS idx_tx_collector ON transactions(collector_id);',
    'CREATE INDEX IF NOT EXISTS idx_tx_business ON transactions(business_id);',
    'CREATE INDEX IF NOT EXISTS idx_tx_client ON transactions(client_id);',
    'CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at_local);',
    'CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);',
    'CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);',
    'CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_logs(status);',
    'CREATE INDEX IF NOT EXISTS idx_closed_cycles_collector ON closed_cycles(collector_id);',
    'CREATE INDEX IF NOT EXISTS idx_closed_cycles_business ON closed_cycles(business_id);',
  ];

  for (const idxSql of indexStatements) {
    try {
      await db.execAsync(idxSql);
    } catch (idxErr) {
      console.warn('Index notice:', idxErr);
    }
  }

  // 4. Seed initial data
  await seedInitialData(db);
}

export function getDatabase(): Promise<UniversalSQLiteDatabase> {
  if (!dbReady) {
    dbReady = (async () => {
      // expo-sqlite on every platform (web: wa-sqlite in a worker, needs a cross-origin
      // isolated page, see metro.config.js and app.json)
      const db = await SQLite.openDatabaseAsync('sol.db');
      await initDatabaseInternal(db);
      return db as unknown as UniversalSQLiteDatabase;
    })().catch((err) => {
      // Let the next call try again instead of keeping a failed opening
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
}

export async function initDatabase(): Promise<void> {
  await getDatabase();
}

/**
 * Earlier builds created the demo carnet on every new phone (manager +509 37 12 34 56,
 * PIN 1234). Remove it from production phones when it was never used for real work.
 */
async function removeUntouchedDemoAccount(db: UniversalSQLiteDatabase): Promise<void> {
  try {
    const collector = await db.getFirstAsync<{ id: string; phone_number: string; pin_hash: string; created_at: string }>(
      `SELECT id, phone_number, pin_hash, created_at FROM collectors WHERE id = ?`,
      [DEMO_COLLECTOR_ID]
    );
    if (!collector) return;
    const [businesses, clients, transactions, closures, cycles] = await Promise.all([
      db.getAllAsync<{ name: string }>(`SELECT name FROM business_configs WHERE collector_id = ?`, [DEMO_COLLECTOR_ID]),
      db.getAllAsync<{ id: string }>(`SELECT id FROM clients WHERE collector_id = ?`, [DEMO_COLLECTOR_ID]),
      db.getAllAsync<{ note: string | null; created_at_local: string }>(
        `SELECT note, created_at_local FROM transactions WHERE collector_id = ?`,
        [DEMO_COLLECTOR_ID]
      ),
      db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM cash_closures WHERE collector_id = ?`, [DEMO_COLLECTOR_ID]),
      db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM closed_cycles WHERE collector_id = ?`, [DEMO_COLLECTOR_ID]),
    ]);
    const unused = isUntouchedDemoAccount({
      collector,
      pinIsDefault: verifyPinHash(DEMO_PIN, collector.pin_hash),
      businesses,
      clientIds: clients.map((c) => c.id),
      transactions,
      otherRecordsCount: Number(closures?.n || 0) + Number(cycles?.n || 0),
    });
    if (!unused) return;

    await db.withTransactionAsync(async () => {
      await db.runAsync(`DELETE FROM transactions WHERE collector_id = ?`, [DEMO_COLLECTOR_ID]);
      await db.runAsync(`DELETE FROM clients WHERE collector_id = ?`, [DEMO_COLLECTOR_ID]);
      await db.runAsync(`DELETE FROM business_configs WHERE collector_id = ?`, [DEMO_COLLECTOR_ID]);
      await db.runAsync(`DELETE FROM audit_logs WHERE user_id = ?`, [DEMO_COLLECTOR_ID]);
      await db.runAsync(`DELETE FROM collectors WHERE id = ?`, [DEMO_COLLECTOR_ID]);
    });
    if ((await AsyncStorage.getItem('SOL_ACTIVE_COLLECTOR_ID')) === DEMO_COLLECTOR_ID) {
      await AsyncStorage.multiRemove(['SOL_ACTIVE_COLLECTOR_ID', 'SOL_ACTIVE_BUSINESS_ID', 'SOL_IS_LOGGED_IN']);
    }
    if ((await AsyncStorage.getItem('SOL_LAST_PHONE')) === DEMO_PHONE) await AsyncStorage.removeItem('SOL_LAST_PHONE');
  } catch (err) {
    console.warn('Demo account cleanup notice:', err);
  }
}

async function seedInitialData(db: UniversalSQLiteDatabase): Promise<void> {
  // Demo data belongs to the web preview and development builds, never to a production phone
  if (!shouldSeedDemo(Platform.OS, __DEV__)) return;
  const collector = await db.getFirstAsync<{ id: string }>('SELECT id FROM collectors LIMIT 1');

  if (!collector) {
    const collectorId = DEMO_COLLECTOR_ID;
    const day = 24 * 60 * 60 * 1000;
    const isoDay = (offsetDays: number) => localDateString(new Date(Date.now() + offsetDays * day));
    // The demo carnet opened 2 days ago: its account, members and past operations carry that
    // time, so today's dashboard starts empty and the statuses (late, partial, ahead) make sense.
    const now = new Date(Date.now() - 2 * day).toISOString();

    // 1. Demo manager (PIN 1234)
    await db.runAsync(
      `INSERT INTO collectors (id, full_name, phone_number, pin_hash, status, zone, created_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      [collectorId, 'Bendy SERVILUS', DEMO_PHONE, hashPin(DEMO_PIN), 'Marché de Pétion-Ville', now]
    );

    // 2. A daily sol of 250 HTG a hand, started 2 days ago. Bendy 1 hand, SERVILUS 2 hands,
    //    BS 1 hand, B. Servilus 1 hand: 5 hands = 5 rounds, pot 1 250 HTG a round.
    const businessId = uuidv4();
    const unit = 250;
    const totalHands = 5;
    const startDate = isoDay(-2);
    const rounds = buildCycleRounds(startDate, 'DAILY', totalHands);

    await db.runAsync(
      `INSERT INTO business_configs (id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, cycle_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, collectorId, DEMO_BUSINESS_NAME, 'SOL', unit, 'DAILY', totalHands, startDate, rounds[rounds.length - 1], 'ACTIVE', 'ACTIVE', now]
    );

    await setActiveBusinessId(businessId);

    // 3. Members: every one owes all their hands at every round since the start (3 rounds so far)
    const member = (id: string, name: string, phone: string, ranks: number[], hands: number, paidHands: number, token: string, hasHand = 0) => ({
      id,
      name,
      phone,
      ranks,
      hands,
      // Same as the ledger replay: a hand received is paid out of the balance
      balance: Math.max(0, paidHands * unit - (hasHand ? unit * totalHands : 0)),
      hasHand,
      handDate: hasHand ? isoDay(-2) : null,
      totalPaid: paidHands * unit,
      paidHands,
      paidUntil: paidUntilFromHands({ cycleStartDate: startDate, frequency: 'DAILY', memberHands: hands, paidHands, totalRounds: totalHands }),
      token,
    });
    const sampleClients = [
      member('11111111-0000-0000-0000-000000000001', 'Bendy', '+50938112233', [1], 1, 4, 'SOL-BS01', 1), // en avance, main reçue
      member('22222222-0000-0000-0000-000000000002', 'SERVILUS', '+50937445566', [2, 3], 2, 5, 'SOL-BS02'), // 2 mains : partiel aujourd'hui
      member('33333333-0000-0000-0000-000000000003', 'BS', '+50946778899', [4], 1, 1, 'SOL-BS03'), // 1 tour de retard
      member('44444444-0000-0000-0000-000000000004', 'B. Servilus', '+50931223344', [5], 1, 2, 'SOL-BS04'), // à encaisser aujourd'hui
    ];

    for (const c of sampleClients) {
      await db.runAsync(
        `INSERT INTO clients (id, business_id, collector_id, full_name, phone_number, type, daily_amount, current_balance, payout_rank, payout_ranks, hands_count, received_hands_count, has_received_payout, has_received_hand, hand_received_date, total_paid_amount, paid_hands_count, paid_until_date, qr_code_token, created_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
        [
          c.id,
          businessId,
          collectorId,
          c.name,
          c.phone,
          'SOL',
          unit,
          c.balance,
          c.ranks[0],
          c.ranks.join(','),
          c.hands,
          c.hasHand ? 1 : 0,
          c.hasHand,
          c.hasHand,
          c.handDate,
          c.totalPaid,
          c.paidHands,
          c.paidUntil,
          c.token,
          now,
        ]
      );

      await db.runAsync(
        `INSERT INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, hands_covered, type, payment_method, note, created_at_local, sync_status)
         VALUES (?, ?, ?, NULL, ?, ?, ?, 'SOL_CONTRIBUTION', 'CASH', 'Cotisation régulière', ?, 'SYNCED')`,
        [uuidv4(), c.id, collectorId, businessId, c.totalPaid, c.paidHands, now]
      );
      if (c.hasHand) {
        await db.runAsync(
          `INSERT INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, hands_covered, type, payment_method, note, created_at_local, sync_status)
           VALUES (?, ?, ?, NULL, ?, ?, 1, 'SOL_PAYOUT', 'CASH', 'Remise de la main (démo)', ?, 'SYNCED')`,
          // 30 s after the contribution: the replay order is unambiguous (still within the
          // seed window that lets a production phone recognise and remove the demo)
          [uuidv4(), c.id, collectorId, businessId, unit * totalHands, new Date(Date.parse(now) + 30_000).toISOString()]
        );
      }
    }
  }
}

export async function getActiveCollectorId(): Promise<string> {
  const stored = await AsyncStorage.getItem('SOL_ACTIVE_COLLECTOR_ID');
  if (stored) return stored;

  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM collectors WHERE status = 'ACTIVE' LIMIT 1`
  );
  return row?.id || 'c011ec70-0000-0000-0000-000000000001';
}

export async function getActiveCollector(): Promise<Collector | null> {
  const db = await getDatabase();
  const activeId = await getActiveCollectorId();

  let row = null;
  if (activeId) {
    row = await db.getFirstAsync<{
      id: string;
      full_name: string;
      phone_number: string;
      pin_hash: string;
      status: string;
      zone: string | null;
      created_at: string;
    }>(`SELECT * FROM collectors WHERE id = ? LIMIT 1`, [activeId]);
  }

  if (!row) {
    row = await db.getFirstAsync<{
      id: string;
      full_name: string;
      phone_number: string;
      pin_hash: string;
      status: string;
      zone: string | null;
      created_at: string;
    }>(`SELECT * FROM collectors ORDER BY created_at DESC LIMIT 1`);
  }

  if (!row) return null;

  return {
    id: row.id,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    pinHash: row.pin_hash,
    status: row.status as UserStatus,
    zone: row.zone || undefined,
    createdAt: row.created_at,
  };
}

export async function getCollectorByPhone(phone: string): Promise<Collector | null> {
  const db = await getDatabase();
  const raw8 = extractRaw8Digits(phone);
  const normalized = normalizePhoneNumber(phone);

  const rows = await db.getAllAsync<{
    id: string;
    full_name: string;
    phone_number: string;
    pin_hash: string;
    status: string;
    zone: string | null;
    created_at: string;
  }>(`SELECT * FROM collectors`);

  const found = rows.find(
    (c) =>
      arePhoneNumbersEqual(c.phone_number, phone) ||
      (raw8.length >= 8 && extractRaw8Digits(c.phone_number) === raw8) ||
      normalizePhoneNumber(c.phone_number) === normalized
  );

  if (!found) return null;
  return {
    id: found.id,
    fullName: found.full_name,
    phoneNumber: found.phone_number,
    pinHash: found.pin_hash,
    status: found.status as UserStatus,
    zone: found.zone || undefined,
    createdAt: found.created_at,
  };
}

export async function updateCollectorStatus(collectorId: string, status: UserStatus): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE collectors SET status = ? WHERE id = ?`, [status, collectorId]);
}

export async function setActiveCollectorId(collectorId: string): Promise<void> {
  await AsyncStorage.setItem('SOL_ACTIVE_COLLECTOR_ID', collectorId);
}

export async function isCollectorPhoneTaken(phone: string, excludeCollectorId?: string): Promise<boolean> {
  const db = await getDatabase();
  const raw8 = extractRaw8Digits(phone);
  const normalized = normalizePhoneNumber(phone);

  const rows = await db.getAllAsync<{ id: string; phone_number: string }>(`SELECT id, phone_number FROM collectors`);

  return rows.some(
    (c) =>
      c.id !== excludeCollectorId &&
      (arePhoneNumbersEqual(c.phone_number, phone) ||
        (raw8.length >= 8 && extractRaw8Digits(c.phone_number) === raw8) ||
        normalizePhoneNumber(c.phone_number) === normalized)
  );
}

export async function isClientPhoneTaken(
  phone: string,
  collectorId: string,
  excludeClientId?: string
): Promise<boolean> {
  const db = await getDatabase();
  const raw8 = extractRaw8Digits(phone);
  const normalized = normalizePhoneNumber(phone);

  const rows = await db.getAllAsync<{ id: string; phone_number: string }>(
    // Members of earlier cycles (tombstoned) can enrol again with the same number
    `SELECT id, phone_number FROM clients WHERE collector_id = ? AND id NOT IN (SELECT id FROM deleted_clients)`,
    [collectorId]
  );

  return rows.some(
    (c) =>
      c.id !== excludeClientId &&
      (arePhoneNumbersEqual(c.phone_number, phone) ||
        (raw8.length >= 8 && extractRaw8Digits(c.phone_number) === raw8) ||
        normalizePhoneNumber(c.phone_number) === normalized)
  );
}
