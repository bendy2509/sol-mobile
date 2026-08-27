import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { AuditLog, AuditLogAction, UserRole } from '@/types';
import { getDatabase } from '@/db/sqlite';
import { supabase } from '@/lib/supabase';

export interface RecordAuditParams {
  userId: string;
  userRole: UserRole;
  action: AuditLogAction;
  entityType: 'TRANSACTION' | 'CLIENT' | 'BUSINESS' | 'COLLECTOR' | 'CLOSURE' | 'SYSTEM';
  entityId: string;
  oldData?: any;
  newData?: any;
  reason?: string;
}

/**
 * Records an immutable audit log entry in the local SQLite database
 * and replicates it asynchronously to Supabase when online.
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<AuditLog> {
  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const oldDataStr = params.oldData ? JSON.stringify(params.oldData) : null;
  const newDataStr = params.newData ? JSON.stringify(params.newData) : null;
  const reason = params.reason?.trim() || null;

  const logEntry: AuditLog = {
    id,
    userId: params.userId,
    userRole: params.userRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    oldData: oldDataStr,
    newData: newDataStr,
    reason,
    createdAt: now,
    syncStatus: 'PENDING',
  };

  try {
    await db.runAsync(
      `INSERT INTO audit_logs (id, user_id, user_role, action, entity_type, entity_id, old_data, new_data, reason, created_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        id,
        params.userId,
        params.userRole,
        params.action,
        params.entityType,
        params.entityId,
        oldDataStr,
        newDataStr,
        reason,
        now,
      ]
    );

    // Asynchronous non-blocking push to Supabase audit trail if connected
    (async () => {
      try {
        const { error } = await supabase.from('audit_logs').insert({
          id,
          user_id: params.userId,
          user_role: params.userRole,
          action: params.action,
          entity_type: params.entityType,
          entity_id: params.entityId,
          old_data: oldDataStr,
          new_data: newDataStr,
          reason,
          created_at: now,
        });
        if (!error) {
          await db.runAsync(`UPDATE audit_logs SET sync_status = 'SYNCED' WHERE id = ?`, [id]);
        }
      } catch {}
    })();
  } catch (err) {
    console.warn('Failed to record local audit log:', err);
  }

  return logEntry;
}

/**
 * Retrieves audit logs with optional filters and sorting.
 */
export async function getAuditLogs(options?: {
  action?: AuditLogAction;
  entityType?: string;
  entityId?: string;
  userId?: string;
  limit?: number;
}): Promise<AuditLog[]> {
  const db = await getDatabase();
  let query = `SELECT * FROM audit_logs WHERE 1=1`;
  const params: any[] = [];

  if (options?.action) {
    query += ` AND action = ?`;
    params.push(options.action);
  }

  if (options?.entityType) {
    query += ` AND entity_type = ?`;
    params.push(options.entityType);
  }

  if (options?.entityId) {
    query += ` AND entity_id = ?`;
    params.push(options.entityId);
  }

  if (options?.userId) {
    query += ` AND user_id = ?`;
    params.push(options.userId);
  }

  query += ` ORDER BY created_at DESC`;

  if (options?.limit) {
    query += ` LIMIT ?`;
    params.push(options.limit);
  } else {
    query += ` LIMIT 200`;
  }

  const rows = await db.getAllAsync<{
    id: string;
    user_id: string;
    user_role: UserRole;
    action: AuditLogAction;
    entity_type: 'TRANSACTION' | 'CLIENT' | 'BUSINESS' | 'COLLECTOR' | 'CLOSURE' | 'SYSTEM';
    entity_id: string;
    old_data: string | null;
    new_data: string | null;
    reason: string | null;
    created_at: string;
    sync_status: string;
  }>(query, params);

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userRole: r.user_role,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    oldData: r.old_data,
    newData: r.new_data,
    reason: r.reason,
    createdAt: r.created_at,
    syncStatus: (r.sync_status as any) || 'PENDING',
  }));
}
