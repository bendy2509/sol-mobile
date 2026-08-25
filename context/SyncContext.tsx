import React, { createContext, useContext, useState, useEffect } from 'react';
import { SyncState } from '@/types';
import { syncEngine } from '@/db/syncEngine';

interface SyncContextType {
  syncState: SyncState;
  triggerSync: () => Promise<{ success: boolean; pushedTransactions: number; error?: string }>;
  refreshPendingCount: () => Promise<number>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [syncState, setSyncState] = useState<SyncState>(syncEngine.getState());

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((state) => {
      setSyncState(state);
    });
    syncEngine.refreshPendingCount();
    return () => unsubscribe();
  }, []);

  const triggerSync = async () => {
    return syncEngine.syncAll();
  };

  const refreshPendingCount = async () => {
    return syncEngine.refreshPendingCount();
  };

  return (
    <SyncContext.Provider
      value={{
        syncState,
        triggerSync,
        refreshPendingCount,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export function useSync(): SyncContextType {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
