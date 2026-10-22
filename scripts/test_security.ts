import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

import {
  EMPTY_LOCK_STATE,
  FREE_PIN_ATTEMPTS,
  PIN_LOCK_STEPS_MS,
  applyPinFailure,
  attemptsBeforeLock,
  formatLockDuration,
  formatRecoveryCode,
  isWellFormedRecoveryCode,
  lockDurationForAttempts,
  normalizeRecoveryCode,
  recoveryCodeFromBytes,
  remainingLockMs,
  validateNewPin,
} from '../services/securityPolicy';
import { decryptBackup, encryptBackup, isBackupEnvelope, MIN_BACKUP_PASSWORD_LENGTH } from '../services/backupCrypto';
import { hashPin, verifyPinHash } from '../lib/crypto';

const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

console.log('==================================================');
console.log('TEST SUITE: MANAGER SECURITY (LOCKOUT, RECOVERY, BACKUP)');
console.log('==================================================\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${name}`);
    failed++;
  }
}

function throws(fn: () => unknown, messagePart: string): boolean {
  try {
    fn();
    return false;
  } catch (e: any) {
    return String(e?.message || '').includes(messagePart);
  }
}

// 1. Progressive lockout
const now = 1_700_000_000_000;
assert(lockDurationForAttempts(FREE_PIN_ATTEMPTS) === 0, `No lock for the first ${FREE_PIN_ATTEMPTS} failures`);
assert(lockDurationForAttempts(FREE_PIN_ATTEMPTS + 1) === 30_000, '4th failure locks 30 s');
assert(lockDurationForAttempts(FREE_PIN_ATTEMPTS + 2) === 60_000, '5th failure locks 1 min');
assert(lockDurationForAttempts(FREE_PIN_ATTEMPTS + 6) === 24 * 3600_000, '9th failure locks 24 h');
assert(lockDurationForAttempts(50) === PIN_LOCK_STEPS_MS[PIN_LOCK_STEPS_MS.length - 1], 'Lock duration caps at the last step');
let durationsGrow = true;
for (let i = FREE_PIN_ATTEMPTS + 1; i < FREE_PIN_ATTEMPTS + PIN_LOCK_STEPS_MS.length; i++) {
  if (lockDurationForAttempts(i + 1) <= lockDurationForAttempts(i)) durationsGrow = false;
}
assert(durationsGrow, 'Each new failure waits strictly longer');

let state = EMPTY_LOCK_STATE;
for (let i = 0; i < FREE_PIN_ATTEMPTS; i++) state = applyPinFailure(state, now);
assert(state.lockedUntil === 0 && remainingLockMs(state, now) === 0, 'Still unlocked after the free attempts');
assert(attemptsBeforeLock(applyPinFailure(EMPTY_LOCK_STATE, now)) === FREE_PIN_ATTEMPTS - 1, 'Attempts-before-lock counts down');
state = applyPinFailure(state, now);
assert(remainingLockMs(state, now) === 30_000, 'Locked for 30 s right after the 4th failure');
assert(remainingLockMs(state, now + 30_000) === 0, 'Lock expires after its duration');
assert(formatLockDuration(30_000) === '30 s' && formatLockDuration(300_000) === '5 min' && formatLockDuration(3600_000) === '1 h', 'Lock durations read naturally');

// 2. Recovery code
const code = recoveryCodeFromBytes(new Uint8Array(randomBytes(12)));
assert(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), `Recovery code is formatted XXXX-XXXX-XXXX (${code})`);
assert(!/[01OIL]/.test(code), 'Recovery code avoids ambiguous characters 0 1 O I L');
assert(isWellFormedRecoveryCode(code.toLowerCase().replace(/-/g, ' ')), 'Lowercase / spaced input is accepted');
assert(!isWellFormedRecoveryCode('ABCD-EFGH-JKM0'), 'A code with a 0 is rejected');
assert(formatRecoveryCode('abcdefghjkmn') === 'ABCD-EFGH-JKMN', 'Typing is auto-formatted');
const codeHash = hashPin(normalizeRecoveryCode(code));
assert(verifyPinHash(normalizeRecoveryCode(code.toLowerCase()), codeHash), 'Stored hash verifies the code regardless of case and dashes');
assert(!verifyPinHash('ABCDEFGHJKMN', codeHash), 'Stored hash rejects another code');

// 3. New PIN rules
assert(validateNewPin('5823') === null, 'A regular PIN is accepted');
assert(validateNewPin('1111') !== null, 'Same digit four times is refused');
assert(validateNewPin('1234') !== null && validateNewPin('9876') !== null, 'Straight sequences are refused');
assert(validateNewPin('12a4') !== null && validateNewPin('123') !== null, 'Non-digits or wrong length are refused');

// 4. Encrypted backup
const payload = { collectorId: 'c-1', tables: { clients: [{ id: 'x', full_name: 'Marie-Carmel Joseph', amount: 250 }] } };
const password = 'carnet-2026!';
const envelope = encryptBackup(payload, password, { salt: new Uint8Array(randomBytes(16)), nonce: new Uint8Array(randomBytes(12)) });
assert(isBackupEnvelope(envelope), 'Envelope has the SOL Mobile backup format');
assert(!envelope.data.includes(bytesToHex(utf8ToBytes('Marie'))), 'Plaintext names do not appear in the file');
assert(JSON.stringify(decryptBackup(envelope, password)) === JSON.stringify(payload), 'Round trip restores the exact payload');
assert(throws(() => decryptBackup(envelope, 'wrong-password'), 'Mot de passe incorrect'), 'Wrong password is rejected');
const tampered = { ...envelope, data: (envelope.data[0] === 'a' ? 'b' : 'a') + envelope.data.slice(1) };
assert(throws(() => decryptBackup(tampered, password), 'altéré'), 'Altered file is rejected (authenticated encryption)');
assert(throws(() => decryptBackup({ hello: 'world' }, password), "n'est pas une sauvegarde"), 'A foreign file is refused');
assert(
  throws(() => encryptBackup(payload, 'court', { salt: new Uint8Array(16), nonce: new Uint8Array(12) }), `${MIN_BACKUP_PASSWORD_LENGTH} caractères`),
  'Short backup passwords are refused'
);
const second = encryptBackup(payload, password, { salt: new Uint8Array(randomBytes(16)), nonce: new Uint8Array(randomBytes(12)) });
assert(second.data !== envelope.data, 'Fresh salt and nonce give a different ciphertext each time');

console.log('\n==================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================');
process.exit(failed > 0 ? 1 : 0);
