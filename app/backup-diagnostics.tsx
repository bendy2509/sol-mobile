import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { Header } from '@/components/Header';
import { Button, Card, Icon, MetricTile, Screen, SectionHeader, Text } from '@/components/ui';

import { getDatabase, getActiveCollectorId } from '@/db/sqlite';
import { getLastMigrationReport, getSchemaVersion, LATEST_SCHEMA_VERSION } from '@/db/migrations';
import { findLedgerDiscrepancies, LedgerDiscrepancy, repairLedgerDiscrepancies } from '@/db/ledgerRepository';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { TotalsField } from '@/services/ledgerConsistency';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
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
  const [discrepancies, setDiscrepancies] = useState<LedgerDiscrepancy[] | null>(null);
  const [isRepairPinOpen, setIsRepairPinOpen] = useState(false);
  const [repairing, setRepairing] = useState(false);
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

      // 4. Cohérence : totaux des adhérents = rejeu de leurs opérations du cycle
      setDiscrepancies(await findLedgerDiscrepancies(collectorId).catch(() => null));

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

  const fieldLabel: Record<TotalsField, string> = {
    currentBalance: t('Solde'),
    totalPaidAmount: t('Total cotisé'),
    paidHandsCount: t('Mains payées'),
    receivedHandsCount: t('Mains reçues'),
    hasReceivedHand: t('Main reçue'),
    paidUntilDate: t('Couvert jusqu\'au'),
  };
  const showValue = (field: TotalsField, value: unknown) =>
    field === 'currentBalance' || field === 'totalPaidAmount'
      ? formatCurrency(Number(value || 0))
      : field === 'paidUntilDate'
        ? value
          ? formatDateShort(String(value))
          : '—'
        : field === 'hasReceivedHand'
          ? value
            ? t('Oui')
            : t('Non')
          : String(value ?? 0);

  const handleRepair = async () => {
    setIsRepairPinOpen(false);
    if (!discrepancies?.length) return;
    setRepairing(true);
    try {
      const n = await repairLedgerDiscrepancies(discrepancies);
      triggerSuccessFeedback();
      Alert.alert(t('Totaux recalculés'), t('{0} adhérent(s) corrigé(s) à partir de leurs opérations.', n));
      await runDiagnostics();
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert(t('Erreur'), err?.message || t('Le recalcul a échoué.'));
    } finally {
      setRepairing(false);
    }
  };
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

      {/* Cohérence : le journal des opérations fait foi */}
      <View style={styles.section}>
        <SectionHeader title={t('Cohérence du carnet')} />
        {discrepancies === null ? (
          <Card tone="sunken">
            <Text variant="caption" tone="muted">
              {loading ? t('Vérification en cours…') : t('Contrôle indisponible.')}
            </Text>
          </Card>
        ) : discrepancies.length === 0 ? (
          <Card tone="success">
            <View style={styles.statusRow}>
              <Icon name="check" size={20} color={theme.colors.success} />
              <Text variant="body" tone="success" style={styles.flexShrink}>
                {t('Les totaux de chaque adhérent correspondent à ses opérations.')}
              </Text>
            </View>
          </Card>
        ) : (
          <Card tone="warning" style={styles.ledgerCard}>
            <Text variant="bodyStrong" tone="warning">
              {t('{0} adhérent(s) dont les totaux diffèrent de leurs opérations', discrepancies.length)}
            </Text>
            {discrepancies.map((d) => (
              <View key={d.clientId} style={styles.ledgerRow}>
                <Text variant="label">{d.fullName}</Text>
                {d.differences.map((x) => (
                  <Text key={x.field} variant="caption" tone="muted">
                    {t('{0} : enregistré {1}, selon les opérations {2}', fieldLabel[x.field], showValue(x.field, x.stored), showValue(x.field, x.ledger))}
                  </Text>
                ))}
              </View>
            ))}
            <Text variant="caption" tone="muted">
              {t('Le recalcul remplace les totaux enregistrés par ceux des opérations. Les opérations ne changent pas.')}
            </Text>
            <Button
              icon="lock"
              label={t('Recalculer depuis les opérations')}
              loading={repairing}
              onPress={() => setIsRepairPinOpen(true)}
            />
          </Card>
        )}
      </View>

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
      <PinVerificationModal
        visible={isRepairPinOpen}
        title={t('Confirmer le recalcul')}
        subtitle={t('Votre code PIN valide la correction des totaux.')}
        onSuccess={handleRepair}
        onCancel={() => setIsRepairPinOpen(false)}
      />
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
    ledgerCard: { gap: spacing.md },
    ledgerRow: { gap: spacing.xs },
    tile: { flexBasis: '47%', flexGrow: 1 },
  });
