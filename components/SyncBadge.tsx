import React from 'react';
import { Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSync } from '@/context/SyncContext';
import { Icon, Text, UiIconName } from '@/components/ui';
import { triggerLightImpact } from '@/lib/haptics';
import { useTheme } from '@/theme';

interface SyncBadgeProps {
  onSyncComplete?: () => void;
  /** Icon + count only (small screens); the full label stays in the accessibility label. */
  compact?: boolean;
}

/**
 * Sync status chip. Pending operations are a normal offline state, not an error:
 * neutral tone, never red.
 */
export const SyncBadge: React.FC<SyncBadgeProps> = ({ onSyncComplete, compact = false }) => {
  const router = useRouter();
  const { syncState, triggerSync } = useSync();
  const { colors, spacing, radius, layout } = useTheme();

  const handlePress = async () => {
    triggerLightImpact();
    if (syncState.pendingCount > 0 && !syncState.isSyncing) {
      await triggerSync();
      if (onSyncComplete) onSyncComplete();
    } else {
      router.push('/modal' as any);
    }
  };

  const getStatusDisplay = (): { bg: string; fg: string; label: string; short: string; icon?: UiIconName; spinner?: boolean } => {
    if (syncState.isSyncing) {
      return { bg: colors.infoSoft, fg: colors.info, label: 'Envoi…', short: '', spinner: true };
    }
    if (!syncState.isOnline) {
      return {
        bg: colors.surfaceAlt,
        fg: colors.textMuted,
        label: syncState.pendingCount > 0 ? `${syncState.pendingCount} en attente · hors ligne` : 'Hors ligne',
        short: syncState.pendingCount > 0 ? String(syncState.pendingCount) : '',
        icon: 'alert',
      };
    }
    if (syncState.pendingCount > 0) {
      return {
        bg: colors.surfaceAlt,
        fg: colors.textMuted,
        label: `${syncState.pendingCount} à synchroniser`,
        short: String(syncState.pendingCount),
        icon: 'cycle',
      };
    }
    return { bg: colors.successSoft, fg: colors.success, label: 'Synchronisé', short: '', icon: 'check' };
  };

  const config = getStatusDisplay();
  const text = compact ? config.short : config.label;

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Statut de synchronisation : ${config.label}`}
      style={({ pressed }) => [
        styles.container,
        {
          minHeight: layout.touchTarget - spacing.md,
          paddingHorizontal: spacing.sm,
          gap: spacing.xs,
          borderRadius: radius.pill,
          backgroundColor: pressed ? colors.surfacePressed : config.bg,
        },
      ]}
    >
      {config.spinner ? (
        <ActivityIndicator size="small" color={config.fg} />
      ) : config.icon ? (
        <Icon name={config.icon} size={16} color={config.fg} />
      ) : null}
      {text ? (
        <Text variant="label" style={{ color: config.fg }} numberOfLines={1}>
          {text}
        </Text>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
