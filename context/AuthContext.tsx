import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { BusinessConfig, BusinessType, Collector, Frequency, UserRole, UserSession } from '@/types';
import {
  getActiveCollector,
  getCollectorByPhone,
  getDatabase,
  isCollectorPhoneTaken,
  setActiveBusinessId,
  setActiveCollectorId,
} from '@/db/sqlite';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { hashPin, verifyPinHash, isBcryptHash } from '@/lib/crypto';
import { recordAuditLog } from '@/services/auditService';
import { validateNewPin } from '@/services/securityPolicy';
import {
  authenticateWithBiometrics,
  createRecoveryCode,
  getAutoLockMinutes,
  getBiometricCollectorId,
  getPinLockState,
  isBiometricAvailable,
  lockMessage,
  registerPinFailure,
  resetPinFailures,
  setAutoLockMinutes as storeAutoLockMinutes,
  setBiometricCollectorId,
  verifyRecoveryCode,
} from '@/services/securityService';
import { t } from '@/i18n';
import { localDateString } from '@/lib/dates';

/**
 * Session of the manager. The app is fully autonomous: no administrator, no approval,
 * no suspension. Security rests on the manager's own PIN (progressive lockout),
 * a recovery code to reset a forgotten PIN, optional biometric unlock and auto-lock.
 */

type AuthResult = { success: boolean; error?: string };

interface AuthContextType {
  activeCollector: Collector | null;
  activeBusiness: BusinessConfig | null;
  userSession: UserSession | null;
  userRole: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithPin: (phone: string, pin: string) => Promise<AuthResult>;
  /** Unlocks the manager registered for biometrics on this device. */
  loginWithBiometrics: () => Promise<AuthResult>;
  /** Phone number of the manager who can unlock with biometrics here, if any. */
  biometricPhone: string | null;
  verifyPin: (pin: string) => Promise<boolean>;
  /** Null when PIN entry is allowed, otherwise the lock message to display. */
  getPinLockMessage: () => Promise<string | null>;
  registerManager: (data: {
    fullName: string;
    phoneNumber: string;
    pin: string;
    businessName: string;
    businessType: BusinessType;
    unitAmount: number;
    frequency: Frequency;
    totalSlots: number;
  }) => Promise<AuthResult & { recoveryCode?: string }>;
  resetPinWithRecoveryCode: (phone: string, recoveryCode: string, newPin: string) => Promise<AuthResult>;
  changePin: (currentPin: string, newPin: string) => Promise<AuthResult>;
  /** Replaces the recovery code; the caller must have verified the PIN. Returns the new code (show it once). */
  regenerateRecoveryCode: () => Promise<string>;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  setBiometricEnabled: (enabled: boolean) => Promise<AuthResult>;
  autoLockMinutes: number;
  setAutoLockMinutes: (minutes: number) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  touchSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function recordUserActivity(): Promise<void> {
  try {
    await AsyncStorage.setItem('SOL_LAST_ACTIVITY_TIME', String(Date.now()));
  } catch {}
}

async function isSessionExpired(): Promise<boolean> {
  try {
    const lastActiveStr = await AsyncStorage.getItem('SOL_LAST_ACTIVITY_TIME');
    if (!lastActiveStr) return false;
    const minutes = await getAutoLockMinutes();
    return Date.now() - Number(lastActiveStr) > minutes * 60 * 1000;
  } catch {
    return false;
  }
}

/** Legacy accounts created under the approval workflow are simply activated. */
async function ensureCollectorActive(collectorId: string, status?: string): Promise<void> {
  if (status === 'ACTIVE') return;
  const db = await getDatabase();
  await db.runAsync(`UPDATE collectors SET status = 'ACTIVE', sync_status = 'PENDING' WHERE id = ?`, [collectorId]);
}

async function failedPinResult(): Promise<AuthResult> {
  const state = await registerPinFailure();
  triggerErrorFeedback();
  return { success: false, error: lockMessage(state) || t('Numéro de téléphone ou code PIN incorrect.') };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCollector, setActiveCollector] = useState<Collector | null>(null);
  const [activeBusiness, setActiveBusiness] = useState<BusinessConfig | null>(null);
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('MANAGER');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricCollectorId, setBiometricCollectorIdState] = useState<string | null>(null);
  const [biometricPhone, setBiometricPhone] = useState<string | null>(null);
  const [autoLockMinutes, setAutoLockMinutesState] = useState<number>(15);

  const touchSession = useCallback(async () => {
    await recordUserActivity();
  }, []);

  // Auto-lock when the app comes back after the chosen inactivity delay
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      const loggedInFlag = await AsyncStorage.getItem('SOL_IS_LOGGED_IN');
      if (loggedInFlag !== 'true') return;
      if (await isSessionExpired()) {
        await AsyncStorage.removeItem('SOL_IS_LOGGED_IN');
        setIsAuthenticated(false);
        triggerErrorFeedback();
      } else {
        await recordUserActivity();
      }
    });
    return () => subscription.remove();
  }, []);

  const loadSecurityPrefs = useCallback(async () => {
    const [available, bioId, minutes] = await Promise.all([isBiometricAvailable(), getBiometricCollectorId(), getAutoLockMinutes()]);
    setBiometricAvailable(available);
    setBiometricCollectorIdState(bioId);
    setAutoLockMinutesState(minutes);
    if (bioId) {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ phone_number: string }>(`SELECT phone_number FROM collectors WHERE id = ?`, [bioId]);
      setBiometricPhone(row?.phone_number || null);
    } else {
      setBiometricPhone(null);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const loggedInFlag = await AsyncStorage.getItem('SOL_IS_LOGGED_IN');

      if (loggedInFlag === 'true' && (await isSessionExpired())) {
        await AsyncStorage.removeItem('SOL_IS_LOGGED_IN');
        setIsAuthenticated(false);
        return;
      }

      const collector = await getActiveCollector();
      const business = await getActiveBusinessConfig();
      setActiveCollector(collector);
      setActiveBusiness(business);

      const role: UserRole = (collector?.role as UserRole) === 'READ_ONLY' ? 'READ_ONLY' : 'MANAGER';
      setUserRole(role);

      if (loggedInFlag === 'true' && collector) {
        await recordUserActivity();
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }

      if (collector && business) {
        setUserSession({
          id: collector.id,
          fullName: collector.fullName,
          phoneNumber: collector.phoneNumber,
          pinHash: collector.pinHash,
          status: collector.status,
          role,
          zone: collector.zone,
          businessId: business.id,
          businessName: business.name,
          businessType: business.type,
          unitAmount: business.contributionAmount,
          frequency: (business.frequency as Frequency) || 'DAILY',
          totalSlots: business.totalSlots,
          startDate: business.startDate,
          endDate: business.endDate,
        });
      }
    } catch (err) {
      console.warn('Failed to refresh session:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
    loadSecurityPrefs();
  }, [refreshSession, loadSecurityPrefs]);

  /** Binds the session to this collector and their own carnet. */
  const openSession = async (collector: Collector) => {
    await ensureCollectorActive(collector.id, collector.status);
    await setActiveCollectorId(collector.id);
    const db = await getDatabase();
    const userBiz = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM business_configs WHERE collector_id = ? ORDER BY created_at DESC LIMIT 1`,
      [collector.id]
    );
    if (userBiz) await setActiveBusinessId(userBiz.id);
    await resetPinFailures();
    await AsyncStorage.setItem('SOL_IS_LOGGED_IN', 'true');
    await AsyncStorage.setItem('SOL_LAST_PHONE', collector.phoneNumber);
    await refreshSession();
    setIsAuthenticated(true);
    triggerSuccessFeedback();
  };

  const loginWithPin = async (phone: string, pin: string): Promise<AuthResult> => {
    try {
      const lockText = lockMessage(await getPinLockState());
      if (lockText) {
        triggerErrorFeedback();
        return { success: false, error: lockText };
      }

      const cleanPhone = phone.trim();
      const cleanPin = pin.trim();
      if (!cleanPhone || cleanPhone.length < 4 || !cleanPin || cleanPin.length !== 4) {
        triggerErrorFeedback();
        return { success: false, error: t('Numéro de téléphone ou code PIN incorrect.') };
      }

      // The manager's account lives on this phone only. A new phone is set up from an
      // encrypted backup (no remote lookup: it exposed PIN hashes to the public key).
      const collector = await getCollectorByPhone(cleanPhone);
      const isLocalMatch = collector ? verifyPinHash(cleanPin, collector.pinHash) : false;


      if (!collector || !isLocalMatch) return failedPinResult();

      // Silently upgrade legacy plaintext or SHA-256 PIN to standard bcrypt hash
      if (!isBcryptHash(collector.pinHash)) {
        const db = await getDatabase();
        await db.runAsync(`UPDATE collectors SET pin_hash = ?, sync_status = 'PENDING' WHERE id = ?`, [hashPin(cleanPin), collector.id]);
      }

      await openSession(collector);
      return { success: true };
    } catch (err: any) {
      triggerErrorFeedback();
      return { success: false, error: err?.message || t('Erreur lors de la connexion.') };
    }
  };

  const loginWithBiometrics = async (): Promise<AuthResult> => {
    const bioId = await getBiometricCollectorId();
    if (!bioId) return { success: false, error: t('Déverrouillage biométrique non activé sur cet appareil.') };
    const ok = await authenticateWithBiometrics(t('Déverrouiller SOL Mobile'));
    if (!ok) return { success: false };
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ phone_number: string }>(`SELECT phone_number FROM collectors WHERE id = ?`, [bioId]);
    const collector = row ? await getCollectorByPhone(row.phone_number) : null;
    if (!collector) {
      await setBiometricCollectorId(null);
      return { success: false, error: t('Compte introuvable sur cet appareil. Connectez-vous avec votre code PIN.') };
    }
    await openSession(collector);
    return { success: true };
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (lockMessage(await getPinLockState())) {
      triggerErrorFeedback();
      return false;
    }
    const currentCollector = activeCollector || (await getActiveCollector());
    if (currentCollector?.pinHash && verifyPinHash(pin, currentCollector.pinHash)) {
      await resetPinFailures();
      triggerSuccessFeedback();
      return true;
    }
    await registerPinFailure();
    triggerErrorFeedback();
    return false;
  };

  const getPinLockMessage = async () => lockMessage(await getPinLockState());

  const registerManager: AuthContextType['registerManager'] = async (data) => {
    try {
      const normPhone = normalizePhoneNumber(data.phoneNumber);
      if (await isCollectorPhoneTaken(normPhone)) {
        triggerErrorFeedback();
        return { success: false, error: t('Ce numéro de téléphone est déjà associé à un autre compte.') };
      }
      const pinError = validateNewPin(data.pin);
      if (pinError) {
        triggerErrorFeedback();
        return { success: false, error: pinError };
      }

      const db = await getDatabase();
      const collectorId = uuidv4();
      const now = new Date().toISOString();
      const startDate = localDateString();
      const endDate = localDateString(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

      // 1. Create the manager, active immediately (no approval step)
      await db.runAsync(
        `INSERT INTO collectors (id, full_name, phone_number, pin_hash, status, zone, created_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', 'Zone Principale', ?)`,
        [collectorId, data.fullName.trim(), normPhone, hashPin(data.pin), now]
      );

      // 2. Create Business Configuration
      const businessId = uuidv4();
      await db.runAsync(
        `INSERT INTO business_configs (id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, cycle_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'ACTIVE', ?)`,
        [businessId, collectorId, data.businessName.trim(), data.businessType, data.unitAmount, data.frequency, data.totalSlots, startDate, endDate, now]
      );

      recordAuditLog({
        userId: collectorId,
        userRole: 'MANAGER',
        action: 'CREATE_BOOK',
        entityType: 'BUSINESS',
        entityId: businessId,
        newData: { businessName: data.businessName, unitAmount: data.unitAmount, frequency: data.frequency },
        reason: t('Inscription nouveau carnet SOL/Sabotay'),
      }).catch(() => {});

      const recoveryCode = await createRecoveryCode(collectorId);

      await setActiveCollectorId(collectorId);
      await setActiveBusinessId(businessId);
      await resetPinFailures();
      await AsyncStorage.setItem('SOL_IS_LOGGED_IN', 'true');
      await refreshSession();
      setIsAuthenticated(true);
      triggerSuccessFeedback();
      return { success: true, recoveryCode };
    } catch (err: any) {
      triggerErrorFeedback();
      return { success: false, error: err?.message || t('Échec de l\'inscription.') };
    }
  };

  const resetPinWithRecoveryCode = async (phone: string, recoveryCode: string, newPin: string): Promise<AuthResult> => {
    const collector = await getCollectorByPhone(phone.trim());
    if (!collector || !(await verifyRecoveryCode(collector.id, recoveryCode))) {
      triggerErrorFeedback();
      return { success: false, error: t('Numéro de téléphone ou code de récupération incorrect.') };
    }
    const pinError = validateNewPin(newPin);
    if (pinError) return { success: false, error: pinError };

    const db = await getDatabase();
    await db.runAsync(`UPDATE collectors SET pin_hash = ?, sync_status = 'PENDING' WHERE id = ?`, [hashPin(newPin), collector.id]);
    recordAuditLog({
      userId: collector.id,
      userRole: 'MANAGER',
      action: 'UPDATE_SECURITY',
      entityType: 'COLLECTOR',
      entityId: collector.id,
      reason: t('Réinitialisation du PIN par code de récupération'),
    }).catch(() => {});
    await openSession({ ...collector, pinHash: hashPin(newPin) });
    return { success: true };
  };

  const changePin = async (currentPin: string, newPin: string): Promise<AuthResult> => {
    if (!(await verifyPin(currentPin))) return { success: false, error: t('Code PIN actuel incorrect.') };
    const pinError = validateNewPin(newPin);
    if (pinError) return { success: false, error: pinError };
    const collector = activeCollector || (await getActiveCollector());
    if (!collector) return { success: false, error: t('Session expirée.') };
    const db = await getDatabase();
    await db.runAsync(`UPDATE collectors SET pin_hash = ?, sync_status = 'PENDING' WHERE id = ?`, [hashPin(newPin), collector.id]);
    recordAuditLog({
      userId: collector.id,
      userRole: 'MANAGER',
      action: 'UPDATE_SECURITY',
      entityType: 'COLLECTOR',
      entityId: collector.id,
      reason: t('Modification du code PIN'),
    }).catch(() => {});
    await refreshSession();
    triggerSuccessFeedback();
    return { success: true };
  };

  const regenerateRecoveryCode = async (): Promise<string> => {
    const collector = activeCollector || (await getActiveCollector());
    if (!collector) throw new Error(t('Session expirée.'));
    const code = await createRecoveryCode(collector.id);
    recordAuditLog({
      userId: collector.id,
      userRole: 'MANAGER',
      action: 'UPDATE_SECURITY',
      entityType: 'COLLECTOR',
      entityId: collector.id,
      reason: t('Nouveau code de récupération'),
    }).catch(() => {});
    return code;
  };

  const setBiometricEnabled = async (enabled: boolean): Promise<AuthResult> => {
    if (!enabled) {
      await setBiometricCollectorId(null);
      await loadSecurityPrefs();
      return { success: true };
    }
    if (!(await isBiometricAvailable())) {
      return { success: false, error: t('Aucune empreinte ou reconnaissance faciale n\'est configurée sur ce téléphone.') };
    }
    if (!(await authenticateWithBiometrics(t('Confirmer pour activer le déverrouillage biométrique')))) {
      return { success: false, error: t('Vérification biométrique annulée.') };
    }
    const collector = activeCollector || (await getActiveCollector());
    if (!collector) return { success: false, error: t('Session expirée.') };
    await setBiometricCollectorId(collector.id);
    await loadSecurityPrefs();
    return { success: true };
  };

  const setAutoLockMinutes = async (minutes: number) => {
    await storeAutoLockMinutes(minutes);
    setAutoLockMinutesState(minutes);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('SOL_IS_LOGGED_IN');
    await AsyncStorage.removeItem('SOL_LAST_ACTIVITY_TIME');
    setIsAuthenticated(false);
    triggerSuccessFeedback();
  };

  return (
    <AuthContext.Provider
      value={{
        activeCollector,
        activeBusiness,
        userSession,
        userRole,
        isAuthenticated,
        isLoading,
        loginWithPin,
        loginWithBiometrics,
        biometricPhone,
        verifyPin,
        getPinLockMessage,
        registerManager,
        resetPinWithRecoveryCode,
        changePin,
        regenerateRecoveryCode,
        biometricAvailable,
        biometricEnabled: !!biometricCollectorId && biometricCollectorId === activeCollector?.id,
        setBiometricEnabled,
        autoLockMinutes,
        setAutoLockMinutes,
        logout,
        refreshSession,
        touchSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
