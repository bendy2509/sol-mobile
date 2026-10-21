import { gcm } from '@noble/ciphers/aes';
import { bytesToUtf8 } from '@noble/ciphers/utils';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/**
 * Encrypted backup envelope (pure, unit-tested).
 * AES-256-GCM (authenticated: any tampering or wrong password fails), key derived from the
 * backup password with PBKDF2-SHA256. Random salt and nonce are supplied by the caller
 * (expo-crypto on device, node:crypto in tests) so this file stays platform-free.
 */

export const BACKUP_FORMAT = 'sol-mobile-backup';
export const BACKUP_VERSION = 1;
export const PBKDF2_ITERATIONS = 60_000;
export const MIN_BACKUP_PASSWORD_LENGTH = 8;

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  kdf: { name: 'PBKDF2-SHA256'; iterations: number; salt: string };
  cipher: { name: 'AES-256-GCM'; nonce: string };
  /** Hex ciphertext + tag. */
  data: string;
}

function deriveKey(password: string, salt: Uint8Array, iterations: number): Uint8Array {
  return pbkdf2(sha256, utf8ToBytes(password.normalize('NFKC')), salt, { c: iterations, dkLen: 32 });
}

export function encryptBackup(
  payload: unknown,
  password: string,
  random: { salt: Uint8Array; nonce: Uint8Array },
  createdAt: string = new Date().toISOString()
): BackupEnvelope {
  if (password.length < MIN_BACKUP_PASSWORD_LENGTH) {
    throw new Error(`Le mot de passe de sauvegarde doit comporter au moins ${MIN_BACKUP_PASSWORD_LENGTH} caractères.`);
  }
  if (random.salt.length < 16 || random.nonce.length !== 12) throw new Error('Paramètres aléatoires invalides.');
  const key = deriveKey(password, random.salt, PBKDF2_ITERATIONS);
  const plaintext = utf8ToBytes(JSON.stringify(payload));
  const ciphertext = gcm(key, random.nonce).encrypt(plaintext);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    kdf: { name: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: bytesToHex(random.salt) },
    cipher: { name: 'AES-256-GCM', nonce: bytesToHex(random.nonce) },
    data: bytesToHex(ciphertext),
  };
}

export function isBackupEnvelope(value: unknown): value is BackupEnvelope {
  const v = value as BackupEnvelope;
  return !!v && v.format === BACKUP_FORMAT && typeof v.data === 'string' && !!v.kdf?.salt && !!v.cipher?.nonce;
}

/** Throws a French, user-facing error on wrong password or altered file. */
export function decryptBackup<T = unknown>(envelope: unknown, password: string): T {
  if (!isBackupEnvelope(envelope)) throw new Error("Ce fichier n'est pas une sauvegarde SOL Mobile.");
  if (envelope.version > BACKUP_VERSION) throw new Error('Sauvegarde créée par une version plus récente de SOL Mobile.');
  let plaintext: Uint8Array;
  try {
    const key = deriveKey(password, hexToBytes(envelope.kdf.salt), envelope.kdf.iterations);
    plaintext = gcm(key, hexToBytes(envelope.cipher.nonce)).decrypt(hexToBytes(envelope.data));
  } catch {
    throw new Error('Mot de passe incorrect ou fichier de sauvegarde altéré.');
  }
  return JSON.parse(bytesToUtf8(plaintext)) as T;
}
