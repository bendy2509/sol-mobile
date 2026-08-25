import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSync } from '@/context/SyncContext';
import { Icon } from './Icon';
import { triggerLightImpact } from '@/lib/haptics';

interface SyncBadgeProps {
  onSyncComplete?: () => void;
}

export const SyncBadge: React.FC<SyncBadgeProps> = ({ onSyncComplete }) => {
  const router = useRouter();
  const { syncState, triggerSync } = useSync();

  const handlePress = async () => {
    triggerLightImpact();
    if (syncState.pendingCount > 0 && !syncState.isSyncing) {
      await triggerSync();
      if (onSyncComplete) onSyncComplete();
    } else {
      router.push('/modal' as any);
    }
  };

  const getStatusDisplay = () => {
    if (syncState.isSyncing) {
      return {
        bg: '#EFF6FF',
        border: '#BFDBFE',
        text: '#1D4ED8',
        label: 'Envoi...',
        showSpinner: true,
      };
    }

    if (!syncState.isOnline) {
      return {
        bg: '#FEF2F2',
        border: '#FECACA',
        text: '#B91C1C',
        label: syncState.pendingCount > 0 ? `${syncState.pendingCount} en attente` : 'Hors-Ligne',
        iconName: 'alert' as const,
      };
    }

    if (syncState.pendingCount > 0) {
      return {
        bg: '#FEF3C7',
        border: '#FDE68A',
        text: '#B45309',
        label: `${syncState.pendingCount} à sync`,
        iconName: 'sync' as const,
      };
    }

    return {
      bg: '#DCFCE7',
      border: '#86EFAC',
      text: '#15803D',
      label: 'À jour',
      iconName: 'check' as const,
    };
  };

  const config = getStatusDisplay();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      style={[
        styles.container,
        { backgroundColor: config.bg, borderColor: config.border },
      ]}
      accessibilityLabel={`Statut de synchronisation: ${config.label}`}
    >
      {config.showSpinner ? (
        <ActivityIndicator size="small" color={config.text} style={{ marginRight: 4 }} />
      ) : config.iconName ? (
        <Icon
          name={config.iconName}
          size={11}
          color={config.text}
          style={{ marginRight: 4 }}
        />
      ) : null}
      <Text style={[styles.label, { color: config.text }]}>{config.label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
