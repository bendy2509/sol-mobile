import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { Header } from '@/components/Header';
import { Button, Card, Icon, MetricTile, Screen, SectionHeader, Text } from '@/components/ui';

import { getDatabase, getActiveCollectorId } from '@/db/sqlite';
import { getLastMigrationReport, getSchemaVersion, LATEST_SCHEMA_VERSION } from '@/db/migrations';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

interface DiagnosticState {
  isHealthy: boolean;
  totalClients: number;
  totalTransactions: number;
  pendingSyncCount: number;
  dbSizeBytes: number;
  lastCheckTime: string;
  /** null on the web preview (no real SQLite there). */
  schemaVersion: number | null;
  schemaWarnings: string[];
  migrationError: string | null;
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

      // 3. Schéma versionné (migrations)
      let schemaVersion: number | null = null;
      let schemaWarnings: string[] = [];
      if (Platform.OS !== 'web') {
        schemaVersion = await getSchemaVersion(db);
        const rows = await db.getAllAsync<{ version: number; warning: string | null }>(
          'SELECT version, warning FROM schema_migrations WHERE warning IS NOT NULL ORDER BY version'
        );
        schemaWarnings = rows.map((r) => t('Version {0} : {1}', r.version, t(r.warning ?? '')));
      }
      const lastError = getLastMigrationReport()?.error;

      setDiagnostics({
        schemaVersion,
        schemaWarnings,
        migrationError: lastError ? t('Migration {0} ({1}) en échec : {2}', lastError.version, lastError.name, lastError.message) : null,
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
      Alert.alert(t('Erreur Diagnostic'), err?.message || t('Impossible d’inspecter la base locale.'));
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
          title={t('Diagnostic & sauvegarde')}
          subtitle={t('Intégrité locale et sécurité des écritures')}
          showBack
          showScanner={false}
          fallbackBackRoute="/(tabs)"
        />
      }
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button size="lg" fullWidth icon="download" label={t('Sauvegarde chiffrée')} onPress={() => router.push('/(tabs)/settings' as any)} />
          <Button variant="secondary" fullWidth icon="cycle" loading={loading} disabled={loading} label={t('Relancer le test d\'intégrité')} onPress={runDiagnostics} />
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
              {!diagnostics ? t('Vérification en cours…') : diagnostics.isHealthy ? t('Base SQLite intègre (mode WAL)') : t('Anomalie détectée')}
            </Text>
            <Text variant="caption" tone="muted">
              {!diagnostics
                ? t('Contrôle de la base locale.')
                : diagnostics.isHealthy
                  ? t('Vérification réussie à {0}. Aucune corruption de bloc.', diagnostics.lastCheckTime)
                  : t('La structure locale présente des incohérences.')}
            </Text>
          </View>
        </View>
      </Card>

      {diagnostics && (diagnostics.migrationError || diagnostics.schemaWarnings.length > 0) ? (
        <Card tone="warning">
          <View style={styles.statusRow}>
            <Icon name="alert" size={20} color={theme.colors.warning} />
            <View style={styles.flexShrink}>
              <Text variant="bodyStrong" tone="warning">
                {t('Base de données à vérifier')}
              </Text>
              {[diagnostics.migrationError, ...diagnostics.schemaWarnings].filter(Boolean).map((line) => (
                <Text key={line as string} variant="caption" tone="warning">
                  {line}
                </Text>
              ))}
            </View>
          </View>
        </Card>
      ) : null}

      {/* Métriques Locales Inspectées */}
      <View style={styles.section}>
        <SectionHeader title={t('Persistance locale')} />
        <View style={styles.grid}>
          <MetricTile label={t('Adhérents enrôlés')} icon="users" value={String(diagnostics?.totalClients ?? '–')} hint={t('Stockés sur l\'appareil')} style={styles.tile} />
          <MetricTile label={t('Transactions')} icon="history" value={String(diagnostics?.totalTransactions ?? '–')} hint={t('Entrées immuables')} style={styles.tile} />
          <MetricTile
            label={t('Version du schéma')}
            icon="settings"
            value={
              !diagnostics
                ? '–'
                : diagnostics.schemaVersion === null
                  ? t('Démo web')
                  : `${diagnostics.schemaVersion} / ${LATEST_SCHEMA_VERSION}`
            }
            hint={
              diagnostics?.schemaVersion === null
                ? t('Pas de migrations sur le web')
                : diagnostics && diagnostics.schemaVersion !== null && diagnostics.schemaVersion >= LATEST_SCHEMA_VERSION
                  ? t('À jour')
                  : t('Mise à jour au prochain démarrage')
            }
            tone={diagnostics?.migrationError || diagnostics?.schemaWarnings.length ? 'warning' : 'default'}
            style={styles.tile}
          />
          <MetricTile label={t('Sécurité atomique')} icon="lock" value={t('Active')} hint="withTransactionAsync" tone="success" style={styles.tile} />
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
