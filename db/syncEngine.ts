import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { SyncState } from '@/types';
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

      // 2. Ensure all Local Collectors exist in Supabase (Reconcile by phone_number)
      const localCollectors = await db.getAllAsync<{
        id: string;
        full_name: string;
        phone_number: string;
        pin_hash: string;
        status: string;
        zone: string | null;
        created_at?: string;
      }>(`SELECT * FROM collectors`);

      for (const c of localCollectors) {
        try {
          const { data: existingCol } = await supabase
            .from('collectors')
            .select('id, phone_number')
            .or(`id.eq.${c.id},phone_number.eq.${c.phone_number}`)
            .maybeSingle();

          if (existingCol) {
            if (existingCol.id === c.id) {
              await supabase
                .from('collectors')
                .update({
                  full_name: c.full_name,
                  phone_number: c.phone_number,
                  pin_hash: c.pin_hash,
                  status: c.status || 'ACTIVE',
                  zone: c.zone || null,
                })
                .eq('id', c.id);
            } else {
              const actualCollectorId = existingCol.id;
              await supabase
                .from('collectors')
                .update({
                  full_name: c.full_name,
                  pin_hash: c.pin_hash,
                  status: c.status || 'ACTIVE',
                  zone: c.zone || null,
                })
                .eq('id', actualCollectorId);

              await db.withTransactionAsync(async () => {
                await db.runAsync(`UPDATE collectors SET id = ? WHERE id = ?`, [actualCollectorId, c.id]);
                await db.runAsync(`UPDATE business_configs SET collector_id = ? WHERE collector_id = ?`, [actualCollectorId, c.id]);
                await db.runAsync(`UPDATE clients SET collector_id = ? WHERE collector_id = ?`, [actualCollectorId, c.id]);
                await db.runAsync(`UPDATE transactions SET collector_id = ? WHERE collector_id = ?`, [actualCollectorId, c.id]);
              });
            }
          } else {
            await supabase.from('collectors').insert({
              id: c.id,
              full_name: c.full_name,
              phone_number: c.phone_number,
              pin_hash: c.pin_hash,
              status: c.status || 'ACTIVE',
              zone: c.zone || null,
              created_at: c.created_at || new Date().toISOString(),
            });
          }
        } catch (colErr: any) {
          // Gracefully suppress duplicate notices during concurrent sync cycles
          if (!colErr?.message?.includes('duplicate')) {
            console.warn('Collectors sync notice:', colErr?.message);
          }
        }
      }

      // 3. Ensure all Local Businesses exist in Supabase
      const localBusinesses = await db.getAllAsync<{
        id: string;
        collector_id: string;
        name: string;
        type: string;
        contribution_amount: number;
        frequency: string;
        total_slots: number;
        start_date: string;
        end_date: string;
        status: string;
        created_at: string;
      }>(`SELECT * FROM business_configs`);

      if (localBusinesses.length > 0) {
        const bizPayload = localBusinesses.map((b) => ({
          id: b.id,
          collector_id: b.collector_id,
          name: b.name,
          type: b.type,
          contribution_amount: Number(b.contribution_amount),
          frequency: b.frequency,
          total_slots: Number(b.total_slots),
          start_date: b.start_date,
          end_date: b.end_date,
          status: b.status || 'ACTIVE',
          created_at: b.created_at || new Date().toISOString(),
        }));
        const { error: bizErr } = await supabase
          .from('business_configs')
          .upsert(bizPayload, { onConflict: 'id', ignoreDuplicates: false });
        if (bizErr) {
          console.warn('Business configs sync notice:', bizErr.message);
        }
      }

      // 4. Push Pending Clients (Reconcile by qr_code_token)
      const pendingClients = await db.getAllAsync<{
        id: string;
        collector_id: string;
        business_id: string | null;
        full_name: string;
        phone_number: string;
        type: string;
        daily_amount: number;
        current_balance: number;
        payout_rank: number | null;
        has_received_payout: number;
        qr_code_token: string;
        created_at: string;
      }>(`SELECT * FROM clients WHERE sync_status = 'PENDING' LIMIT 50`);

      if (pendingClients.length > 0) {
        for (const cl of pendingClients) {
          const { data: clData, error: clientError } = await supabase
            .from('clients')
            .upsert(
              {
                id: cl.id,
                collector_id: cl.collector_id,
                business_id: cl.business_id || null,
                full_name: cl.full_name,
                phone_number: cl.phone_number,
                type: cl.type,
                daily_amount: Number(cl.daily_amount),
                current_balance: Number(cl.current_balance),
                payout_rank: cl.payout_rank !== null ? Number(cl.payout_rank) : null,
                has_received_payout: Boolean(cl.has_received_payout),
                qr_code_token: cl.qr_code_token,
                created_at: cl.created_at || new Date().toISOString(),
              },
              { onConflict: 'qr_code_token' }
            )
            .select('id, qr_code_token')
            .single();

          if (!clientError) {
            if (clData && clData.id !== cl.id) {
              const actualClientId = clData.id;
              await db.withTransactionAsync(async () => {
                await db.runAsync(`UPDATE clients SET id = ?, sync_status = 'SYNCED' WHERE id = ?`, [actualClientId, cl.id]);
                await db.runAsync(`UPDATE transactions SET client_id = ? WHERE client_id = ?`, [actualClientId, cl.id]);
              });
            } else {
              await markClientsSynced([cl.id]);
            }
          } else {
            console.warn('Clients sync notice:', clientError.message);
          }
        }
      }

      // 5. Push Pending Transactions (Batch Push)
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
        const txPayload = pendingTx.map((t) => {
          let mappedType = 'SOL_CONTRIBUTION';
          if (t.type === 'SABOTAY_DEPOSIT') mappedType = 'SABOTAY_DEPOSIT';
          else if (t.type === 'SOL_CONTRIBUTION' || t.type === 'CONTRIBUTION') mappedType = 'SOL_CONTRIBUTION';
          else if (t.type === 'HAND_PAYOUT' || t.type === 'SOL_PAYOUT') mappedType = 'SOL_PAYOUT';
          else if (t.type === 'WITHDRAWAL') mappedType = 'WITHDRAWAL';

          return {
            id: t.id,
            client_id: t.client_id,
            collector_id: t.collector_id,
            sol_group_id: t.sol_group_id || null,
            business_id: t.business_id || null,
            amount: Number(t.amount),
            type: mappedType,
            payment_method: t.payment_method || 'CASH',
            created_at_local: t.created_at_local || new Date().toISOString(),
            sync_status: 'SYNCED',
          };
        });

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

      // 6. Pull Remote Clients
      try {
        const { data: remoteClients } = await supabase
          .from('clients')
          .select('*')
          .eq('collector_id', collectorId)
          .limit(200);

        if (remoteClients && remoteClients.length > 0) {
          for (const rc of remoteClients) {
            await db.runAsync(
              `INSERT OR REPLACE INTO clients (id, business_id, collector_id, full_name, phone_number, type, daily_amount, current_balance, payout_rank, has_received_payout, qr_code_token, created_at, sync_status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
              [
                rc.id,
                rc.business_id || null,
                rc.collector_id,
                rc.full_name,
                rc.phone_number,
                rc.type,
                Number(rc.daily_amount),
                Number(rc.current_balance),
                rc.payout_rank || null,
                rc.has_received_payout ? 1 : 0,
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
