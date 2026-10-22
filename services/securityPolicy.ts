/**
 * Pure security rules for the manager's PIN (no React Native imports, unit-tested).
 *
 * - Progressive lockout: the first failures are free (typos happen at the market),
 *   then each new failure doubles down on the waiting time.
 * - Recovery code: 12 characters from an unambiguous alphabet (no 0/O, 1/I/L),
 *   shown as XXXX-XXXX-XXXX, about 60 bits of entropy. It is the only way to reset
 *   a forgotten PIN: there is no administrator anymore.
 */

/** Failures allowed before the first lock. */
export const FREE_PIN_ATTEMPTS = 3;

/** Lock duration applied at the n-th failure beyond the free ones (ms). Last value repeats. */
export const PIN_LOCK_STEPS_MS = [
  30 * 1000, // 4th failure: 30 s
  60 * 1000, // 5th: 1 min
  5 * 60 * 1000, // 6th: 5 min
  15 * 60 * 1000, // 7th: 15 min
  60 * 60 * 1000, // 8th: 1 h
  24 * 60 * 60 * 1000, // 9th and beyond: 24 h
];

export interface PinLockState {
  failedAttempts: number;
  /** Epoch ms until which PIN entry is refused, or 0. */
  lockedUntil: number;
}

export const EMPTY_LOCK_STATE: PinLockState = { failedAttempts: 0, lockedUntil: 0 };

/** Lock duration (ms) triggered by reaching `failedAttempts` failures in a row. */
export function lockDurationForAttempts(failedAttempts: number): number {
  if (failedAttempts <= FREE_PIN_ATTEMPTS) return 0;
  const step = Math.min(failedAttempts - FREE_PIN_ATTEMPTS - 1, PIN_LOCK_STEPS_MS.length - 1);
  return PIN_LOCK_STEPS_MS[step];
}

/** New state after one more failed PIN attempt at time `now`. */
export function applyPinFailure(state: PinLockState, now: number): PinLockState {
  const failedAttempts = state.failedAttempts + 1;
  const duration = lockDurationForAttempts(failedAttempts);
  return { failedAttempts, lockedUntil: duration > 0 ? now + duration : 0 };
}

/** Remaining lock time (ms) at `now`, 0 when PIN entry is allowed. */
export function remainingLockMs(state: PinLockState, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}

/** Attempts left before the next lock (0 while locked or once past the free attempts). */
export function attemptsBeforeLock(state: PinLockState): number {
  return Math.max(0, FREE_PIN_ATTEMPTS - state.failedAttempts);
}

/** Human French duration: "30 s", "5 min", "1 h", "24 h". */
export function formatLockDuration(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.ceil(m / 60)} h`;
}

// --- Recovery code ---------------------------------------------------------

export const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RECOVERY_CODE_LENGTH = 12;

/** Builds a recovery code from random bytes (one byte per character, rejection-free modulo on a 31-char alphabet is acceptable here: bias < 1 %). */
export function recoveryCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < RECOVERY_CODE_LENGTH) throw new Error('Not enough random bytes for a recovery code.');
  let raw = '';
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    raw += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  }
  return formatRecoveryCode(raw);
}

/** Uppercase, strip spaces/dashes, map look-alikes (O→0 is not in the alphabet, so we refuse rather than guess). */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isWellFormedRecoveryCode(input: string): boolean {
  const n = normalizeRecoveryCode(input);
  if (n.length !== RECOVERY_CODE_LENGTH) return false;
  for (const ch of n) if (!RECOVERY_ALPHABET.includes(ch)) return false;
  return true;
}

export function formatRecoveryCode(input: string): string {
  const n = normalizeRecoveryCode(input);
  return n.match(/.{1,4}/g)?.join('-') ?? n;
}

/** PIN rules: exactly 4 digits, not trivially guessable. */
export function validateNewPin(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'Le code PIN doit comporter exactement 4 chiffres.';
  if (/^(\d)\1{3}$/.test(pin)) return 'Évitez un code composé du même chiffre (ex : 1111).';
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'Évitez une suite de chiffres (ex : 1234).';
  return null;
}
