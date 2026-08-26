import 'react-native-get-random-values';
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { Collector, BusinessConfig, UserStatus } from '@/types';
import { arePhoneNumbersEqual, extractRaw8Digits, normalizePhoneNumber } from '@/lib/phoneUtils';
import { hashPin, verifyPinHash } from '@/lib/crypto';

// Web In-Memory / LocalStorage State Interface for Web Testing
export interface UniversalSQLiteDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;
  getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]>;
  withTransactionAsync(callback: () => Promise<void>): Promise<void>;
}

interface WebTableStore {
  collectors: any[];
  business_configs: any[];
  clients: any[];
  sol_groups: any[];
  sol_group_members: any[];
  transactions: any[];
  cash_closures: any[];
}

class WebSQLiteAdapter {
  private data: WebTableStore = {
    collectors: [],
    business_configs: [],
    clients: [],
    sol_groups: [],
    sol_group_members: [],
    transactions: [],
    cash_closures: [],
  };

  async init() {
    try {
      const saved = await AsyncStorage.getItem('SOL_WEB_DB_STORE');
      if (saved) {
        this.data = JSON.parse(saved);
      }
    } catch {}
  }

  private async persist() {
    try {
      await AsyncStorage.setItem('SOL_WEB_DB_STORE', JSON.stringify(this.data));
    } catch {}
  }

  async execAsync(sql: string): Promise<void> {
    // DDL statements are handled in-memory on Web
  }

  async runAsync(sql: string, params: any[] = []): Promise<{ lastInsertRowId: number; changes: number }> {
    const cleanSql = sql.trim();
    const upperSql = cleanSql.toUpperCase();

    if (upperSql.startsWith('INSERT INTO') || upperSql.startsWith('INSERT OR REPLACE INTO')) {
      const tableMatch = cleanSql.match(/INSERT (?:OR REPLACE )?INTO\s+(\w+)/i);
      const tableName = tableMatch ? tableMatch[1].toLowerCase() : '';

      if (tableName === 'collectors') {
        const [id, full_name, phone_number, pin_hash, status, zone, created_at] = params;
        const existingIdx = this.data.collectors.findIndex((c) => c.id === id || c.phone_number === phone_number);
        const item = { id, full_name, phone_number, pin_hash, status: status || 'ACTIVE', zone, created_at };
        if (existingIdx >= 0) {
          this.data.collectors[existingIdx] = item;
        } else {
          this.data.collectors.push(item);
        }
      } else if (tableName === 'business_configs') {
        const [id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, created_at] = params;
        const existingIdx = this.data.business_configs.findIndex((b) => b.id === id);
        const item = {
          id, collector_id, name, type, contribution_amount: Number(contribution_amount),
          frequency, total_slots: Number(total_slots), start_date, end_date, status: status || 'ACTIVE', created_at
        };
        if (existingIdx >= 0) {
          this.data.business_configs[existingIdx] = item;
        } else {
          this.data.business_configs.push(item);
        }
      } else if (tableName === 'clients') {
        const [
          id, business_id, collector_id, full_name, phone_number, type,
          daily_amount, current_balance, payout_rank, has_received_hand,
          hand_received_date, total_paid_amount, paid_hands_count, paid_until_date,
          qr_code_token, created_at
        ] = params;
        const existingIdx = this.data.clients.findIndex((c) => c.id === id || c.qr_code_token === qr_code_token);
        const item = {
          id, business_id, collector_id, full_name, phone_number, type: type || 'SABOTAY',
          daily_amount: Number(daily_amount), current_balance: Number(current_balance),
          payout_rank: payout_rank !== null && payout_rank !== undefined ? Number(payout_rank) : null,
          has_received_payout: has_received_hand ? 1 : 0,
          has_received_hand: has_received_hand ? 1 : 0,
          hand_received_date: hand_received_date || null,
          total_paid_amount: Number(total_paid_amount || current_balance || 0),
          paid_hands_count: Number(paid_hands_count || 0),
          paid_until_date: paid_until_date || null,
          qr_code_token, created_at, sync_status: 'PENDING'
        };
        if (existingIdx >= 0) {
          this.data.clients[existingIdx] = item;
        } else {
          this.data.clients.push(item);
        }
      } else if (tableName === 'transactions') {
        const [id, client_id, collector_id, sol_group_id, business_id, amount, hands_covered, type, payment_method, note, created_at_local] = params;
        this.data.transactions.unshift({
          id, client_id, member_id: client_id, collector_id, sol_group_id, business_id,
          amount: Number(amount), hands_covered: Number(hands_covered || 1), type, payment_method: payment_method || 'CASH',
          note: note || null, created_at_local, sync_status: 'PENDING'
        });
      } else if (tableName === 'cash_closures') {
        const [id, collector_id, closure_date, total_cash_declared, total_system_calculated, discrepancy_reason, created_at] = params;
        this.data.cash_closures.push({
          id, collector_id, closure_date, total_cash_declared: Number(total_cash_declared),
          total_system_calculated: Number(total_system_calculated), discrepancy_reason,
          status: 'SUBMITTED', created_at
        });
      }
      await this.persist();
      return { lastInsertRowId: 1, changes: 1 };
    }

    if (upperSql.startsWith('UPDATE')) {
      if (cleanSql.includes('UPDATE clients SET')) {
        if (cleanSql.includes('has_received_hand = 1')) {
          const [date, clientId] = params;
          const cl = this.data.clients.find((c) => c.id === clientId);
          if (cl) {
            cl.has_received_hand = 1;
            cl.has_received_payout = 1;
            cl.hand_received_date = date;
          }
        } else if (cleanSql.includes('current_balance =')) {
          const [balance, totalPaid, paidHands, paidUntil, clientId] = params;
          const cl = this.data.clients.find((c) => c.id === clientId);
          if (cl) {
            cl.current_balance = Number(balance);
            if (totalPaid !== undefined) cl.total_paid_amount = Number(totalPaid);
            if (paidHands !== undefined) cl.paid_hands_count = Number(paidHands);
            if (paidUntil !== undefined) cl.paid_until_date = paidUntil;
          }
        }
      } else if (cleanSql.includes('UPDATE collectors SET status =')) {
        const [newStatus, collectorId] = params;
        if (collectorId) {
          const c = this.data.collectors.find((col) => col.id === collectorId);
          if (c) c.status = newStatus;
        } else {
          this.data.collectors.forEach((c) => (c.status = newStatus));
        }
      }
      await this.persist();
      return { lastInsertRowId: 0, changes: 1 };
    }

    return { lastInsertRowId: 0, changes: 0 };
  }

  async getFirstAsync<T>(sql: string, params: any[] = []): Promise<T | null> {
    const list = await this.getAllAsync<T>(sql, params);
    return list.length > 0 ? list[0] : null;
  }

  async getAllAsync<T>(sql: string, params: any[] = []): Promise<T[]> {
    const cleanSql = sql.trim();
    const upperSql = cleanSql.toUpperCase();

    if (cleanSql.includes('PRAGMA table_info')) {
      if (cleanSql.includes('clients')) {
        return [
          { name: 'id' }, { name: 'business_id' }, { name: 'collector_id' },
          { name: 'full_name' }, { name: 'phone_number' }, { name: 'type' },
          { name: 'daily_amount' }, { name: 'current_balance' }, { name: 'payout_rank' },
          { name: 'has_received_payout' }, { name: 'has_received_hand' }, { name: 'hand_received_date' },
          { name: 'total_paid_amount' }, { name: 'paid_hands_count' }, { name: 'paid_until_date' },
          { name: 'qr_code_token' }, { name: 'created_at' }
        ] as any;
      }
      if (cleanSql.includes('transactions')) {
        return [
          { name: 'id' }, { name: 'client_id' }, { name: 'collector_id' },
          { name: 'business_id' }, { name: 'amount' }, { name: 'hands_covered' },
          { name: 'type' }, { name: 'payment_method' }, { name: 'note' },
          { name: 'created_at_local' }
        ] as any;
      }
      if (cleanSql.includes('collectors')) {
        return [
          { name: 'id' }, { name: 'full_name' }, { name: 'phone_number' },
          { name: 'pin_hash' }, { name: 'status' }, { name: 'zone' }, { name: 'created_at' }
        ] as any;
      }
      return [] as any;
    }

    if (upperSql.includes('FROM COLLECTORS')) {
      if (cleanSql.includes('WHERE id = ?')) {
        return this.data.collectors.filter((c) => c.id === params[0]) as any;
      }
      if (cleanSql.includes('WHERE phone_number = ?')) {
        return this.data.collectors.filter((c) => c.phone_number === params[0]) as any;
      }
      if (cleanSql.includes(`status = 'ACTIVE'`)) {
        return this.data.collectors.filter((c) => c.status === 'ACTIVE') as any;
      }
      return this.data.collectors as any;
    }

    if (upperSql.includes('FROM BUSINESS_CONFIGS')) {
      if (cleanSql.includes('WHERE id = ?')) {
        return this.data.business_configs.filter((b) => b.id === params[0]) as any;
      }
      if (cleanSql.includes('WHERE collector_id = ?')) {
        return this.data.business_configs.filter((b) => b.collector_id === params[0]) as any;
      }
      if (cleanSql.includes(`status = 'ACTIVE'`)) {
        return this.data.business_configs.filter((b) => b.status === 'ACTIVE') as any;
      }
      return this.data.business_configs as any;
    }

    if (upperSql.includes('FROM CLIENTS')) {
      let result = [...this.data.clients];
      if (cleanSql.includes('WHERE id = ?')) {
        result = result.filter((c) => c.id === params[0]);
      } else if (cleanSql.includes('qr_code_token = ? OR id = ?')) {
        result = result.filter((c) => c.qr_code_token === params[0] || c.id === params[1]);
      }
      return result as any;
    }

    if (upperSql.includes('FROM TRANSACTIONS')) {
      if (cleanSql.includes('COUNT(*)')) {
        if (cleanSql.includes(`sync_status = 'PENDING'`)) {
          const count = this.data.transactions.filter((t) => t.sync_status === 'PENDING').length;
          return [{ count }] as any;
        }
        if (cleanSql.includes(`type = 'CONTRIBUTION'`) || cleanSql.includes(`type = 'SABOTAY_DEPOSIT'`)) {
          const count = this.data.transactions.filter((t) => t.type === 'CONTRIBUTION' || t.type === 'SABOTAY_DEPOSIT' || t.type === 'SOL_CONTRIBUTION').length;
          return [{ count }] as any;
        }
      }
      if (cleanSql.includes('SUM(AMOUNT)')) {
        const isContribution = cleanSql.includes(`'CONTRIBUTION'`) || cleanSql.includes(`'SABOTAY_DEPOSIT'`);
        const isPayout = cleanSql.includes(`'HAND_PAYOUT'`) || cleanSql.includes(`'SOL_PAYOUT'`);

        let filtered = this.data.transactions;
        if (isContribution) {
          filtered = filtered.filter((t) => t.type === 'CONTRIBUTION' || t.type === 'SABOTAY_DEPOSIT' || t.type === 'SOL_CONTRIBUTION');
        } else if (isPayout) {
          filtered = filtered.filter((t) => t.type === 'HAND_PAYOUT' || t.type === 'SOL_PAYOUT');
        }

        const total = filtered.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
        return [{ total }] as any;
      }

      let txs = this.data.transactions.map((t) => {
        const client = this.data.clients.find((c) => c.id === t.client_id || c.id === t.member_id);
        return {
          ...t,
          client_name: client?.full_name || 'Adhérent inconnu',
          member_name: client?.full_name || 'Adhérent inconnu',
          client_phone: client?.phone_number || '',
          member_phone: client?.phone_number || '',
        };
      });

      if (cleanSql.includes('client_id = ?') || cleanSql.includes('member_id = ?')) {
        txs = txs.filter((t) => t.client_id === params[0] || t.member_id === params[0]);
      }
      return txs as any;
    }

    if (upperSql.includes('FROM CASH_CLOSURES')) {
      return this.data.cash_closures as any;
    }

    return [] as any;
  }

  async withTransactionAsync(callback: () => Promise<void>): Promise<void> {
    await callback();
    await this.persist();
  }
}

let dbInstance: any = null;
let dbInitPromise: Promise<void> | null = null;
const webDb = new WebSQLiteAdapter();

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

async function runMigrations(db: UniversalSQLiteDatabase): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // 1. Check & migrate columns in 'clients'
    const clientColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(clients)');
    const clientColNames = clientColumns.map((c: any) => c.name);

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
      if (!clientColNames.includes('has_received_hand')) {
        await db.execAsync('ALTER TABLE clients ADD COLUMN has_received_hand INTEGER DEFAULT 0;');
      }
      if (!clientColNames.includes('hand_received_date')) {
        await db.execAsync('ALTER TABLE clients ADD COLUMN hand_received_date TEXT;');
      }
      if (!clientColNames.includes('total_paid_amount')) {
        await db.execAsync('ALTER TABLE clients ADD COLUMN total_paid_amount REAL DEFAULT 0;');
      }
      if (!clientColNames.includes('paid_hands_count')) {
        await db.execAsync('ALTER TABLE clients ADD COLUMN paid_hands_count INTEGER DEFAULT 0;');
      }
      if (!clientColNames.includes('paid_until_date')) {
        await db.execAsync('ALTER TABLE clients ADD COLUMN paid_until_date TEXT;');
      }
    }

    // 2. Check & migrate columns in 'transactions'
    const txColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
    const txColNames = txColumns.map((c: any) => c.name);

    if (txColNames.length > 0) {
      if (!txColNames.includes('business_id')) {
        await db.execAsync('ALTER TABLE transactions ADD COLUMN business_id TEXT;');
      }
      if (!txColNames.includes('payment_method')) {
        await db.execAsync("ALTER TABLE transactions ADD COLUMN payment_method TEXT DEFAULT 'CASH';");
      }
      if (!txColNames.includes('hands_covered')) {
        await db.execAsync('ALTER TABLE transactions ADD COLUMN hands_covered INTEGER DEFAULT 1;');
      }
      if (!txColNames.includes('note')) {
        await db.execAsync('ALTER TABLE transactions ADD COLUMN note TEXT;');
      }
      await db.runAsync(`UPDATE transactions SET type = 'SOL_CONTRIBUTION' WHERE type = 'CONTRIBUTION';`);
      await db.runAsync(`UPDATE transactions SET type = 'SOL_PAYOUT' WHERE type = 'HAND_PAYOUT';`);
    }

    // 3. Migrate collectors if needed
    const colColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(collectors)');
    const colColNames = colColumns.map((c: any) => c.name);
    if (colColNames.length > 0) {
      if (!colColNames.includes('zone')) {
        await db.execAsync('ALTER TABLE collectors ADD COLUMN zone TEXT;');
      }
      if (!colColNames.includes('status')) {
        await db.execAsync("ALTER TABLE collectors ADD COLUMN status TEXT DEFAULT 'PENDING_APPROVAL';");
      }
    }
  } catch (migrationErr) {
    console.warn('SQLite migration notice:', migrationErr);
  }
}

async function initDatabaseInternal(db: any): Promise<void> {
  if (Platform.OS === 'web') {
    await webDb.init();
    await seedInitialData(webDb);
    return;
  }

  try {
    await db.execAsync('PRAGMA journal_mode = WAL;');
  } catch {}
  try {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  } catch {}

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS collectors (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone_number TEXT UNIQUE NOT NULL,
      pin_hash TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING_APPROVAL',
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
      has_received_hand INTEGER DEFAULT 0,
      hand_received_date TEXT,
      total_paid_amount REAL DEFAULT 0,
      paid_hands_count INTEGER DEFAULT 0,
      paid_until_date TEXT,
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
      hands_covered INTEGER DEFAULT 1,
      type TEXT NOT NULL,
      payment_method TEXT DEFAULT 'CASH',
      note TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_clients_collector ON clients(collector_id);
    CREATE INDEX IF NOT EXISTS idx_clients_business ON clients(business_id);
    CREATE INDEX IF NOT EXISTS idx_tx_collector ON transactions(collector_id);
    CREATE INDEX IF NOT EXISTS idx_tx_business ON transactions(business_id);
    CREATE INDEX IF NOT EXISTS idx_tx_client ON transactions(client_id);
    CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at_local);
  `);

  await runMigrations(db);
  await seedInitialData(db);
}

export async function getDatabase(): Promise<UniversalSQLiteDatabase> {
  if (Platform.OS === 'web') {
    if (!dbInitPromise) {
      dbInitPromise = initDatabaseInternal(webDb);
    }
    await dbInitPromise;
    return webDb;
  }

  if (!dbInstance) {
    try {
      dbInstance = await SQLite.openDatabaseAsync('sol.db');
      if (!dbInitPromise) {
        dbInitPromise = initDatabaseInternal(dbInstance);
      }
      await dbInitPromise;
    } catch (e) {
      console.warn('Native SQLite fallback to Web Adapter:', e);
      if (!dbInitPromise) {
        dbInitPromise = initDatabaseInternal(webDb);
      }
      await dbInitPromise;
      return webDb;
    }
  } else if (dbInitPromise) {
    await dbInitPromise;
  }

  return dbInstance;
}

export async function initDatabase(): Promise<void> {
  await getDatabase();
}

async function seedInitialData(db: UniversalSQLiteDatabase): Promise<void> {
  const collector = await db.getFirstAsync<{ id: string }>('SELECT id FROM collectors LIMIT 1');

  if (!collector) {
    const collectorId = 'c011ec70-0000-0000-0000-000000000001';
    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];

    // 1. Seed Active Demo Collector with encrypted 4-digit PIN '1234'
    await db.runAsync(
      `INSERT INTO collectors (id, full_name, phone_number, pin_hash, status, zone, created_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      [
        collectorId,
        'Jean-Baptiste Pierre',
        '+50937123456',
        hashPin('1234'), // Encrypted PIN
        'Marché Salomon (Port-au-Prince)',
        now,
      ]
    );

    // 2. Seed Default Business ("Sol Mache Klnik 2026", 10 enfants @ 250 HTG = 2,500 HTG)
    const businessId = uuidv4();
    const startDate = todayStr;
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await db.runAsync(
      `INSERT INTO business_configs (id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, created_at)
       VALUES (?, ?, ?, 'SABOTAY', 250, 'DAILY', 10, ?, ?, 'ACTIVE', ?)`,
      [
        businessId,
        collectorId,
        'Sol Mache Klnik 2026',
        startDate,
        endDate,
        now,
      ]
    );

    await setActiveBusinessId(businessId);

    // 3. Seed Sample Children (Membres)
    const sampleClients = [
      {
        id: '11111111-0000-0000-0000-000000000001',
        name: 'Marie-Carmel Joseph',
        phone: '+50938112233',
        type: 'SABOTAY',
        daily: 250,
        balance: 2250,
        rank: 1,
        hasHand: 1,
        handDate: todayStr,
        totalPaid: 2500,
        paidHands: 10,
        paidUntil: todayStr,
        token: 'SOL-MCJ01',
      },
      {
        id: '22222222-0000-0000-0000-000000000002',
        name: 'Jean-Robert Estimé',
        phone: '+50937445566',
        type: 'SOL',
        daily: 250,
        balance: 1750,
        rank: 2,
        hasHand: 0,
        handDate: null,
        totalPaid: 1750,
        paidHands: 7,
        paidUntil: todayStr,
        token: 'SOL-JRE02',
      },
      {
        id: '33333333-0000-0000-0000-000000000003',
        name: 'Dieula Saint-Juste',
        phone: '+50946778899',
        type: 'SABOTAY',
        daily: 250,
        balance: 750,
        rank: 3,
        hasHand: 0,
        handDate: null,
        totalPaid: 750,
        paidHands: 3,
        paidUntil: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Retard de 2 mains
        token: 'SOL-DSJ03',
      },
      {
        id: '44444444-0000-0000-0000-000000000004',
        name: 'Fritzner Dorce',
        phone: '+50931223344',
        type: 'SOL',
        daily: 250,
        balance: 2000,
        rank: 4,
        hasHand: 0,
        handDate: null,
        totalPaid: 2000,
        paidHands: 8,
        paidUntil: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 jours d'avance
        token: 'SOL-FDO04',
      },
    ];

    for (const c of sampleClients) {
      await db.runAsync(
        `INSERT INTO clients (id, business_id, collector_id, full_name, phone_number, type, daily_amount, current_balance, payout_rank, has_received_payout, has_received_hand, hand_received_date, total_paid_amount, paid_hands_count, paid_until_date, qr_code_token, created_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
        [
          c.id,
          businessId,
          collectorId,
          c.name,
          c.phone,
          c.type,
          c.daily,
          c.balance,
          c.rank,
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

      const txId = uuidv4();
      await db.runAsync(
        `INSERT INTO transactions (id, client_id, collector_id, sol_group_id, business_id, amount, hands_covered, type, payment_method, note, created_at_local, sync_status)
         VALUES (?, ?, ?, NULL, ?, ?, 1, 'CONTRIBUTION', 'CASH', 'Cotisation régulière', ?, 'SYNCED')`,
        [
          txId,
          c.id,
          collectorId,
          businessId,
          c.daily,
          now,
        ]
      );
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

export async function isCollectorPinTaken(pin: string, excludeCollectorId?: string): Promise<boolean> {
  const db = await getDatabase();
  const hashed = hashPin(pin);

  const rows = await db.getAllAsync<{ id: string; pin_hash: string }>(`SELECT id, pin_hash FROM collectors`);

  return rows.some(
    (c) =>
      c.id !== excludeCollectorId &&
      (c.pin_hash === hashed || c.pin_hash === pin.trim())
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
    `SELECT id, phone_number FROM clients WHERE collector_id = ?`,
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
