import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Button, Card, Icon, Screen, SectionHeader, Text } from '@/components/ui';
import { formatDate } from '@/lib/formatters';
import { Theme, useTheme } from '@/theme';

export default function InfoModalScreen() {
  const { activeCollector } = useAuth();
  const { syncState, triggerSync } = useSync();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleManualSync = async () => {
    await triggerSync();
  };

  const pending = syncState.pendingCount;
  const collectorRows = [
    { label: 'Nom', value: activeCollector?.fullName || '—' },
    { label: 'Téléphone', value: activeCollector?.phoneNumber || '—' },
    { label: 'Zone', value: activeCollector?.zone || '—' },
  ];

  return (
    <Screen
      edges={['left', 'right']}
      contentStyle={styles.content}
      footer={
        <Button
          size="lg"
          fullWidth
          icon="cycle"
          loading={syncState.isSyncing}
          disabled={syncState.isSyncing}
          label={syncState.isSyncing ? 'Synchronisation en cours…' : 'Synchroniser maintenant'}
          onPress={handleManualSync}
        />
      }
    >
      <View style={styles.intro}>
        <Text variant="title" tone="primary">
          SOL Mobile v1.0
        </Text>
        <Text variant="body" tone="muted" align="center">
          Sabotay et Sol en Haïti, conçu pour fonctionner hors ligne.
        </Text>
      </View>

      {/* Sync Diagnostics */}
      <Card tone={syncState.isOnline ? (pending > 0 ? 'warning' : 'success') : 'sunken'} style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={styles.disc}>
            <Icon
              name={syncState.isOnline ? (pending > 0 ? 'clock' : 'check') : 'alert'}
              size={22}
              color={syncState.isOnline ? (pending > 0 ? theme.colors.warning : theme.colors.success) : theme.colors.textMuted}
            />
          </View>
          <View style={styles.flexShrink}>
            <Text variant="subheading">{syncState.isOnline ? 'En ligne' : 'Hors ligne'}</Text>
            <Text variant="caption" tone="muted">
              {syncState.isOnline ? 'Connecté : les opérations peuvent être envoyées.' : 'Mode avion ou local : tout reste enregistré sur l’appareil.'}
            </Text>
          </View>
        </View>
      </Card>

      <View style={styles.section}>
        <SectionHeader title="Synchronisation" />
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text variant="body" tone="muted" style={styles.flexShrink}>
              Transactions en attente d'envoi
            </Text>
            <Text variant="amount" tone={pending > 0 ? 'warning' : 'success'}>
              {pending}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text variant="body" tone="muted" style={styles.flexShrink}>
              Dernière synchronisation
            </Text>
            <Text variant="bodyStrong" align="right" style={styles.value}>
              {syncState.lastSyncedAt ? formatDate(syncState.lastSyncedAt) : 'Aucune récente'}
            </Text>
          </View>
        </Card>
      </View>

      {/* Collector Info */}
      <View style={styles.section}>
        <SectionHeader title="Agent collecteur actif" />
        <Card style={styles.card}>
          {collectorRows.map((r, i) => (
            <React.Fragment key={r.label}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <Text variant="body" tone="muted">
                  {r.label}
                </Text>
                <Text variant="bodyStrong" align="right" numberOfLines={1} style={styles.value}>
                  {r.value}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    content: { gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    intro: { alignItems: 'center', gap: spacing.xs },
    section: { gap: spacing.md },

    statusCard: { gap: spacing.sm },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    disc: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },

    card: { gap: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: spacing.xl },
    value: { flex: 1, minWidth: 0 },
    divider: { height: 1, backgroundColor: colors.border },
  });
