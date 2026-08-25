import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { Header } from '@/components/Header';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { getAllTransactions } from '@/db/transactionRepository';
import { useSync } from '@/context/SyncContext';
import { Transaction, TransactionType } from '@/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { triggerLightImpact } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function HistoryScreen() {
  const { triggerSync } = useSync();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filterType, setFilterType] = useState<TransactionType | 'ALL'>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const typeParam = filterType === 'ALL' ? undefined : filterType;
      const list = await getAllTransactions({ type: typeParam, limit: 100 });
      setTransactions(list);
    } catch (err) {
      console.warn('History load error:', err);
    }
  }, [filterType]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await triggerSync();
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleFilter = (type: TransactionType | 'ALL') => {
    triggerLightImpact();
    setFilterType(type);
  };

  const getTransactionTypeLabel = (type: TransactionType) => {
    switch (type) {
      case 'SABOTAY_DEPOSIT':
        return 'Dépôt Sabotay';
      case 'SOL_CONTRIBUTION':
        return 'Cotisation Sol';
      case 'SOL_PAYOUT':
        return 'Décaissement Main';
      case 'WITHDRAWAL':
        return 'Retrait Épargne';
      default:
        return type;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Journal des Opérations"
        subtitle="Historique des versements & transactions"
        onRefresh={handleRefresh}
      />

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handleFilter('ALL')}
          style={[styles.filterChip, filterType === 'ALL' && styles.filterChipActive]}
        >
          <Text
            style={[
              styles.filterText,
              filterType === 'ALL' && styles.filterTextActive,
            ]}
          >
            Toutes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handleFilter('SABOTAY_DEPOSIT')}
          style={[
            styles.filterChip,
            filterType === 'SABOTAY_DEPOSIT' && styles.filterChipActive,
          ]}
        >
          <Text
            style={[
              styles.filterText,
              filterType === 'SABOTAY_DEPOSIT' && styles.filterTextActive,
            ]}
          >
            Sabotay
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handleFilter('SOL_CONTRIBUTION')}
          style={[
            styles.filterChip,
            filterType === 'SOL_CONTRIBUTION' && styles.filterChipActive,
          ]}
        >
          <Text
            style={[
              styles.filterText,
              filterType === 'SOL_CONTRIBUTION' && styles.filterTextActive,
            ]}
          >
            Sol
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handleFilter('SOL_PAYOUT')}
          style={[
            styles.filterChip,
            filterType === 'SOL_PAYOUT' && styles.filterChipActive,
          ]}
        >
          <Text
            style={[
              styles.filterText,
              filterType === 'SOL_PAYOUT' && styles.filterTextActive,
            ]}
          >
            Mains Payées
          </Text>
        </TouchableOpacity>
      </View>

      {/* Transaction List */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[SOL_COLORS.primary]}
          />
        }
        renderItem={({ item }) => {
          const isDeposit =
            item.type === 'SABOTAY_DEPOSIT' || item.type === 'SOL_CONTRIBUTION';

          return (
            <View style={styles.txCard}>
              <View style={styles.txLeft}>
                <View
                  style={[
                    styles.txIcon,
                    isDeposit ? styles.txIconIn : styles.txIconOut,
                  ]}
                >
                  <Icon
                    name={isDeposit ? 'arrow-right' : 'arrow-left'}
                    size={16}
                    color={isDeposit ? '#059669' : '#DC2626'}
                  />
                </View>
                <View>
                  <Text style={styles.txClientName}>
                    {item.clientName || 'Adhérent'}
                  </Text>
                  <Text style={styles.txTypeLabel}>
                    {getTransactionTypeLabel(item.type)}
                  </Text>
                  <Text style={styles.txDate}>
                    {formatDate(item.createdAtLocal)}
                  </Text>
                </View>
              </View>

              <View style={styles.txRight}>
                <Text
                  style={[
                    styles.txAmount,
                    isDeposit ? styles.txAmountIn : styles.txAmountOut,
                  ]}
                >
                  {isDeposit ? '+' : '-'} {formatCurrency(item.amount)}
                </Text>
                <Badge syncStatus={item.syncStatus} style={{ marginTop: 4 }} />
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="history" size={36} color="#94A3B8" />
            <Text style={styles.emptyTitle}>Aucune transaction trouvée</Text>
            <Text style={styles.emptySubtitle}>
              Les encaissements et versements apparaîtront ici.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  filterChipActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primaryDark,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txIconIn: {
    backgroundColor: '#DCFCE7',
  },
  txIconOut: {
    backgroundColor: '#FEE2E2',
  },
  txClientName: {
    fontSize: 15,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  txTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: SOL_COLORS.textSecondary,
    marginTop: 1,
  },
  txDate: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '900',
  },
  txAmountIn: {
    color: '#059669',
  },
  txAmountOut: {
    color: '#DC2626',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});
