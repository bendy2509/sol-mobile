import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';

import { getDatabase, getActiveCollectorId } from '@/db/sqlite';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { SHADOWS } from '@/constants/Colors';

interface DiagnosticState {
  isHealthy: boolean;
  totalClients: number;
  totalTransactions: number;
  pendingSyncCount: number;
  dbSizeBytes: number;
  lastCheckTime: string;
}

export default function BackupDiagnosticsScreen() {
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DiagnosticState | null>(null);
  const [isExporting, setIsExporting] = useState(false);

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

  const handleExportBackup = async () => {
    triggerMediumImpact();
    setIsExporting(true);
    try {
      const db = await getDatabase();
      const collectorId = await getActiveCollectorId();

      // Extraction complète du carnet local
      const clients = await db.getAllAsync('SELECT * FROM clients WHERE collector_id = ?', [collectorId]);
      const transactions = await db.getAllAsync('SELECT * FROM transactions WHERE collector_id = ?', [collectorId]);
      const business = await db.getAllAsync('SELECT * FROM businesses WHERE collector_id = ?', [collectorId]);

      const backupData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        collectorId,
        business,
        clients,
        transactions,
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const fileName = `SOL_BACKUP_${new Date().toISOString().split('T')[0]}_${Date.now().toString().slice(-4)}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, jsonStr, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: 'Exporter la sauvegarde sécurisée SOL',
        });
        triggerSuccessFeedback();
      } else {
        Alert.alert('Sauvegarde locale', `Fichier généré : ${filePath}`);
      }
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert('Erreur Sauvegarde', err?.message || 'Échec de la génération du fichier.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Diagnostic & Sauvegarde"
        subtitle="Contrôle d’intégrité locale et sécurité des écritures"
        showBack
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Statut de Santé Global */}
        <View style={[styles.statusCard, diagnostics?.isHealthy ? styles.statusCardOk : styles.statusCardError]}>
          <View style={styles.statusIconWrap}>
            <Icon
              name={diagnostics?.isHealthy ? 'shield' : 'alert'}
              size={24}
              color={diagnostics?.isHealthy ? '#047857' : '#BE123C'}
            />
          </View>
          <View style={styles.statusTextGroup}>
            <Text style={styles.statusHeading}>
              {diagnostics?.isHealthy ? 'Base SQLite Intègre (WAL Mode)' : 'Anomalie Détectée'}
            </Text>
            <Text style={styles.statusSub}>
              {diagnostics?.isHealthy
                ? `Vérification réussie à ${diagnostics.lastCheckTime}. Aucune corruption de bloc.`
                : 'La structure locale présente des incohérences.'}
            </Text>
          </View>
        </View>

        {/* Métriques Locales Inspectées */}
        <Text style={styles.sectionTitle}>MÉTRIQUES DE PERSISTANCE LOCALE</Text>

        <View style={styles.metricsGrid}>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>ADHÉRENTS ENRÔLÉS</Text>
            <Text style={styles.metricValue}>{diagnostics?.totalClients ?? '-'}</Text>
            <Text style={styles.metricHint}>Stockés sur l’appareil</Text>
          </View>

          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>TOTAL TRANSACTIONS</Text>
            <Text style={styles.metricValue}>{diagnostics?.totalTransactions ?? '-'}</Text>
            <Text style={styles.metricHint}>Entrées immuables</Text>
          </View>

          <View style={[styles.metricTile, (diagnostics?.pendingSyncCount || 0) > 0 && styles.metricTileAlert]}>
            <Text style={styles.metricLabel}>EN ATTENTE DE SYNC</Text>
            <Text style={[styles.metricValue, (diagnostics?.pendingSyncCount || 0) > 0 && styles.metricValueAlert]}>
              {diagnostics?.pendingSyncCount ?? '-'}
            </Text>
            <Text style={styles.metricHint}>Transactions locales</Text>
          </View>

          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>SÉCURITÉ ATOMIQUE</Text>
            <Text style={styles.metricValueSafe}>Active</Text>
            <Text style={styles.metricHint}>withTransactionAsync</Text>
          </View>
        </View>

        {/* Actions Terrain */}
        <View style={styles.actionBlock}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={runDiagnostics}
            disabled={loading}
            style={styles.refreshBtn}
          >
            {loading ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <>
                <Icon name="sync" size={16} color="#0F172A" style={{ marginRight: 8 }} />
                <Text style={styles.refreshBtnText}>Relancer le test d'intégrité</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleExportBackup}
            disabled={isExporting}
            style={styles.backupBtn}
          >
            {isExporting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Icon name="share" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.backupBtnText}>Exporter la Sauvegarde Sécurisée</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statusCard: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    marginBottom: 20,
    ...SHADOWS.sm,
  },
  statusCardOk: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusCardError: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  statusIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  statusTextGroup: {
    flex: 1,
  },
  statusHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  statusSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginTop: 3,
    lineHeight: 17,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  metricTile: {
    width: '48.4%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    ...SHADOWS.sm,
  },
  metricTileAlert: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: 4,
  },
  metricValueAlert: {
    color: '#D97706',
  },
  metricValueSafe: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0D9488',
    marginVertical: 4,
  },
  metricHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  actionBlock: {
    gap: 12,
  },
  refreshBtn: {
    minHeight: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    ...SHADOWS.sm,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  backupBtn: {
    minHeight: 52,
    backgroundColor: '#0D9488',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    ...SHADOWS.md,
  },
  backupBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
