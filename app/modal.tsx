import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Icon } from '@/components/Icon';
import { formatDate } from '@/lib/formatters';
import { SOL_COLORS } from '@/constants/Colors';

export default function InfoModalScreen() {
  const { activeCollector } = useAuth();
  const { syncState, triggerSync } = useSync();

  const handleManualSync = async () => {
    await triggerSync();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>SOL Mobile v1.0</Text>
        <Text style={styles.subtitle}>
          Digitalisation du Sabotay & Sol en Haïti (Architecture Offline-First)
        </Text>
      </View>

      {/* Collector Info */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeadingRow}>
          <Icon name="user" size={14} color="#64748B" />
          <Text style={styles.sectionHeading}>AGENT COLLECTEUR ACTIF</Text>
        </View>
        <Text style={styles.infoText}>
          Nom : <Text style={styles.infoBold}>{activeCollector?.fullName}</Text>
        </Text>
        <Text style={styles.infoText}>
          Téléphone : <Text style={styles.infoBold}>{activeCollector?.phoneNumber}</Text>
        </Text>
        <Text style={styles.infoText}>
          Zone : <Text style={styles.infoBold}>{activeCollector?.zone}</Text>
        </Text>
      </View>

      {/* Sync Diagnostics */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeadingRow}>
          <Icon name="sync" size={14} color="#64748B" />
          <Text style={styles.sectionHeading}>DIAGNOSTIC DE SYNCHRONISATION</Text>
        </View>
        <Text style={styles.infoText}>
          Statut Réseau :{' '}
          <Text style={styles.infoBold}>
            {syncState.isOnline ? 'En ligne (Connecté)' : 'Hors-ligne (Mode avion / local)'}
          </Text>
        </Text>
        <Text style={styles.infoText}>
          Transactions en attente d'envoi :{' '}
          <Text
            style={[
              styles.infoBold,
              { color: syncState.pendingCount > 0 ? '#D97706' : '#059669' },
            ]}
          >
            {syncState.pendingCount}
          </Text>
        </Text>
        <Text style={styles.infoText}>
          Dernière synchronisation :{' '}
          <Text style={styles.infoBold}>
            {syncState.lastSyncedAt
              ? formatDate(syncState.lastSyncedAt)
              : 'Aucune synchronisation récente'}
          </Text>
        </Text>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleManualSync}
          style={styles.syncBtn}
        >
          <Text style={styles.syncBtnText}>
            {syncState.isSyncing
              ? 'Synchronisation en cours...'
              : 'Forcer la Synchronisation Maintenant'}
          </Text>
        </TouchableOpacity>
      </View>

      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  content: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: SOL_COLORS.primary,
  },
  subtitle: {
    fontSize: 13,
    color: SOL_COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 16,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 14,
    color: SOL_COLORS.textPrimary,
    marginBottom: 6,
  },
  infoBold: {
    fontWeight: '800',
  },
  syncBtn: {
    backgroundColor: SOL_COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  syncBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
