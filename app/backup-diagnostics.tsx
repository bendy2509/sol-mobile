import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Button, Card, Icon, Screen, ScreenHeader, Text } from '@/components/ui';

import { getDatabase, getActiveCollectorId } from '@/db/sqlite';
import { getLastMigrationReport, getSchemaVersion, LATEST_SCHEMA_VERSION } from '@/db/migrations';
import { findLedgerDiscrepancies, LedgerDiscrepancy, repairLedgerDiscrepancies } from '@/db/ledgerRepository';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { triggerLightImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { safeBack } from '@/lib/navigation';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

interface DiagnosticState {
  isHealthy: boolean;
  totalClients: number;
  totalTransactions: number;
  schemaVersion: number | null;
  /** Failed migration and migration warnings, in words. */
  problems: string[];
}

/**
 * Troubleshooting tool, opened by a long press on « Version » in Settings: is the local database
 * sound and up to date, and do the stored totals match the operations (repair with the PIN).
 */
export default function BackupDiagnosticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DiagnosticState | null>(null);
  const [discrepancies, setDiscrepancies] = useState<LedgerDiscrepancy[] | null>(null);
  const [isRepairPinOpen, setIsRepairPinOpen] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    triggerLightImpact();
    try {
      const db = await getDatabase();
      const collectorId = await getActiveCollectorId();

      const integrity = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
      const clients = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM clients WHERE collector_id = ?', [collectorId]);
      const txs = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM transactions WHERE collector_id = ?', [collectorId]);
      const schemaVersion = await getSchemaVersion(db);
      const warnings = await db.getAllAsync<{ version: number; warning: string | null }>(
        'SELECT version, warning FROM schema_migrations WHERE warning IS NOT NULL ORDER BY version'
      );
      const lastError = getLastMigrationReport()?.error;

      // Stored totals of every member against the replay of their operations
      setDiscrepancies(await findLedgerDiscrepancies(collectorId).catch(() => null));
      setDiagnostics({
        isHealthy: integrity?.integrity_check === 'ok',
        totalClients: clients?.count || 0,
        totalTransactions: txs?.count || 0,
        schemaVersion,
        problems: [
          ...(lastError ? [t('Migration {0} ({1}) en échec : {2}', lastError.version, lastError.name, lastError.message)] : []),
          ...warnings.map((r) => t('Version {0} : {1}', r.version, t(r.warning ?? ''))),
        ],
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

  const dbOk = !!diagnostics && diagnostics.isHealthy && diagnostics.problems.length === 0;
  const upToDate = diagnostics?.schemaVersion !== null && (diagnostics?.schemaVersion ?? 0) >= LATEST_SCHEMA_VERSION;

  return (
    <Screen
      edges={['top', 'left', 'right', 'bottom']}
      header={<ScreenHeader title={t('Diagnostic')} subtitle={t('Outil de dépannage')} onBack={() => safeBack(router, '/(tabs)/settings')} />}
      contentStyle={styles.content}
      footer={
        <Button variant="secondary" fullWidth icon="cycle" loading={loading} disabled={loading} label={t('Relancer la vérification')} onPress={runDiagnostics} />
      }
    >
      {/* 1. The database file */}
      <Card style={styles.card}>
        <View style={styles.row}>
          {!diagnostics ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <Icon name={dbOk ? 'check' : 'alert'} size={22} color={dbOk ? theme.colors.success : theme.colors.danger} />
          )}
          <View style={styles.flexShrink}>
            <Text variant="bodyStrong">
              {!diagnostics ? t('Vérification en cours…') : dbOk ? t('Base de données en bon état') : t('Base de données à vérifier')}
            </Text>
            {diagnostics ? (
              <Text variant="caption" tone="muted">
                {t('Version {0} / {1}', diagnostics.schemaVersion ?? '—', LATEST_SCHEMA_VERSION)}
                {upToDate ? '' : ` · ${t('Mise à jour au prochain démarrage')}`}
              </Text>
            ) : null}
          </View>
        </View>
        {diagnostics && !diagnostics.isHealthy ? (
          <Text variant="caption" tone="danger">{t('La structure locale présente des incohérences.')}</Text>
        ) : null}
        {diagnostics?.problems.map((line) => (
          <Text key={line} variant="caption" tone="danger">
            {line}
          </Text>
        ))}
      </Card>

      {/* 2. Stored totals against the operations (the ledger decides) */}
      <Card style={styles.card}>
        <View style={styles.row}>
          <Icon
            name={discrepancies?.length ? 'alert' : 'check'}
            size={22}
            color={discrepancies === null ? theme.colors.textMuted : discrepancies.length ? theme.colors.warning : theme.colors.success}
          />
          <Text variant="bodyStrong" style={styles.flexShrink}>
            {discrepancies === null
              ? loading
                ? t('Vérification en cours…')
                : t('Contrôle indisponible.')
              : discrepancies.length === 0
              ? t('Tout est cohérent')
              : t('{0} adhérent(s) à réparer', discrepancies.length)}
          </Text>
        </View>
        {discrepancies?.length ? (
          <>
            <Text variant="caption" tone="muted">
              {t('Le recalcul remplace les totaux enregistrés par ceux des opérations. Les opérations ne changent pas.')}
            </Text>
            <Button icon="lock" label={t('Réparer')} loading={repairing} onPress={() => setIsRepairPinOpen(true)} />
          </>
        ) : null}
      </Card>

      {diagnostics ? (
        <Text variant="caption" tone="muted" align="center">
          {t('{0} adhérents · {1} opérations sur cet appareil', diagnostics.totalClients, diagnostics.totalTransactions)}
        </Text>
      ) : null}

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

const createStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    content: { gap: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
    card: { gap: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  });
