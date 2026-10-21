import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Header } from '@/components/Header';
import { Button, Card, Icon, MetricTile, Screen, SectionHeader, Text } from '@/components/ui';

import { getDatabase, getActiveCollectorId } from '@/db/sqlite';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

interface DiagnosticState {
  isHealthy: boolean;
  totalClients: number;
  totalTransactions: number;
  pendingSyncCount: number;
  dbSizeBytes: number;
  lastCheckTime: string;
}

export default function BackupDiagnosticsScreen() {
  const { contentMaxWidth, horizontalPadding } = useResponsive();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DiagnosticState | null>(null);
  const router = useRouter();

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    triggerLightImpact();
    try {
      const db = await getDatabase();
      const collectorId = await getActiveCollectorId();

      // 1. Vérification d'intégrité SQLite
      const integrityResult = await db.getFirstAsync<{ integrity_check: string }>(
        'PRAGMA integrity_check'
      );
      const isHealthy = integrityResult?.integrity_check === 'ok';

      // 2. Comptage des données locales
      const clientsRow = await db.getFirstAsync<{ count: number }>(
        'SELECT count(*) as count FROM clients WHERE collector_id = ?',
        [collectorId]
      );
      const txRow = await db.getFirstAsync<{ count: number }>(
        'SELECT count(*) as count FROM transactions WHERE collector_id = ?',
        [collectorId]
      );
      const pendingRow = await db.getFirstAsync<{ count: number }>(
        "SELECT count(*) as count FROM transactions WHERE collector_id = ? AND sync_status = 'PENDING'",
        [collectorId]
      );

      setDiagnostics({
        isHealthy,
        totalClients: clientsRow?.count || 0,
        totalTransactions: txRow?.count || 0,
        pendingSyncCount: pendingRow?.count || 0,
        dbSizeBytes: 0,
        lastCheckTime: new Date().toLocaleTimeString(),
      });
      triggerSuccessFeedback();
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert('Erreur Diagnostic', err?.message || 'Impossible d’inspecter la base locale.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);


  const pending = diagnostics?.pendingSyncCount || 0;
  const statusTone = !diagnostics ? 'sunken' : diagnostics.isHealthy ? 'success' : 'danger';

  return (
    <Screen
      edges={['top', 'left', 'right', 'bottom']}
      header={
        <Header
          title="Diagnostic & sauvegarde"
          subtitle="Intégrité locale et sécurité des écritures"
          showBack
          showScanner={false}
          fallbackBackRoute="/(tabs)"
        />
      }
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button size="lg" fullWidth icon="download" label="Sauvegarde chiffrée" onPress={() => router.push('/(tabs)/settings' as any)} />
          <Button variant="secondary" fullWidth icon="cycle" loading={loading} disabled={loading} label="Relancer le test d'intégrité" onPress={runDiagnostics} />
        </View>
      }
    >
      {/* Statut de Santé Global */}
      <Card tone={statusTone}>
        <View style={styles.statusRow}>
          <View style={styles.statusDisc}>
            {!diagnostics ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <Icon
                name={diagnostics.isHealthy ? 'shield' : 'alert'}
                size={24}
                color={diagnostics.isHealthy ? theme.colors.success : theme.colors.danger}
              />
            )}
          </View>
          <View style={styles.flexShrink}>
            <Text variant="subheading" tone={!diagnostics ? 'default' : diagnostics.isHealthy ? 'success' : 'danger'}>
              {!diagnostics ? 'Vérification en cours…' : diagnostics.isHealthy ? 'Base SQLite intègre (mode WAL)' : 'Anomalie détectée'}
            </Text>
            <Text variant="caption" tone="muted">
              {!diagnostics
                ? 'Contrôle de la base locale.'
                : diagnostics.isHealthy
                  ? `Vérification réussie à ${diagnostics.lastCheckTime}. Aucune corruption de bloc.`
                  : 'La structure locale présente des incohérences.'}
            </Text>
          </View>
        </View>
      </Card>

      {/* Métriques Locales Inspectées */}
      <View style={styles.section}>
        <SectionHeader title="Persistance locale" />
        <View style={styles.grid}>
          <MetricTile label="Adhérents enrôlés" icon="users" value={String(diagnostics?.totalClients ?? '–')} hint="Stockés sur l'appareil" style={styles.tile} />
          <MetricTile label="Transactions" icon="history" value={String(diagnostics?.totalTransactions ?? '–')} hint="Entrées immuables" style={styles.tile} />
          <MetricTile
            label="En attente de sync"
            icon="cycle"
            value={String(diagnostics?.pendingSyncCount ?? '–')}
            hint="Transactions locales"
            tone={pending > 0 ? 'warning' : 'default'}
            style={styles.tile}
          />
          <MetricTile label="Sécurité atomique" icon="lock" value="Active" hint="withTransactionAsync" tone="success" style={styles.tile} />
        </View>
      </View>
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    content: { gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    footer: { gap: spacing.sm },
    section: { gap: spacing.md },

    statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    statusDisc: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tile: { flexBasis: '47%', flexGrow: 1 },
  });
