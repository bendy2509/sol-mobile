import { SyncLogEntry, SyncState } from '@/types';
import { getDatabase } from '@/db/sqlite';
import { syncPendingData } from '@/db/syncEngine';

/**
 * Aggregates live synchronization statistics across all local tables.
 */
export async function getSyncQueueSummary(): Promise<SyncState & { failedErrors: string[] }> {
  const db = await getDatabase();

  const txPending = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM transactions WHERE sync_status = 'PENDING'`
  );
  const txSynced = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM transactions WHERE sync_status = 'SYNCED'`
  );
  const clientPending = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM clients WHERE sync_status = 'PENDING'`
  );
  const clientSynced = await db.getFirstAsync<{ count: number }>(
    `SELECT count(*) as count FROM clients WHERE sync_status = 'SYNCED'`
  );

  const pendingCount = Number(txPending?.count || 0) + Number(clientPending?.count || 0);
  const syncedCount = Number(txSynced?.count || 0) + Number(clientSynced?.count || 0);

  // Fetch latest sync error if any from sync_logs
  const failedRows = await db.getAllAsync<{ last_error: string }>(
    `SELECT last_error FROM sync_logs WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT 5`
  );

  const failedErrors = failedRows.map((r) => r.last_error).filter(Boolean);

  return {
    isOnline: true,
    isSyncing: false,
    pendingCount,
    syncedCount,
    failedCount: failedErrors.length,
    lastSyncedAt: new Date().toISOString(),
    failedErrors,
  };
}

/**
 * Records a sync attempt into sync_logs table for traceability.
 */
export async function logSyncOperation(params: {
  id: string;
  tableName: string;
  entityId: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'PUSH';
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  error?: string | null;
}): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_logs (id, table_name, entity_id, action, status, attempts_count, last_error, created_at, synced_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        params.id,
        params.tableName,
        params.entityId,
        params.action,
        params.status,
        params.error || null,
        now,
        params.status === 'SYNCED' ? now : null,
      ]
    );
  } catch {}
}

/**
 * Triggers a manual resync of all pending operations.
 */
export async function triggerManualSync(): Promise<{ success: boolean; message: string }> {
  try {
    await syncPendingData();
    return { success: true, message: 'Synchronisation réussie.' };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Échec de la synchronisation. Vérifiez la connexion.',
    };
  }
}
