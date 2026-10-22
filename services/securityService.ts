import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ExpoCrypto from 'expo-crypto';

import { hashPin, verifyPinHash } from '@/lib/crypto';
import {
  EMPTY_LOCK_STATE,
  PinLockState,
  applyPinFailure,
  formatLockDuration,
  normalizeRecoveryCode,
  recoveryCodeFromBytes,
  remainingLockMs,
  RECOVERY_CODE_LENGTH,
} from './securityPolicy';

/**
 * Device-side security for the manager (the app has no administrator):
 * PIN lockout state, recovery code, biometric unlock and auto-lock delay.
 * Secrets live in the OS keystore (expo-secure-store); web falls back to AsyncStorage.
 */

const KEYS = {
  lock: 'sol.pin.lock',
  recovery: (collectorId: string) => `sol.recovery.${collectorId}`,
  biometricCollector: 'sol.biometric.collector',
  autoLockMinutes: 'SOL_AUTOLOCK_MINUTES',
};

const secure = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  },
};

export function randomBytes(length: number): Uint8Array {
  return ExpoCrypto.getRandomBytes(length);
}

// --- Progressive PIN lockout -------------------------------------------------

export async function getPinLockState(): Promise<PinLockState> {
  const raw = await secure.get(KEYS.lock);
  if (!raw) return EMPTY_LOCK_STATE;
  try {
    const parsed = JSON.parse(raw) as PinLockState;
    return { failedAttempts: Number(parsed.failedAttempts) || 0, lockedUntil: Number(parsed.lockedUntil) || 0 };
  } catch {
    return EMPTY_LOCK_STATE;
  }
}

export async function registerPinFailure(): Promise<PinLockState> {
  const next = applyPinFailure(await getPinLockState(), Date.now());
  await secure.set(KEYS.lock, JSON.stringify(next));
  return next;
}

export async function resetPinFailures(): Promise<void> {
  await secure.remove(KEYS.lock);
}

/** French message for the login / PIN screens, or null when PIN entry is allowed. */
export function lockMessage(state: PinLockState, now: number = Date.now()): string | null {
  const ms = remainingLockMs(state, now);
  if (ms <= 0) return null;
  return `Trop de codes PIN erronés. Réessayez dans ${formatLockDuration(ms)}, ou utilisez votre code de récupération.`;
}

// --- Recovery code -----------------------------------------------------------

/** Creates a new recovery code for this manager, stores only its hash, returns it once (to show). */
export async function createRecoveryCode(collectorId: string): Promise<string> {
  const code = recoveryCodeFromBytes(randomBytes(RECOVERY_CODE_LENGTH));
  await secure.set(KEYS.recovery(collectorId), hashPin(normalizeRecoveryCode(code)));
  return code;
}

export async function hasRecoveryCode(collectorId: string): Promise<boolean> {
  return !!(await secure.get(KEYS.recovery(collectorId)));
}

export async function verifyRecoveryCode(collectorId: string, code: string): Promise<boolean> {
  const stored = await secure.get(KEYS.recovery(collectorId));
  if (!stored) return false;
  return verifyPinHash(normalizeRecoveryCode(code), stored);
}

// --- Biometric unlock --------------------------------------------------------

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

/** Collector allowed to unlock with biometrics on this device, if any. */
export async function getBiometricCollectorId(): Promise<string | null> {
  return secure.get(KEYS.biometricCollector);
}

export async function setBiometricCollectorId(collectorId: string | null): Promise<void> {
  if (collectorId) await secure.set(KEYS.biometricCollector, collectorId);
  else await secure.remove(KEYS.biometricCollector);
}

export async function authenticateWithBiometrics(promptMessage: string): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Utiliser le code PIN',
      disableDeviceFallback: true,
    });
    return result.success;
  } catch {
    return false;
  }
}

// --- Auto-lock ---------------------------------------------------------------

export const AUTO_LOCK_OPTIONS_MIN = [1, 5, 15, 30] as const;
export const DEFAULT_AUTO_LOCK_MIN = 15;

export async function getAutoLockMinutes(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEYS.autoLockMinutes);
  const n = Number(raw);
  return (AUTO_LOCK_OPTIONS_MIN as readonly number[]).includes(n) ? n : DEFAULT_AUTO_LOCK_MIN;
}

export async function setAutoLockMinutes(minutes: number): Promise<void> {
  await AsyncStorage.setItem(KEYS.autoLockMinutes, String(minutes));
}
