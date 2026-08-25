import 'react-native-get-random-values';
import * as SQLite from 'expo-sqlite';
import { v4 as uuidv4 } from 'uuid';
import { Collector, BusinessConfig } from '@/types';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('sol.db');
  }
  return dbInstance;
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    // 1. Check & migrate columns in 'clients'
    const clientColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(clients)');
    const clientColNames = clientColumns.map((c) => c.name);

    if (clientColNames.length > 0) {
      if (!clientColNames.includes('business_id')) {
        await db.execAsync('ALTER TABLE clients ADD COLUMN business_id TEXT;');
      }
      if (!clientColNames.includes('payout_rank')) {
        await db.execAsync('ALTER TABLE clients ADD COLUMN payout_rank INTEGER;');
      }
      if (!clientColNames.includes('has_received_payout')) {
        await db.execAsync('ALTER TABLE clients ADD COLUMN has_received_payout INTEGER DEFAULT 0;');
      }
    }

    // 2. Check & migrate columns in 'transactions'
    const txColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
    const txColNames = txColumns.map((c) => c.name);

    if (txColNames.length > 0) {
      if (!txColNames.includes('business_id')) {
        await db.execAsync('ALTER TABLE transactions ADD COLUMN business_id TEXT;');
      }
      if (!txColNames.includes('payment_method')) {
        await db.execAsync("ALTER TABLE transactions ADD COLUMN payment_method TEXT DEFAULT 'CASH';");
      }
    }

    // 3. Migrate collectors if needed
    const colColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(collectors)');
    const colColNames = colColumns.map((c) => c.name);
    if (colColNames.length > 0) {
      if (!colColNames.includes('zone')) {
        await db.execAsync('ALTER TABLE collectors ADD COLUMN zone TEXT;');
      }
    }
  } catch (migrationErr) {
    console.warn('SQLite migration notice:', migrationErr);
  }
}

export async function initDatabase(): Promise<void> {
  const db = await getDatabase();

  // Enable WAL mode for high write performance
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS collectors (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone_number TEXT UNIQUE NOT NULL,
      pin_hash TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      zone TEXT,
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
      has_received_payout INTEGER DEFAULT 0,
      qr_code_token TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'PENDING'
    );

    CREATE TABLE IF NOT EXISTS sol_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contribution_amount REAL NOT NULL,
      frequency TEXT NOT NULL,
      total_rounds INTEGER NOT NULL,
      current_round INTEGER DEFAULT 1,
      status TEXT DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sol_group_members (
      id TEXT PRIMARY KEY,
      sol_group_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      payout_rank INTEGER NOT NULL,
      has_paid INTEGER DEFAULT 0,
      UNIQUE(sol_group_id, payout_rank),
      UNIQUE(sol_group_id, client_id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      collector_id TEXT NOT NULL,
      sol_group_id TEXT,
      business_id TEXT,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      payment_method TEXT DEFAULT 'CASH',
      created_at_local TEXT NOT NULL,
      synced_at TEXT,
      sync_status TEXT DEFAULT 'PENDING'
    );

    CREATE TABLE IF NOT EXISTS cash_closures (
      id TEXT PRIMARY KEY,
      collector_id TEXT NOT NULL,
      closure_date TEXT NOT NULL,
      total_cash_declared REAL NOT NULL,
      total_system_calculated REAL NOT NULL,
      discrepancy_reason TEXT,
      status TEXT DEFAULT 'SUBMITTED',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone_number);
    CREATE INDEX IF NOT EXISTS idx_clients_collector ON clients(collector_id);
    CREATE INDEX IF NOT EXISTS idx_clients_qr ON clients(qr_code_token);
    CREATE INDEX IF NOT EXISTS idx_tx_client ON transactions(client_id);
    CREATE INDEX IF NOT EXISTS idx_tx_collector ON transactions(collector_id);
    CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at_local);
    CREATE INDEX IF NOT EXISTS idx_tx_sync ON transactions(sync_status);
    CREATE INDEX IF NOT EXISTS idx_sol_members ON sol_group_members(sol_group_id, payout_rank);
  `);

  // Run dynamic column migrations for existing databases
  await runMigrations(db);

  await seedInitialData(db);
}

export async function seedInitialData(db: SQLite.SQLiteDatabase): Promise<void> {
  const existingCollector = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM collectors'
  );

  const collectorId = 'c0000000-0000-0000-0000-000000000001';
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  if (!existingCollector || existingCollector.count === 0) {
    // Pre-seed default test Collector
    await db.runAsync(
      `INSERT OR IGNORE INTO collectors (id, full_name, phone_number, pin_hash, status, zone, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        collectorId,
        'Jean-Baptiste Pierre',
        '+50937123456',
        '123456', // In production, hashed with bcrypt/argon2
        'ACTIVE',
        'Marché Salomon (Port-au-Prince)',
        now,
      ]
    );

    await db.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('active_collector_id', ?)`,
      [collectorId]
    );
  }

  // Ensure default Business Config exists
  const existingBusiness = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM business_configs'
  );

  const businessId = 'b0000000-0000-0000-0000-000000000001';
  if (!existingBusiness || existingBusiness.count === 0) {
    const startDate = today;
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await db.runAsync(
      `INSERT OR IGNORE INTO business_configs (id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      [
        businessId,
        collectorId,
        'Sabotay Marché Cluny 2026',
        'SABOTAY',
        250,
        'DAILY',
        12,
        startDate,
        endDate,
        now,
      ]
    );

    await db.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('active_business_id', ?)`,
      [businessId]
    );
  }

  // Ensure sample clients exist and are properly populated
  const existingClients = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM clients'
  );

  if (!existingClients || existingClients.count === 0) {
    const sampleClients = [
      {
        id: 'c1111111-1111-1111-1111-111111111111',
        collectorId,
        businessId,
        fullName: 'Marie Carmel St-Fleur',
        phoneNumber: '+50936112233',
        type: 'SABOTAY',
        dailyAmount: 250,
        currentBalance: 1250,
        payoutRank: 1,
        hasReceivedPayout: 0,
        qrCodeToken: 'SOL-CLT-MARIECARMEL',
        createdAt: now,
      },
      {
        id: 'c2222222-2222-2222-2222-222222222222',
        collectorId,
        businessId,
        fullName: 'Dieudonné Joseph',
        phoneNumber: '+50938445566',
        type: 'HYBRID',
        dailyAmount: 500,
        currentBalance: 3500,
        payoutRank: 2,
        hasReceivedPayout: 1,
        qrCodeToken: 'SOL-CLT-DIEUDONNE',
        createdAt: now,
      },
      {
        id: 'c3333333-3333-3333-3333-333333333333',
        collectorId,
        businessId,
        fullName: 'Roselore Jean-Louis',
        phoneNumber: '+50947778899',
        type: 'SOL',
        dailyAmount: 1000,
        currentBalance: 5000,
        payoutRank: 3,
        hasReceivedPayout: 0,
        qrCodeToken: 'SOL-CLT-ROSELORE',
        createdAt: now,
      },
      {
        id: 'c4444444-4444-4444-4444-444444444444',
        collectorId,
        businessId,
        fullName: 'Frantz Charles',
        phoneNumber: '+50931223344',
        type: 'SABOTAY',
        dailyAmount: 100,
        currentBalance: 800,
        payoutRank: 4,
        hasReceivedPayout: 0,
        qrCodeToken: 'SOL-CLT-FRANTZ',
        createdAt: now,
      },
      {
        id: 'c5555555-5555-5555-5555-555555555555',
        collectorId,
        businessId,
        fullName: 'Fabiola Toussaint',
        phoneNumber: '+50949556677',
        type: 'HYBRID',
        dailyAmount: 500,
        currentBalance: 2000,
        payoutRank: 5,
        hasReceivedPayout: 0,
        qrCodeToken: 'SOL-CLT-FABIOLA',
        createdAt: now,
      },
    ];

    for (const client of sampleClients) {
      await db.runAsync(
        `INSERT OR IGNORE INTO clients (id, business_id, collector_id, full_name, phone_number, type, daily_amount, current_balance, payout_rank, has_received_payout, qr_code_token, created_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
        [
          client.id,
          client.businessId,
          client.collectorId,
          client.fullName,
          client.phoneNumber,
          client.type,
          client.dailyAmount,
          client.currentBalance,
          client.payoutRank,
          client.hasReceivedPayout,
          client.qrCodeToken,
          client.createdAt,
        ]
      );
    }
  }

  // Pre-seed sample transactions if transactions table is empty
  const existingTransactions = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM transactions'
  );

  if (!existingTransactions || existingTransactions.count === 0) {
    const sampleTransactions = [
      {
        id: uuidv4(),
        clientId: 'c1111111-1111-1111-1111-111111111111',
        collectorId,
        businessId,
        amount: 250,
        type: 'SABOTAY_DEPOSIT',
        paymentMethod: 'CASH',
        createdAtLocal: now, // Paid today!
        syncStatus: 'SYNCED',
      },
      {
        id: uuidv4(),
        clientId: 'c2222222-2222-2222-2222-222222222222',
        collectorId,
        businessId,
        amount: 500,
        type: 'SABOTAY_DEPOSIT',
        paymentMethod: 'CASH',
        createdAtLocal: now, // Paid today!
        syncStatus: 'SYNCED',
      },
    ];

    for (const tx of sampleTransactions) {
      await db.runAsync(
        `INSERT OR IGNORE INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, type, payment_method, created_at_local, sync_status)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
          tx.id,
          tx.clientId,
          tx.collectorId,
          tx.businessId,
          tx.amount,
          tx.type,
          tx.paymentMethod,
          tx.createdAtLocal,
          tx.syncStatus,
        ]
      );
    }
  }
}

export async function getActiveCollectorId(): Promise<string> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'active_collector_id'`
  );
  return row?.value || 'c0000000-0000-0000-0000-000000000001';
}

export async function getActiveCollector(): Promise<Collector | null> {
  const db = await getDatabase();
  const collectorId = await getActiveCollectorId();
  const row = await db.getFirstAsync<{
    id: string;
    full_name: string;
    phone_number: string;
    pin_hash: string;
    status: 'ACTIVE' | 'INACTIVE';
    zone: string | null;
    created_at: string;
  }>(`SELECT * FROM collectors WHERE id = ?`, [collectorId]);

  if (!row) return null;

  return {
    id: row.id,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    pinHash: row.pin_hash,
    status: row.status,
    zone: row.zone || undefined,
    createdAt: row.created_at,
  };
}

export async function setActiveCollectorId(collectorId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('active_collector_id', ?)`,
    [collectorId]
  );
}

export async function getActiveBusinessId(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'active_business_id'`
  );
  return row?.value || null;
}

export async function setActiveBusinessId(businessId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('active_business_id', ?)`,
    [businessId]
  );
}
