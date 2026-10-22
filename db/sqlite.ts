import 'react-native-get-random-values';
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { Collector, BusinessConfig, UserStatus } from '@/types';
import { arePhoneNumbersEqual, extractRaw8Digits, normalizePhoneNumber } from '@/lib/phoneUtils';
import { hashPin, verifyPinHash } from '@/lib/crypto';
import { runVersionedMigrations } from './migrations';
import { parseInsert } from './sqlInsertParser';
import { localDateString } from '@/lib/dates';
import { DEMO_BUSINESS_NAME, DEMO_COLLECTOR_ID, DEMO_PHONE, DEMO_PIN, isUntouchedDemoAccount, shouldSeedDemo } from './demoAccount';

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
  transactions: any[];
  cash_closures: any[];
  audit_logs: any[];
  sync_logs: any[];
  deleted_clients: any[];
  closed_cycles: any[];
}

/**
 * v2: column-aware INSERT parsing. Browsers that stored the demo with shifted columns
 * (0 HTG per hand, a date as zone) start again from a fresh, coherent demo.
 */
const WEB_STORE_KEY = 'SOL_WEB_DB_STORE_V2';

class WebSQLiteAdapter {
  private data: WebTableStore = {
    collectors: [],
    business_configs: [],
    clients: [],
    transactions: [],
    cash_closures: [],
    audit_logs: [],
    sync_logs: [],
    deleted_clients: [],
    closed_cycles: [],
  };

  async init() {
    try {
      const saved = await AsyncStorage.getItem(WEB_STORE_KEY);
      if (saved) {
        this.data = JSON.parse(saved);
        if (Array.isArray(this.data.clients)) {
          this.data.clients.forEach((c) => {
            if (!c.hands_count || c.hands_count < 1) c.hands_count = 1;
            if (c.received_hands_count === undefined || c.received_hands_count === null) c.received_hands_count = 0;
          });
        }
        if (!Array.isArray(this.data.deleted_clients)) {
          this.data.deleted_clients = [];
        }
      }
    } catch {}
  }

  private async persist() {
    try {
      await AsyncStorage.setItem(WEB_STORE_KEY, JSON.stringify(this.data));
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
        const parsed = parseInsert(cleanSql, params);
        let item: any = { status: 'ACTIVE', role: 'MANAGER', sync_status: 'PENDING' };
        if (parsed) {
          item = { ...item, ...parsed.values };
        } else {
          const [id, full_name, phone_number, pin_hash, status, zone, created_at] = params;
          item = { id, full_name, phone_number, pin_hash, status: status || 'ACTIVE', role: 'MANAGER', zone, created_at };
        }
        const existingIdx = this.data.collectors.findIndex((c) => c.id === item.id || c.phone_number === item.phone_number);
        if (existingIdx >= 0) {
          this.data.collectors[existingIdx] = { ...this.data.collectors[existingIdx], ...item };
        } else {
          this.data.collectors.push(item);
        }
      } else if (tableName === 'business_configs') {
        const parsed = parseInsert(cleanSql, params);
        const [p_id, p_collector, p_name, p_type, p_amount, p_frequency, p_slots, p_start, p_end, p_status, p_created] = params;
        const v: any = parsed
          ? parsed.values
          : { id: p_id, collector_id: p_collector, name: p_name, type: p_type, contribution_amount: p_amount, frequency: p_frequency, total_slots: p_slots, start_date: p_start, end_date: p_end, status: p_status, created_at: p_created };
        const existingIdx = this.data.business_configs.findIndex((b) => b.id === v.id);
        const item = {
          ...v,
          contribution_amount: Number(v.contribution_amount),
          total_slots: Number(v.total_slots),
          status: v.status || 'ACTIVE',
          cycle_status: v.cycle_status || 'ACTIVE',
        };
        if (existingIdx >= 0) {
          this.data.business_configs[existingIdx] = item;
        } else {
          this.data.business_configs.push(item);
        }
      } else if (tableName === 'clients') {
        const parsed = parseInsert(cleanSql, params);

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

        if (parsed) {
          clientObj = { ...clientObj, ...parsed.values };
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
        const parsed = parseInsert(cleanSql, params);
        const [p_id, p_client, p_collector, p_group, p_business, p_amount, p_hands, p_type, p_method, p_note, p_created] = params;
        const v: any = parsed
          ? parsed.values
          : { id: p_id, client_id: p_client, collector_id: p_collector, sol_group_id: p_group, business_id: p_business, amount: p_amount, hands_covered: p_hands, type: p_type, payment_method: p_method, note: p_note, created_at_local: p_created };
        this.data.transactions.unshift({
          ...v,
          member_id: v.client_id,
          amount: Number(v.amount),
          hands_covered: Number(v.hands_covered || 1),
          payment_method: v.payment_method || 'CASH',
          note: v.note || null,
          sync_status: v.sync_status || 'PENDING',
          is_reversed: Number(v.is_reversed || 0),
        });
      } else if (tableName === 'cash_closures') {
        const parsed = parseInsert(cleanSql, params);
        const [p_id, p_collector, p_date, p_declared, p_system, p_reason, p_created] = params;
        const v: any = parsed
          ? parsed.values
          : { id: p_id, collector_id: p_collector, closure_date: p_date, total_cash_declared: p_declared, total_system_calculated: p_system, discrepancy_reason: p_reason, created_at: p_created };
        this.data.cash_closures.push({
          ...v,
          total_cash_declared: Number(v.total_cash_declared),
          total_system_calculated: Number(v.total_system_calculated),
          status: v.status || 'SUBMITTED',
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
      } else if (tableName === 'deleted_clients') {
        let id: string, qr_code_token: string | null = null, phone_number: string | null = null, collector_id: string, deleted_at: string, sync_status = 'PENDING';
        if (params.length >= 6) {
          [id, qr_code_token, phone_number, collector_id, deleted_at, sync_status] = params;
        } else {
          [id, collector_id, deleted_at, sync_status] = params;
        }
        if (!Array.isArray(this.data.deleted_clients)) this.data.deleted_clients = [];
        const existingIdx = this.data.deleted_clients.findIndex((d) => d.id === id || (qr_code_token && d.qr_code_token === qr_code_token));
        const entry = { id, qr_code_token, phone_number, collector_id, deleted_at, sync_status: sync_status || 'PENDING' };
        if (existingIdx >= 0) {
          this.data.deleted_clients[existingIdx] = entry;
        } else {
          this.data.deleted_clients.unshift(entry);
        }
      }
      await this.persist();
      return { lastInsertRowId: 1, changes: 1 };
    }

    if (upperSql.startsWith('UPDATE')) {
      const match = cleanSql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/is);
      if (match) {
        const tableName = match[1].toLowerCase() as keyof WebTableStore;
        const setClause = match[2];
        const whereClause = match[3] || '';

        const setPairs = setClause.split(',').map((p) => p.trim());
        let paramIdx = 0;
        const updates: Record<string, any> = {};

        for (const pair of setPairs) {
          const eqMatch = pair.match(/(\w+)\s*=\s*(.+)/);
          if (eqMatch) {
            const col = eqMatch[1].toLowerCase();
            const valExpr = eqMatch[2].trim();
            if (valExpr === '?') {
              updates[col] = params[paramIdx++];
            } else if (valExpr.toUpperCase() === 'NULL') {
              updates[col] = null;
            } else if (valExpr.startsWith("'") && valExpr.endsWith("'")) {
              updates[col] = valExpr.slice(1, -1);
            } else if (!isNaN(Number(valExpr))) {
              updates[col] = Number(valExpr);
            } else {
              updates[col] = valExpr;
            }
          }
        }

        const tableData = this.data[tableName];
        if (Array.isArray(tableData)) {
          let targets: any[] = [];
          if (whereClause) {
            const whereUpper = whereClause.toUpperCase();
            if (whereUpper.includes('COLLECTOR_ID = ?') && whereUpper.includes('BUSINESS_ID = ?')) {
              const cId = params[paramIdx++];
              const bId = params[paramIdx++];
              targets = tableData.filter((item: any) => item.collector_id === cId || item.business_id === bId);
            } else if (whereUpper.includes('ID = ?')) {
              const targetId = params[paramIdx++];
              targets = tableData.filter((item: any) => item.id === targetId);
            } else if (whereUpper.includes('COLLECTOR_ID = ?')) {
              const targetCollectorId = params[paramIdx++];
              targets = tableData.filter((item: any) => item.collector_id === targetCollectorId);
            } else if (whereUpper.includes('PHONE_NUMBER = ?')) {
              const targetPhone = params[paramIdx++];
              targets = tableData.filter((item: any) => item.phone_number === targetPhone);
            } else if (whereUpper.includes('CLIENT_ID = ?')) {
              const targetClientId = params[paramIdx++];
              targets = tableData.filter((item: any) => item.client_id === targetClientId || item.id === targetClientId);
            } else {
              targets = tableData;
            }
          } else {
            targets = tableData;
          }

          for (const item of targets) {
            Object.assign(item, updates);
            if ('hands_count' in updates) item.hands_count = Math.max(1, Number(item.hands_count || 1));
            if ('received_hands_count' in updates) item.received_hands_count = Number(item.received_hands_count || 0);
            if ('has_received_hand' in updates) item.has_received_hand = item.has_received_hand ? 1 : 0;
            if ('has_received_payout' in updates) item.has_received_payout = item.has_received_payout ? 1 : 0;
            if ('current_balance' in updates) item.current_balance = Number(item.current_balance || 0);
            if ('total_paid_amount' in updates) item.total_paid_amount = Number(item.total_paid_amount || 0);
            if ('paid_hands_count' in updates) item.paid_hands_count = Number(item.paid_hands_count || 0);
            if ('total_slots' in updates) item.total_slots = Number(item.total_slots || 0);
            if ('contribution_amount' in updates) item.contribution_amount = Number(item.contribution_amount || 0);
            if ('is_reversed' in updates) item.is_reversed = item.is_reversed ? 1 : 0;
          }
        }
      }
      await this.persist();
      return { lastInsertRowId: 0, changes: 1 };
    }

    if (upperSql.startsWith('DELETE')) {
      const match = cleanSql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/is);
      if (match) {
        const tableName = match[1].toLowerCase() as keyof WebTableStore;
        const whereClause = match[2] || '';
        let paramIdx = 0;

        const tableData = this.data[tableName];
        if (Array.isArray(tableData)) {
          if (whereClause) {
            const whereUpper = whereClause.toUpperCase();
            if (whereUpper.includes('COLLECTOR_ID = ?') && whereUpper.includes('BUSINESS_ID = ?')) {
              const cId = params[paramIdx++];
              const bId = params[paramIdx++];
              this.data[tableName] = tableData.filter((item: any) => item.collector_id !== cId && item.business_id !== bId) as any;
            } else if (whereUpper.includes('COLLECTOR_ID = ?')) {
              const cId = params[paramIdx++];
              this.data[tableName] = tableData.filter((item: any) => item.collector_id !== cId) as any;
            } else if (whereUpper.includes('BUSINESS_ID = ?')) {
              const bId = params[paramIdx++];
              this.data[tableName] = tableData.filter((item: any) => item.business_id !== bId) as any;
            } else if (whereUpper.includes('CLIENT_ID = ?')) {
              const cId = params[paramIdx++];
              this.data[tableName] = tableData.filter((item: any) => item.client_id !== cId) as any;
            } else if (whereUpper.includes('ID = ?')) {
              const targetId = params[paramIdx++];
              this.data[tableName] = tableData.filter((item: any) => item.id !== targetId) as any;
            } else {
              this.data[tableName] = [];
            }
          } else {
            this.data[tableName] = [];
          }
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
      if (!Array.isArray(this.data.deleted_clients)) this.data.deleted_clients = [];
      const deletedIds = new Set(this.data.deleted_clients.map((d: any) => d.id));
      const deletedTokens = new Set(this.data.deleted_clients.map((d: any) => d.qr_code_token).filter(Boolean));
      result = result.filter((c) => !deletedIds.has(c.id) && (!c.qr_code_token || !deletedTokens.has(c.qr_code_token)));

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
      let filtered = [...this.data.transactions];

      if (cleanSql.includes('WHERE')) {
        if (cleanSql.includes('is_reversed = 0')) {
          filtered = filtered.filter((t) => !t.is_reversed);
        }
        if (cleanSql.includes('collector_id = ?')) {
          const colParam = params[0];
          filtered = filtered.filter((t) => t.collector_id === colParam);
        }
        if (cleanSql.includes('client_id = ?') || cleanSql.includes('member_id = ?')) {
          const clientParam = params.find((p) => typeof p === 'string' && p.length > 5);
          if (clientParam) {
            filtered = filtered.filter((t) => t.client_id === clientParam || t.member_id === clientParam);
          }
        }
        // Date bounds: the parameter is the one at this '?' position in the statement
        const paramAt = (clause: string) => params[(cleanSql.slice(0, cleanSql.indexOf(clause)).match(/\?/g) || []).length];
        if (cleanSql.includes('created_at_local >= ?')) {
          const from = String(paramAt('created_at_local >= ?'));
          filtered = filtered.filter((t) => String(t.created_at_local) >= from);
        }
        if (cleanSql.includes('created_at_local < ?')) {
          const to = String(paramAt('created_at_local < ?'));
          filtered = filtered.filter((t) => String(t.created_at_local) < to);
        }
        if (cleanSql.includes(`'HAND_PAYOUT'`) || cleanSql.includes(`'SOL_PAYOUT'`)) {
          filtered = filtered.filter((t) => t.type === 'HAND_PAYOUT' || t.type === 'SOL_PAYOUT');
        } else if (cleanSql.includes(`'CONTRIBUTION'`) || cleanSql.includes(`'SABOTAY_DEPOSIT'`)) {
          filtered = filtered.filter((t) => t.type === 'CONTRIBUTION' || t.type === 'SABOTAY_DEPOSIT' || t.type === 'SOL_CONTRIBUTION');
        } else if (cleanSql.includes(`sync_status = 'PENDING'`)) {
          filtered = filtered.filter((t) => t.sync_status === 'PENDING');
        }
      }

      if (cleanSql.toLowerCase().includes('count(*)')) {
        const total = filtered.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
        return [{ count: filtered.length, total }] as any;
      }

      if (cleanSql.toUpperCase().includes('SUM(AMOUNT)') || cleanSql.includes('SUM(amount)')) {
        const total = filtered.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
        return [{ total }] as any;
      }

      let txs = filtered.map((t) => {
        const client = this.data.clients.find((c) => c.id === t.client_id || c.id === t.member_id);
        return {
          ...t,
          client_name: client?.full_name || 'Adhérent inconnu',
          member_name: client?.full_name || 'Adhérent inconnu',
          client_phone: client?.phone_number || '',
          member_phone: client?.phone_number || '',
        };
      });

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

    if (upperSql.includes('FROM DELETED_CLIENTS')) {
      if (!Array.isArray(this.data.deleted_clients)) this.data.deleted_clients = [];
      let list = [...this.data.deleted_clients];
      if (cleanSql.includes("WHERE sync_status = 'PENDING'")) {
        list = list.filter((d) => d.sync_status === 'PENDING');
      }
      return list as any;
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
    // time, so today's dashboard starts empty and the statuses (late, ahead) make sense.
    const now = new Date(Date.now() - 2 * day).toISOString();

    // 1. Seed Active Demo Collector with encrypted 4-digit PIN '1234'
    await db.runAsync(
      `INSERT INTO collectors (id, full_name, phone_number, pin_hash, status, zone, created_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      [
        collectorId,
        'Jean-Baptiste Pierre',
        DEMO_PHONE,
        hashPin(DEMO_PIN), // Encrypted PIN
        'Marché Salomon (Port-au-Prince)',
        now,
      ]
    );

    // 2. Seed the demo carnet: a daily sol of 4 members × 1 hand × 250 HTG (pot 1 000 HTG),
    //    started 2 days ago, so 3 hands are due today and the figures stay consistent.
    const businessId = uuidv4();
    const unit = 250;
    const startDate = isoDay(-2);
    const endDate = isoDay(1);

    await db.runAsync(
      `INSERT INTO business_configs (id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, cycle_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, collectorId, DEMO_BUSINESS_NAME, 'SOL', unit, 'DAILY', 4, startDate, endDate, 'ACTIVE', 'ACTIVE', now]
    );

    await setActiveBusinessId(businessId);

    // 3. Seed Sample Children (Membres)
    // paidHands ≤ 4 (the whole cycle); paid until = start + paidHands − 1 days
    const member = (id: string, name: string, phone: string, rank: number, paidHands: number, token: string, hasHand = 0) => ({
      id,
      name,
      phone,
      type: 'SOL',
      daily: unit,
      // Same as the ledger replay: a hand received is paid out of the balance
      balance: Math.max(0, paidHands * unit - (hasHand ? unit * 4 : 0)),
      rank,
      hasHand,
      handDate: hasHand ? isoDay(-2) : null,
      totalPaid: paidHands * unit,
      paidHands,
      paidUntil: isoDay(-2 + paidHands - 1),
      token,
    });
    const sampleClients = [
      member('11111111-0000-0000-0000-000000000001', 'Marie-Carmel Joseph', '+50938112233', 1, 4, 'SOL-MCJ01', 1), // en avance, main reçue
      member('22222222-0000-0000-0000-000000000002', 'Jean-Robert Estimé', '+50937445566', 2, 3, 'SOL-JRE02'), // à jour, reçoit la main
      member('33333333-0000-0000-0000-000000000003', 'Dieula Saint-Juste', '+50946778899', 3, 1, 'SOL-DSJ03'), // 2 mains de retard
      member('44444444-0000-0000-0000-000000000004', 'Fritzner Dorce', '+50931223344', 4, 2, 'SOL-FDO04'), // à encaisser aujourd'hui
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
          c.type,
          c.daily,
          c.balance,
          c.rank,
          String(c.rank),
          1,
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
          [uuidv4(), c.id, collectorId, businessId, unit * sampleClients.length, new Date(Date.parse(now) + 30_000).toISOString()]
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
