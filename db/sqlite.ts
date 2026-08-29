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
  audit_logs: any[];
  sync_logs: any[];
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
    audit_logs: [],
    sync_logs: [],
  };

  async init() {
    try {
      const saved = await AsyncStorage.getItem('SOL_WEB_DB_STORE');
      if (saved) {
        this.data = JSON.parse(saved);
        if (Array.isArray(this.data.clients)) {
          this.data.clients.forEach((c) => {
            if (!c.hands_count || c.hands_count < 1) c.hands_count = 1;
            if (c.received_hands_count === undefined || c.received_hands_count === null) c.received_hands_count = 0;
          });
        }
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
        const columnsMatch = cleanSql.match(/INSERT (?:OR REPLACE )?INTO\s+clients\s*\(([^)]+)\)/i);
        const columnNames = columnsMatch
          ? columnsMatch[1].split(',').map((c) => c.trim().toLowerCase())
          : [];

        let clientObj: any = {
          sync_status: 'PENDING',
          hands_count: 1,
          received_hands_count: 0,
          has_received_payout: 0,
          has_received_hand: 0,
          hand_received_date: null,
          total_paid_amount: 0,
          paid_hands_count: 0,
          current_balance: 0,
        };

        if (columnNames.length > 0 && columnNames.length === params.length) {
          columnNames.forEach((col, idx) => {
            clientObj[col] = params[idx];
          });
        } else {
          const [
            id, business_id, collector_id, full_name, phone_number, type,
            daily_amount, current_balance, payout_rank, payout_ranks, hands_count
          ] = params;
          clientObj = {
            ...clientObj,
            id, business_id, collector_id, full_name, phone_number, type,
            daily_amount, current_balance, payout_rank, payout_ranks, hands_count
          };
        }

        clientObj.hands_count = Math.max(1, Number(clientObj.hands_count || 1));
        clientObj.daily_amount = Number(clientObj.daily_amount || 0);
        clientObj.current_balance = Number(clientObj.current_balance || 0);
        clientObj.payout_rank = clientObj.payout_rank !== null && clientObj.payout_rank !== undefined ? Number(clientObj.payout_rank) : null;
        clientObj.payout_ranks = clientObj.payout_ranks || (clientObj.payout_rank ? String(clientObj.payout_rank) : null);
        clientObj.total_paid_amount = Number(clientObj.total_paid_amount || clientObj.current_balance || 0);
        clientObj.paid_hands_count = Number(clientObj.paid_hands_count || 0);
        clientObj.has_received_hand = clientObj.has_received_hand ? 1 : 0;
        clientObj.has_received_payout = clientObj.has_received_payout ? 1 : 0;

        const existingIdx = this.data.clients.findIndex((c) => c.id === clientObj.id || (clientObj.qr_code_token && c.qr_code_token === clientObj.qr_code_token));
        if (existingIdx >= 0) {
          this.data.clients[existingIdx] = { ...this.data.clients[existingIdx], ...clientObj };
        } else {
          this.data.clients.push(clientObj);
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
      } else if (tableName === 'audit_logs') {
        const [id, user_id, user_role, action, entity_type, entity_id, old_data, new_data, reason, created_at, sync_status] = params;
        this.data.audit_logs.unshift({
          id, user_id, user_role, action, entity_type, entity_id,
          old_data: old_data || null, new_data: new_data || null, reason: reason || null,
          created_at, sync_status: sync_status || 'PENDING'
        });
      } else if (tableName === 'sync_logs') {
        const [id, table_name, entity_id, action, status, attempts_count, last_error, created_at, synced_at] = params;
        this.data.sync_logs.unshift({
          id, table_name, entity_id, action, status: status || 'PENDING',
          attempts_count: Number(attempts_count || 0), last_error: last_error || null,
          created_at, synced_at: synced_at || null
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
      if (cleanSql.includes('count(*) as count') && (cleanSql.includes('SUM(COALESCE(hands_count, 1))') || cleanSql.includes('total_hands'))) {
        let filtered = this.data.clients;
        if (cleanSql.includes('WHERE collector_id = ?')) {
          filtered = filtered.filter((c) => c.collector_id === params[0]);
        }
        const total = filtered.reduce((sum, c) => sum + Math.max(1, Number(c.hands_count || 1)), 0);
        return [{ count: filtered.length, total, total_hands: total }] as any;
      }
      if (cleanSql.includes('SUM(COALESCE(hands_count, 1))') || cleanSql.includes('SUM(hands_count)')) {
        let filtered = this.data.clients;
        if (cleanSql.includes('WHERE collector_id = ?')) {
          filtered = filtered.filter((c) => c.collector_id === params[0]);
        }
        const total = filtered.reduce((sum, c) => sum + Math.max(1, Number(c.hands_count || 1)), 0);
        return [{ total, total_hands: total }] as any;
      }
      if (cleanSql.includes('count(*) as count')) {
        let filtered = this.data.clients;
        if (cleanSql.includes('WHERE collector_id = ?')) {
          filtered = filtered.filter((c) => c.collector_id === params[0]);
        }
        return [{ count: filtered.length }] as any;
      }
      let result = [...this.data.clients];
      if (cleanSql.includes('WHERE id = ?')) {
        result = result.filter((c) => c.id === params[0]);
      } else if (cleanSql.includes('WHERE collector_id = ?')) {
        result = result.filter((c) => c.collector_id === params[0]);
      } else if (cleanSql.includes('qr_code_token = ? OR id = ?')) {
        result = result.filter((c) => c.qr_code_token === params[0] || c.id === params[1]);
      }
      if (cleanSql.includes('ORDER BY payout_rank ASC')) {
        result.sort((a, b) => (Number(a.payout_rank) || 0) - (Number(b.payout_rank) || 0));
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

    if (upperSql.includes('FROM AUDIT_LOGS')) {
      let logs = [...this.data.audit_logs];
      if (cleanSql.includes('action = ?')) {
        logs = logs.filter((l) => l.action === params[0]);
      }
      return logs as any;
    }

    if (upperSql.includes('FROM SYNC_LOGS')) {
      let logs = [...this.data.sync_logs];
      if (cleanSql.includes('status = ?')) {
        logs = logs.filter((l) => l.status === params[0]);
      }
      return logs as any;
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

async function safeAddColumn(db: UniversalSQLiteDatabase, table: string, colName: string, colDef: string): Promise<void> {
  try {
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    const colNames = (columns || []).map((c: any) => c.name);
    if (!colNames.includes(colName)) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${colDef};`);
    }
  } catch (e) {
    console.warn(`Migration notice for ${table}.${colName}:`, e);
  }
}

async function runMigrations(db: UniversalSQLiteDatabase): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // 1. Clients migrations
    await safeAddColumn(db, 'clients', 'business_id', 'business_id TEXT');
    await safeAddColumn(db, 'clients', 'payout_rank', 'payout_rank INTEGER');
    await safeAddColumn(db, 'clients', 'has_received_payout', 'has_received_payout INTEGER DEFAULT 0');
    await safeAddColumn(db, 'clients', 'has_received_hand', 'has_received_hand INTEGER DEFAULT 0');
    await safeAddColumn(db, 'clients', 'hand_received_date', 'hand_received_date TEXT');
    await safeAddColumn(db, 'clients', 'total_paid_amount', 'total_paid_amount REAL DEFAULT 0');
    await safeAddColumn(db, 'clients', 'paid_hands_count', 'paid_hands_count INTEGER DEFAULT 0');
    await safeAddColumn(db, 'clients', 'paid_until_date', 'paid_until_date TEXT');
    await safeAddColumn(db, 'clients', 'hands_count', 'hands_count INTEGER DEFAULT 1');
    await safeAddColumn(db, 'clients', 'received_hands_count', 'received_hands_count INTEGER DEFAULT 0');
    await safeAddColumn(db, 'clients', 'payout_ranks', 'payout_ranks TEXT');

    try {
      await db.runAsync(`UPDATE clients SET hands_count = 1 WHERE hands_count IS NULL OR hands_count < 1;`);
      await db.runAsync(`UPDATE clients SET received_hands_count = 0 WHERE received_hands_count IS NULL;`);
    } catch {}

    // 2. Transactions migrations
    await safeAddColumn(db, 'transactions', 'business_id', 'business_id TEXT');
    await safeAddColumn(db, 'transactions', 'payment_method', "payment_method TEXT DEFAULT 'CASH'");
    await safeAddColumn(db, 'transactions', 'hands_covered', 'hands_covered INTEGER DEFAULT 1');
    await safeAddColumn(db, 'transactions', 'note', 'note TEXT');
    await safeAddColumn(db, 'transactions', 'idempotency_key', 'idempotency_key TEXT');
    await safeAddColumn(db, 'transactions', 'is_reversed', 'is_reversed INTEGER DEFAULT 0');
    await safeAddColumn(db, 'transactions', 'reversal_id', 'reversal_id TEXT');
    await safeAddColumn(db, 'transactions', 'reversed_at', 'reversed_at TEXT');

    try {
      await db.runAsync(`UPDATE transactions SET type = 'SOL_CONTRIBUTION' WHERE type = 'CONTRIBUTION';`);
      await db.runAsync(`UPDATE transactions SET type = 'SOL_PAYOUT' WHERE type = 'HAND_PAYOUT';`);
    } catch {}

    // 3. Collectors migrations
    await safeAddColumn(db, 'collectors', 'zone', 'zone TEXT');
    await safeAddColumn(db, 'collectors', 'status', "status TEXT DEFAULT 'PENDING_APPROVAL'");

    // 4. Business configs migrations
    await safeAddColumn(db, 'business_configs', 'cycle_status', "cycle_status TEXT DEFAULT 'ACTIVE'");
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

  // 1. Create Base Tables
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
      sync_status TEXT DEFAULT 'PENDING',
      idempotency_key TEXT,
      is_reversed INTEGER DEFAULT 0,
      reversal_id TEXT,
      reversed_at TEXT
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
  `);

  // 2. Ensure all table columns exist on upgraded/existing databases
  await runMigrations(db);

  // 3. Create Indexes safely
  const indexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_clients_collector ON clients(collector_id);',
    'CREATE INDEX IF NOT EXISTS idx_clients_business ON clients(business_id);',
    'CREATE INDEX IF NOT EXISTS idx_tx_collector ON transactions(collector_id);',
    'CREATE INDEX IF NOT EXISTS idx_tx_business ON transactions(business_id);',
    'CREATE INDEX IF NOT EXISTS idx_tx_client ON transactions(client_id);',
    'CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at_local);',
    'CREATE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions(idempotency_key);',
    'CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);',
    'CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);',
    'CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_logs(status);',
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
      dbInitPromise = initDatabaseInternal(dbInstance);
      await dbInitPromise;
    } catch (e) {
      console.warn('Native SQLite fallback to Web Adapter:', e);
      dbInitPromise = initDatabaseInternal(webDb);
      await dbInitPromise;
      return webDb;
    }
  } else if (dbInitPromise) {
    try {
      await dbInitPromise;
    } catch {
      // Retry init if previous failed
      dbInitPromise = initDatabaseInternal(dbInstance);
      await dbInitPromise;
    }
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
