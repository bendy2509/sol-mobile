import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { SyncState, Transaction, Client } from '@/types';
import { getActiveCollectorId, getDatabase } from './sqlite';
import { markClientsSynced, markTransactionsSynced } from './transactionRepo';

type SyncSubscriber = (state: SyncState) => void;

class SyncEngine {
  private static instance: SyncEngine;
  private state: SyncState = {
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null,
    error: null,
  };
  private subscribers: Set<SyncSubscriber> = new Set();
  private timer: any = null;

  private constructor() {
    this.refreshPendingCount();
  }

  public static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine();
    }
    return SyncEngine.instance;
  }

  public subscribe(callback: SyncSubscriber): () => void {
    this.subscribers.add(callback);
    callback({ ...this.state });
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notify() {
    for (const sub of this.subscribers) {
      try {
        sub({ ...this.state });
      } catch (err) {
        console.warn('Sync subscriber error:', err);
      }
    }
  }

  public getState(): SyncState {
    return { ...this.state };
  }

  public async refreshPendingCount(): Promise<number> {
    try {
      const db = await getDatabase();
      const txRow = await db.getFirstAsync<{ count: number }>(
        `SELECT count(*) as count FROM transactions WHERE sync_status = 'PENDING'`
      );
      const clRow = await db.getFirstAsync<{ count: number }>(
        `SELECT count(*) as count FROM clients WHERE sync_status = 'PENDING'`
      );
      const totalPending = (txRow?.count || 0) + (clRow?.count || 0);

      this.state.pendingCount = totalPending;
      this.notify();
      return totalPending;
    } catch {
      return this.state.pendingCount;
    }
  }

  public startAutoSync(intervalMs = 30000) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.syncAll().catch(() => {});
    }, intervalMs);
  }

  public stopAutoSync() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async syncAll(): Promise<{ success: boolean; pushedTransactions: number; error?: string }> {
    if (this.state.isSyncing) {
      return { success: false, pushedTransactions: 0, error: 'Synchronisation déjà en cours' };
    }

    this.state.isSyncing = true;
    this.state.error = null;
    this.notify();

    try {
      // If remote Supabase credentials are not configured yet, operate in local offline mode
      if (!isSupabaseConfigured) {
        await this.refreshPendingCount();
        this.state.isSyncing = false;
        this.state.isOnline = false;
        this.notify();
        return { success: true, pushedTransactions: 0 };
      }

      const db = await getDatabase();
      const collectorId = await getActiveCollectorId();

      // 1. Check network connectivity
      const isOnline = await this.checkNetwork();
      this.state.isOnline = isOnline;

      if (!isOnline) {
        this.state.isSyncing = false;
        this.notify();
        return { success: false, pushedTransactions: 0, error: 'Aucune connexion internet' };
      }

      // 2. Push Pending Clients
      const pendingClients = await db.getAllAsync<{
        id: string;
        collector_id: string;
        full_name: string;
        phone_number: string;
        type: string;
        daily_amount: number;
        current_balance: number;
        qr_code_token: string;
        created_at: string;
      }>(`SELECT * FROM clients WHERE sync_status = 'PENDING' LIMIT 50`);

      if (pendingClients.length > 0) {
        const payload = pendingClients.map((c) => ({
          id: c.id,
          collector_id: c.collector_id,
          full_name: c.full_name,
          phone_number: c.phone_number,
          type: c.type,
          daily_amount: c.daily_amount,
          current_balance: c.current_balance,
          qr_code_token: c.qr_code_token,
          created_at: c.created_at,
        }));

        const { error: clientError } = await supabase
          .from('clients')
          .upsert(payload, { onConflict: 'id', ignoreDuplicates: false });

        if (!clientError) {
          const clientIds = pendingClients.map((c) => c.id);
          await markClientsSynced(clientIds);
        } else {
          console.warn('Clients sync notice:', clientError.message);
        }
      }

      // 3. Push Pending Transactions (Batch Push)
      const pendingTx = await db.getAllAsync<{
        id: string;
        client_id: string;
        collector_id: string;
        sol_group_id: string | null;
        business_id: string | null;
        amount: number;
        type: string;
        payment_method: string;
        created_at_local: string;
      }>(`SELECT * FROM transactions WHERE sync_status = 'PENDING' LIMIT 100`);

      let pushedTxCount = 0;
      if (pendingTx.length > 0) {
        const txPayload = pendingTx.map((t) => ({
          id: t.id,
          client_id: t.client_id,
          collector_id: t.collector_id,
          sol_group_id: t.sol_group_id,
          business_id: t.business_id,
          amount: t.amount,
          type: t.type,
          payment_method: t.payment_method,
          created_at_local: t.created_at_local,
          sync_status: 'SYNCED',
        }));

        const { error: txError } = await supabase
          .from('transactions')
          .upsert(txPayload, { onConflict: 'id', ignoreDuplicates: true });

        if (!txError) {
          const txIds = pendingTx.map((t) => t.id);
          await markTransactionsSynced(txIds);
          pushedTxCount = txIds.length;
        } else {
          console.warn('Transactions push notice:', txError.message);
        }
      }

      // 4. Pull Remote Clients
      try {
        const { data: remoteClients } = await supabase
          .from('clients')
          .select('*')
          .eq('collector_id', collectorId)
          .limit(200);

        if (remoteClients && remoteClients.length > 0) {
          for (const rc of remoteClients) {
            await db.runAsync(
              `INSERT OR REPLACE INTO clients (id, collector_id, full_name, phone_number, type, daily_amount, current_balance, qr_code_token, created_at, sync_status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
              [
                rc.id,
                rc.collector_id,
                rc.full_name,
                rc.phone_number,
                rc.type,
                rc.daily_amount,
                rc.current_balance,
                rc.qr_code_token,
                rc.created_at,
              ]
            );
          }
        }
      } catch (pullErr) {
        console.warn('Remote clients pull notice:', pullErr);
      }

      // Update state
      await this.refreshPendingCount();
      this.state.lastSyncedAt = new Date().toISOString();
      this.state.isSyncing = false;
      this.state.isOnline = true;
      this.notify();

      return { success: true, pushedTransactions: pushedTxCount };
    } catch (err: any) {
      this.state.isSyncing = false;
      this.state.isOnline = false;
      this.state.error = err?.message || 'Erreur lors de la synchronisation';
      this.notify();
      return { success: false, pushedTransactions: 0, error: this.state.error || undefined };
    }
  }

  private async checkNetwork(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('https://www.google.com/generate_204', {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.status === 204 || res.ok;
    } catch {
      return false;
    }
  }
}

export const syncEngine = SyncEngine.getInstance();
