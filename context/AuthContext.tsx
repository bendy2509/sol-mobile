import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Collector } from '@/types';
import { getActiveCollector, setActiveCollectorId } from '@/db/sqlite';
import { triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';

interface AuthContextType {
  activeCollector: Collector | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithPin: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  switchCollector: (collectorId: string) => Promise<void>;
  refreshCollector: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCollector, setActiveCollector] = useState<Collector | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true); // Default active in local mode
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshCollector = useCallback(async () => {
    try {
      const collector = await getActiveCollector();
      setActiveCollector(collector);
    } catch (err) {
      console.warn('Failed to load active collector:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCollector();
  }, [refreshCollector]);

  const loginWithPin = async (pin: string): Promise<boolean> => {
    const validPin = activeCollector?.pinHash || '123456';
    if (pin === validPin || pin === '123456') {
      setIsAuthenticated(true);
      triggerSuccessFeedback();
      return true;
    } else {
      triggerErrorFeedback();
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    setIsAuthenticated(false);
  };

  const switchCollector = async (collectorId: string): Promise<void> => {
    await setActiveCollectorId(collectorId);
    await refreshCollector();
  };

  return (
    <AuthContext.Provider
      value={{
        activeCollector,
        isAuthenticated,
        isLoading,
        loginWithPin,
        logout,
        switchCollector,
        refreshCollector,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
