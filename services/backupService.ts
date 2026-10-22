import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getDatabase } from '@/db/sqlite';
import { BackupEnvelope, decryptBackup, encryptBackup } from './backupCrypto';
import { randomBytes } from './securityService';

/**
 * Encrypted backup of one manager's carnet: everything needed to rebuild it on a new phone.
 * The file (.solbak) is an AES-256-GCM envelope (see backupCrypto.ts); without the backup
 * password it is unreadable. Restore writes rows back with INSERT OR REPLACE, keeping only
 * the columns the installed schema knows.
 */

const TABLES: { name: string; where: string }[] = [
  { name: 'collectors', where: 'id = ?' },
  { name: 'business_configs', where: 'collector_id = ?' },
  { name: 'clients', where: 'collector_id = ?' },
  { name: 'transactions', where: 'collector_id = ?' },
  { name: 'cash_closures', where: 'collector_id = ?' },
  { name: 'closed_cycles', where: 'collector_id = ?' },
  { name: 'deleted_clients', where: 'collector_id = ?' },
];

interface BackupPayload {
  collectorId: string;
  exportedAt: string;
  recoveryHash: string | null;
  tables: Record<string, Record<string, unknown>[]>;
}

export interface BackupSummary {
  collectorName: string;
  clients: number;
  transactions: number;
  exportedAt: string;
}

const recoveryKey = (collectorId: string) => `sol.recovery.${collectorId}`;

async function readRecoveryHash(collectorId: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(recoveryKey(collectorId));
  return SecureStore.getItemAsync(recoveryKey(collectorId)).catch(() => null);
}

async function writeRecoveryHash(collectorId: string, hash: string): Promise<void> {
  if (Platform.OS === 'web') return AsyncStorage.setItem(recoveryKey(collectorId), hash);
  await SecureStore.setItemAsync(recoveryKey(collectorId), hash);
}

/** Builds, encrypts and shares the backup file. Returns the file name. */
export async function exportEncryptedBackup(collectorId: string, password: string): Promise<string> {
  const db = await getDatabase();
  const tables: BackupPayload['tables'] = {};
  for (const t of TABLES) {
    tables[t.name] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${t.name} WHERE ${t.where}`, [collectorId]);
  }
  const payload: BackupPayload = {
    collectorId,
    exportedAt: new Date().toISOString(),
    recoveryHash: await readRecoveryHash(collectorId),
    tables,
  };

  const envelope = encryptBackup(payload, password, { salt: randomBytes(16), nonce: randomBytes(12) });
  const fileName = `SOL_Sauvegarde_${payload.exportedAt.slice(0, 10)}.solbak`;
  const content = JSON.stringify(envelope);

  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return fileName;
  }

  const path = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Enregistrer la sauvegarde chiffrée' });
  }
  return fileName;
}

/** Lets the manager pick a .solbak file. Returns its parsed envelope, or null if cancelled. */
export async function pickBackupFile(): Promise<BackupEnvelope | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const text =
    Platform.OS === 'web' ? await (await fetch(asset.uri)).text() : await FileSystem.readAsStringAsync(asset.uri);
  try {
    return JSON.parse(text) as BackupEnvelope;
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde SOL Mobile.");
  }
}

/** Decrypts without writing anything: used to show what will be restored. */
export function previewBackup(envelope: BackupEnvelope, password: string): BackupSummary {
  const payload = decryptBackup<BackupPayload>(envelope, password);
  const collector = payload.tables.collectors?.[0] as { full_name?: string } | undefined;
  return {
    collectorName: collector?.full_name || 'Gestionnaire',
    clients: payload.tables.clients?.length || 0,
    transactions: payload.tables.transactions?.length || 0,
    exportedAt: payload.exportedAt,
  };
}

/** Writes the backup into the local database (one SQL transaction). Returns the restored collector id. */
export async function restoreEncryptedBackup(envelope: BackupEnvelope, password: string): Promise<string> {
  const payload = decryptBackup<BackupPayload>(envelope, password);
  if (!payload?.collectorId || !payload.tables?.collectors?.length) {
    throw new Error('Sauvegarde incomplète : aucun gestionnaire trouvé.');
  }
  const db = await getDatabase();

  const columnsOf: Record<string, Set<string>> = {};
  for (const t of TABLES) {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t.name})`);
    columnsOf[t.name] = new Set(info.map((c) => c.name));
  }

  await db.withTransactionAsync(async () => {
    for (const t of TABLES) {
      for (const row of payload.tables[t.name] || []) {
        const cols = Object.keys(row).filter((c) => columnsOf[t.name].has(c));
        if (!cols.length) continue;
        await db.runAsync(
          `INSERT OR REPLACE INTO ${t.name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => row[c] as any)
        );
      }
    }
  });

  if (payload.recoveryHash) await writeRecoveryHash(payload.collectorId, payload.recoveryHash);
  return payload.collectorId;
}
