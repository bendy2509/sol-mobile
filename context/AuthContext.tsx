import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { BusinessConfig, BusinessType, Collector, Frequency, UserRole, UserSession, UserStatus } from '@/types';
import {
  getActiveBusinessId,
  getActiveCollector,
  getCollectorByPhone,
  getDatabase,
  isCollectorPhoneTaken,
  isCollectorPinTaken,
  setActiveBusinessId,
  setActiveCollectorId,
  updateCollectorStatus,
} from '@/db/sqlite';
import { getActiveBusinessConfig, saveBusinessConfig } from '@/db/businessRepository';
import { triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';
import { arePhoneNumbersEqual, normalizePhoneNumber } from '@/lib/phoneUtils';
import { hashPin, verifyPinHash } from '@/lib/crypto';
import { recordAuditLog } from '@/services/auditService';

export interface AdminProfile {
  fullName: string;
  phoneNumber: string;
  pin: string;
}

interface AuthContextType {
  activeCollector: Collector | null;
  activeBusiness: BusinessConfig | null;
  userSession: UserSession | null;
  userRole: UserRole;
  isAuthenticated: boolean;
  isPendingApproval: boolean;
  isLoading: boolean;
  loginWithPin: (phone: string, pin: string) => Promise<{ success: boolean; role?: UserRole; status?: UserStatus; error?: string }>;
  loginAsAdmin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  verifyPin: (pin: string) => Promise<boolean>;
  getAdminProfile: () => Promise<AdminProfile>;
  updateAdminProfile: (data: Partial<AdminProfile>) => Promise<void>;
  registerManager: (data: {
    fullName: string;
    phoneNumber: string;
    pin: string;
    businessName: string;
    businessType: BusinessType;
    unitAmount: number;
    frequency: Frequency;
    totalSlots: number;
  }) => Promise<{ success: boolean; error?: string }>;
  approveAccount: (collectorId?: string) => Promise<void>;
  getAllManagers: () => Promise<Collector[]>;
  getAllBusinesses: () => Promise<BusinessConfig[]>;
  switchRole: (role: UserRole) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- Anti-Brute-Force Rate Limiting Engine ---
async function checkPinRateLimit(): Promise<{ isLocked: boolean; remainingSeconds?: number; message?: string }> {
  try {
    const lockUntilStr = await AsyncStorage.getItem('SOL_PIN_LOCK_UNTIL');
    if (lockUntilStr) {
      const lockUntil = Number(lockUntilStr);
      const now = Date.now();
      if (now < lockUntil) {
        const remainingSeconds = Math.ceil((lockUntil - now) / 1000);
        return {
          isLocked: true,
          remainingSeconds,
          message: `Accès temporairement bloqué suite à plusieurs échecs de code PIN. Réessayez dans ${remainingSeconds}s.`,
        };
      } else {
        await AsyncStorage.removeItem('SOL_PIN_LOCK_UNTIL');
        await AsyncStorage.removeItem('SOL_PIN_FAILED_ATTEMPTS');
      }
    }
  } catch {}
  return { isLocked: false };
}

async function recordFailedPinAttempt(): Promise<{ isLocked: boolean; message?: string }> {
  try {
    const attemptsStr = (await AsyncStorage.getItem('SOL_PIN_FAILED_ATTEMPTS')) || '0';
    const attempts = Number(attemptsStr) + 1;
    await AsyncStorage.setItem('SOL_PIN_FAILED_ATTEMPTS', String(attempts));

    if (attempts >= 5) {
      const lockDurationMs = attempts === 5 ? 30 * 1000 : attempts === 6 ? 120 * 1000 : 300 * 1000;
      const lockUntil = Date.now() + lockDurationMs;
      await AsyncStorage.setItem('SOL_PIN_LOCK_UNTIL', String(lockUntil));
      const remainingSeconds = Math.ceil(lockDurationMs / 1000);
      return {
        isLocked: true,
        message: `Trop de tentatives de code PIN erronées. Verrouillage de sécurité actif pour ${remainingSeconds} secondes.`,
      };
    }
  } catch {}
  return { isLocked: false };
}

async function resetFailedPinAttempts(): Promise<void> {
  try {
    await AsyncStorage.removeItem('SOL_PIN_FAILED_ATTEMPTS');
    await AsyncStorage.removeItem('SOL_PIN_LOCK_UNTIL');
  } catch {}
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCollector, setActiveCollector] = useState<Collector | null>(null);
  const [activeBusiness, setActiveBusiness] = useState<BusinessConfig | null>(null);
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('MANAGER');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isPendingApproval, setIsPendingApproval] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async () => {
    try {
      const loggedInFlag = await AsyncStorage.getItem('SOL_IS_LOGGED_IN');
      const storedRole = (await AsyncStorage.getItem('SOL_USER_ROLE')) as UserRole;
      if (storedRole) {
        setUserRole(storedRole);
      }

      const collector = await getActiveCollector();
      const business = await getActiveBusinessConfig();

      setActiveCollector(collector);
      setActiveBusiness(business);

      if (loggedInFlag === 'true') {
        if (storedRole === 'ADMIN') {
          setIsAuthenticated(true);
          setIsPendingApproval(false);
        } else if (collector) {
          if (collector.status === 'PENDING_APPROVAL') {
            setIsPendingApproval(true);
            setIsAuthenticated(false);
          } else if (collector.status === 'ACTIVE') {
            setIsPendingApproval(false);
            setIsAuthenticated(true);
          } else {
            setIsPendingApproval(false);
            setIsAuthenticated(false);
          }
        } else {
          setIsAuthenticated(false);
          setIsPendingApproval(false);
        }
      } else {
        setIsAuthenticated(false);
        setIsPendingApproval(false);
      }

      if (collector && business) {
        setUserSession({
          id: collector.id,
          fullName: collector.fullName,
          phoneNumber: collector.phoneNumber,
          pinHash: collector.pinHash,
          status: collector.status,
          role: storedRole || 'MANAGER',
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
  }, [refreshSession]);

  const getAdminProfile = async (): Promise<AdminProfile> => {
    const fullName = (await AsyncStorage.getItem('SOL_ADMIN_NAME')) || 'Superviseur Général';
    const phoneNumber = (await AsyncStorage.getItem('SOL_ADMIN_PHONE')) || '+50900000000';
    const pin = (await AsyncStorage.getItem('SOL_ADMIN_PIN')) || hashPin('9999');
    return { fullName, phoneNumber, pin };
  };

  const updateAdminProfile = async (data: Partial<AdminProfile>): Promise<void> => {
    if (data.fullName !== undefined) {
      await AsyncStorage.setItem('SOL_ADMIN_NAME', data.fullName.trim());
    }
    if (data.phoneNumber !== undefined) {
      const norm = normalizePhoneNumber(data.phoneNumber);
      const isTaken = await isCollectorPhoneTaken(norm);
      if (isTaken) {
        throw new Error('Ce numéro de téléphone est déjà utilisé par un compte gestionnaire.');
      }
      await AsyncStorage.setItem('SOL_ADMIN_PHONE', norm);
    }
    if (data.pin !== undefined && data.pin.length === 4) {
      const isPinTaken = await isCollectorPinTaken(data.pin);
      if (isPinTaken) {
        throw new Error('Ce code PIN est déjà attribué. Veuillez choisir un code PIN unique.');
      }
      await AsyncStorage.setItem('SOL_ADMIN_PIN', hashPin(data.pin));
    }

    recordAuditLog({
      userId: 'admin',
      userRole: 'ADMIN',
      action: 'UPDATE_SECURITY',
      entityType: 'COLLECTOR',
      entityId: 'admin',
      newData: { fullName: data.fullName, phoneNumber: data.phoneNumber },
      reason: 'Mise à jour des coordonnées Admin',
    }).catch(() => {});

    triggerSuccessFeedback();
  };

  const loginWithPin = async (
    phone: string,
    pin: string
  ): Promise<{ success: boolean; role?: UserRole; status?: UserStatus; error?: string }> => {
    try {
      // 0. Check Rate Limiter
      const rateLimit = await checkPinRateLimit();
      if (rateLimit.isLocked) {
        triggerErrorFeedback();
        return { success: false, error: rateLimit.message };
      }

      const cleanPhone = phone.trim();
      const cleanPin = pin.trim();

      if (!cleanPhone || cleanPhone.length < 4) {
        triggerErrorFeedback();
        return { success: false, error: 'Veuillez saisir un numéro de téléphone valide.' };
      }

      if (!cleanPin || cleanPin.length !== 4) {
        triggerErrorFeedback();
        return { success: false, error: 'Le code PIN doit comporter exactement 4 chiffres.' };
      }

      // Retrieve dynamic Admin credentials
      const adminPhone = (await AsyncStorage.getItem('SOL_ADMIN_PHONE')) || '+50900000000';
      const adminStoredPin = (await AsyncStorage.getItem('SOL_ADMIN_PIN')) || hashPin('9999');

      // 1. Check if the entered phone number belongs to the Administrator
      const isAdminPhone =
        arePhoneNumbersEqual(cleanPhone, adminPhone) ||
        arePhoneNumbersEqual(cleanPhone, '+50900000000') ||
        cleanPhone.toLowerCase() === 'admin';

      if (isAdminPhone) {
        // Strict Coincidence: The PIN must match the Admin account's PIN
        const isAdminPinValid = verifyPinHash(cleanPin, adminStoredPin);
        if (!isAdminPinValid) {
          const lockStatus = await recordFailedPinAttempt();
          triggerErrorFeedback();
          return {
            success: false,
            error: lockStatus.message || 'Code PIN incorrect pour le compte Administrateur.',
          };
        }

        await resetFailedPinAttempts();
        await AsyncStorage.setItem('SOL_IS_LOGGED_IN', 'true');
        await AsyncStorage.setItem('SOL_USER_ROLE', 'ADMIN');
        setUserRole('ADMIN');
        setIsAuthenticated(true);
        setIsPendingApproval(false);
        triggerSuccessFeedback();
        return { success: true, role: 'ADMIN' };
      }

      // 2. Lookup Collector strictly by normalized phone number
      const collector = await getCollectorByPhone(cleanPhone);

      if (!collector) {
        triggerErrorFeedback();
        return {
          success: false,
          error: 'Aucun compte trouvé avec ce numéro de téléphone. Vérifiez le numéro ou inscrivez votre carnet.',
        };
      }

      // 3. Strict Coincidence: The PIN must match this specific Collector's pinHash
      const isCollectorPinValid = verifyPinHash(cleanPin, collector.pinHash);
      if (!isCollectorPinValid) {
        const lockStatus = await recordFailedPinAttempt();
        triggerErrorFeedback();
        return {
          success: false,
          error: lockStatus.message || 'Code PIN incorrect pour ce numéro de téléphone.',
        };
      }

      await resetFailedPinAttempts();

      // Silently upgrade legacy plaintext PIN to encrypted hash if needed
      if (collector.pinHash === cleanPin) {
        const db = await getDatabase();
        await db.runAsync(`UPDATE collectors SET pin_hash = ? WHERE id = ?`, [hashPin(cleanPin), collector.id]);
      }

      // 4. Bind strictly to this collector and their own business
      await setActiveCollectorId(collector.id);

      const db = await getDatabase();
      const userBiz = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM business_configs WHERE collector_id = ? ORDER BY created_at DESC LIMIT 1`,
        [collector.id]
      );
      if (userBiz) {
        await setActiveBusinessId(userBiz.id);
      }

      await AsyncStorage.setItem('SOL_IS_LOGGED_IN', 'true');
      await AsyncStorage.setItem('SOL_USER_ROLE', 'MANAGER');
      setUserRole('MANAGER');
      await refreshSession();

      if (collector.status === 'SUSPENDED') {
        setIsPendingApproval(false);
        setIsAuthenticated(false);
        triggerErrorFeedback();
        return { success: true, role: 'MANAGER', status: 'SUSPENDED' };
      }

      if (collector.status === 'PENDING_APPROVAL') {
        setIsPendingApproval(true);
        setIsAuthenticated(false);
        triggerSuccessFeedback();
        return { success: true, role: 'MANAGER', status: 'PENDING_APPROVAL' };
      }

      setIsPendingApproval(false);
      setIsAuthenticated(true);
      triggerSuccessFeedback();
      return { success: true, role: 'MANAGER', status: 'ACTIVE' };
    } catch (err: any) {
      triggerErrorFeedback();
      return { success: false, error: err?.message || 'Erreur lors de la connexion.' };
    }
  };

  const loginAsAdmin = async (pin: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const rateLimit = await checkPinRateLimit();
      if (rateLimit.isLocked) {
        triggerErrorFeedback();
        return { success: false, error: rateLimit.message };
      }

      const adminStoredPin = (await AsyncStorage.getItem('SOL_ADMIN_PIN')) || hashPin('9999');
      if (!verifyPinHash(pin, adminStoredPin)) {
        const lockStatus = await recordFailedPinAttempt();
        triggerErrorFeedback();
        return { success: false, error: lockStatus.message || 'Code PIN Administrateur incorrect.' };
      }

      await resetFailedPinAttempts();
      await AsyncStorage.setItem('SOL_IS_LOGGED_IN', 'true');
      await AsyncStorage.setItem('SOL_USER_ROLE', 'ADMIN');
      setUserRole('ADMIN');
      setIsAuthenticated(true);
      setIsPendingApproval(false);
      triggerSuccessFeedback();
      return { success: true };
    } catch (err: any) {
      triggerErrorFeedback();
      return { success: false, error: err?.message || 'Erreur de connexion admin.' };
    }
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    const rateLimit = await checkPinRateLimit();
    if (rateLimit.isLocked) {
      triggerErrorFeedback();
      return false;
    }

    if (userRole === 'ADMIN') {
      const adminStoredPin = (await AsyncStorage.getItem('SOL_ADMIN_PIN')) || hashPin('9999');
      if (verifyPinHash(pin, adminStoredPin)) {
        await resetFailedPinAttempts();
        triggerSuccessFeedback();
        return true;
      }
      await recordFailedPinAttempt();
      triggerErrorFeedback();
      return false;
    }

    const currentCollector = activeCollector || (await getActiveCollector());
    if (currentCollector?.pinHash && verifyPinHash(pin, currentCollector.pinHash)) {
      await resetFailedPinAttempts();
      triggerSuccessFeedback();
      return true;
    }

    await recordFailedPinAttempt();
    triggerErrorFeedback();
    return false;
  };

  const registerManager = async (data: {
    fullName: string;
    phoneNumber: string;
    pin: string;
    businessName: string;
    businessType: BusinessType;
    unitAmount: number;
    frequency: Frequency;
    totalSlots: number;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const normPhone = normalizePhoneNumber(data.phoneNumber);

      // Check phone uniqueness
      const isPhoneTaken = await isCollectorPhoneTaken(normPhone);
      if (isPhoneTaken) {
        triggerErrorFeedback();
        return { success: false, error: 'Ce numéro de téléphone est déjà associé à un autre compte.' };
      }

      // Check PIN uniqueness
      const isPinTaken = await isCollectorPinTaken(data.pin);
      if (isPinTaken) {
        triggerErrorFeedback();
        return { success: false, error: 'Ce code PIN est déjà utilisé. Veuillez choisir un code PIN unique (4 chiffres).' };
      }

      const db = await getDatabase();
      const collectorId = uuidv4();
      const now = new Date().toISOString();
      const startDate = now.split('T')[0];
      const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const encryptedPin = hashPin(data.pin);

      // 1. Create Collector with PENDING_APPROVAL status and Encrypted PIN
      await db.runAsync(
        `INSERT INTO collectors (id, full_name, phone_number, pin_hash, status, zone, created_at)
         VALUES (?, ?, ?, ?, 'PENDING_APPROVAL', 'Zone Principale', ?)`,
        [collectorId, data.fullName.trim(), normPhone, encryptedPin, now]
      );

      // 2. Create Business Configuration
      const businessId = uuidv4();
      await db.runAsync(
        `INSERT INTO business_configs (id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, cycle_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'ACTIVE', ?)`,
        [
          businessId,
          collectorId,
          data.businessName.trim(),
          data.businessType,
          data.unitAmount,
          data.frequency,
          data.totalSlots,
          startDate,
          endDate,
          now,
        ]
      );

      // Log registration to audit
      recordAuditLog({
        userId: collectorId,
        userRole: 'COLLECTOR',
        action: 'CREATE_BOOK',
        entityType: 'BUSINESS',
        entityId: businessId,
        newData: { businessName: data.businessName, unitAmount: data.unitAmount, frequency: data.frequency },
        reason: 'Inscription nouveau carnet SOL/Sabotay',
      }).catch(() => {});

      await setActiveCollectorId(collectorId);
      await setActiveBusinessId(businessId);
      await AsyncStorage.setItem('SOL_IS_LOGGED_IN', 'true');
      await AsyncStorage.setItem('SOL_USER_ROLE', 'MANAGER');
      setUserRole('MANAGER');
      await refreshSession();

      setIsPendingApproval(true);
      setIsAuthenticated(false);
      triggerSuccessFeedback();
      return { success: true };
    } catch (err: any) {
      triggerErrorFeedback();
      return { success: false, error: err?.message || "Échec de l'inscription." };
    }
  };

  const approveAccount = async (collectorId?: string): Promise<void> => {
    const targetId = collectorId || activeCollector?.id;
    if (targetId) {
      await updateCollectorStatus(targetId, 'ACTIVE');

      recordAuditLog({
        userId: 'admin',
        userRole: 'ADMIN',
        action: 'APPROVE_MANAGER',
        entityType: 'COLLECTOR',
        entityId: targetId,
        reason: 'Approbation manuelle par administrateur',
      }).catch(() => {});

      await refreshSession();
      setIsPendingApproval(false);
      setIsAuthenticated(true);
      triggerSuccessFeedback();
    }
  };

  const getAllManagers = async (): Promise<Collector[]> => {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      full_name: string;
      phone_number: string;
      pin_hash: string;
      status: UserStatus;
      zone: string | null;
      created_at: string;
    }>(`SELECT * FROM collectors ORDER BY created_at DESC`);

    return rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      phoneNumber: r.phone_number,
      pinHash: r.pin_hash,
      status: r.status,
      role: 'MANAGER' as UserRole,
      zone: r.zone || undefined,
      createdAt: r.created_at,
    }));
  };

  const getAllBusinesses = async (): Promise<BusinessConfig[]> => {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      collector_id: string;
      name: string;
      type: BusinessType;
      contribution_amount: number;
      frequency: any;
      total_slots: number;
      start_date: string;
      end_date: string;
      status: any;
      cycle_status: any;
      created_at: string;
    }>(`SELECT * FROM business_configs ORDER BY created_at DESC`);

    return rows.map((r) => ({
      id: r.id,
      collectorId: r.collector_id,
      name: r.name,
      type: r.type,
      contributionAmount: Number(r.contribution_amount),
      frequency: r.frequency,
      totalSlots: Number(r.total_slots),
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status || 'ACTIVE',
      cycleStatus: r.cycle_status || 'ACTIVE',
      createdAt: r.created_at,
    }));
  };

  const switchRole = (role: UserRole) => {
    setUserRole(role);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('SOL_IS_LOGGED_IN');
    setIsAuthenticated(false);
    setIsPendingApproval(false);
    setUserRole('MANAGER');
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
        isPendingApproval,
        isLoading,
        loginWithPin,
        loginAsAdmin,
        verifyPin,
        getAdminProfile,
        updateAdminProfile,
        registerManager,
        approveAccount,
        getAllManagers,
        getAllBusinesses,
        switchRole,
        logout,
        refreshSession,
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
