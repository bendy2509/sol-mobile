import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';

import { Header } from '@/components/Header';
import { MemberCard } from '@/components/MemberCard';
import { Icon } from '@/components/Icon';
import { getDashboardMetrics } from '@/db/businessRepository';
import { getMembersWithPaymentStatus, payoutMemberHand } from '@/db/memberRepository';
import { useSync } from '@/context/SyncContext';
import { DashboardMetrics, FilterStatus, Member, SortOption } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function DashboardScreen() {
  const router = useRouter();
  const { triggerSync } = useSync();

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    handsCollected: 0,
    handsRemaining: 0,
    totalHandsExpected: 0,
    daysRemaining: 0,
    totalCashToday: 0,
    overdueMembersCount: 0,
    overdueHandsCount: 0,
    paidTodayCount: 0,
    unpaidTodayCount: 0,
    totalMembersCount: 0,
    currentRound: 1,
    totalRounds: 1,
    businessName: 'Chargement...',
    businessType: 'SABOTAY',
    contributionAmount: 0,
    frequency: 'DAILY',
    startDate: '',
    endDate: '',
  });

  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [sort, setSort] = useState<SortOption>('PAYOUT_RANK');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [fetchedMetrics, memberList] = await Promise.all([
        getDashboardMetrics(),
        getMembersWithPaymentStatus({
          filter,
          sort,
          search: searchQuery,
        }),
      ]);
      setMetrics(fetchedMetrics);
      setMembers(memberList);
    } catch (err) {
      console.warn('Dashboard load error:', err);
    }
  }, [filter, sort, searchQuery]);

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

  const handleFilterChange = (newFilter: FilterStatus) => {
    triggerLightImpact();
    setFilter(newFilter);
  };

  const handleSortChange = (newSort: SortOption) => {
    triggerLightImpact();
    setSort(newSort);
  };

  const handlePayoutHand = async (member: Member) => {
    triggerMediumImpact();
    const potAmount = metrics.contributionAmount * metrics.totalHandsExpected;

    Alert.alert(
      'Décaisser la Main (Remettre la Cagnotte)',
      `Confirmez-vous le versement de la main pour ${member.fullName} d'un montant de ${formatCurrency(potAmount)} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer le Décaissement',
          style: 'default',
          onPress: async () => {
            try {
              await payoutMemberHand(member.id, potAmount);
              triggerSuccessFeedback();
              Alert.alert('Succès', `La main a été remise avec succès à ${member.fullName}.`);
              loadData();
            } catch (err: any) {
              Alert.alert('Erreur', err?.message || 'Échec du décaissement.');
            }
          },
        },
      ]
    );
  };

  const progressPct =
    metrics.totalHandsExpected > 0
      ? Math.min(100, Math.round((metrics.handsCollected / metrics.totalHandsExpected) * 100))
      : 0;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={metrics.businessName || 'SOL'}
        subtitle={`Cotisation: ${formatCurrency(metrics.contributionAmount)} • Fin: ${formatDateShort(metrics.endDate)}`}
        onRefresh={handleRefresh}
      />

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MemberCard
            member={item}
            isPayoutTurn={metrics.currentPayoutBeneficiary?.id === item.id}
            onPayoutHand={handlePayoutHand}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[SOL_COLORS.primary]}
          />
        }
        ListHeaderComponent={
          <View style={styles.dashboardHeader}>
            {/* 4 Metrics Synthesis Cards Grid */}
            <View style={styles.metricsGrid}>
              {/* 1. Mains Collectées & Restantes */}
              <View style={[styles.metricCard, styles.metricCardPrimary]}>
                <View style={styles.metricCardTop}>
                  <Text style={styles.metricLabel}>MAINS DU CYCLE</Text>
                  <Icon name="target" size={16} color="#FFFFFF" />
                </View>
                <View style={styles.metricValueRow}>
                  <Text style={styles.metricValueLight}>
                    {metrics.handsCollected}
                    <Text style={styles.metricValueLightSub}> / {metrics.totalHandsExpected}</Text>
                  </Text>
                </View>
                {/* Progress bar */}
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
                </View>
                <Text style={styles.metricSubLight}>
                  {metrics.handsRemaining} mains restantes ({progressPct}%)
                </Text>
              </View>

              {/* 2. Jours Restants */}
              <View style={styles.metricCard}>
                <View style={styles.metricCardTop}>
                  <Text style={styles.metricLabelDark}>JOURS RESTANTS</Text>
                  <Icon name="clock" size={16} color={SOL_COLORS.primary} />
                </View>
                <Text style={styles.metricValueDark}>{metrics.daysRemaining} j</Text>
                <Text style={styles.metricSubDark}>
                  Clôture le {formatDateShort(metrics.endDate)}
                </Text>
              </View>

              {/* 3. Total Disponible en Caisse */}
              <View style={styles.metricCard}>
                <View style={styles.metricCardTop}>
                  <Text style={styles.metricLabelDark}>EN CAISSE AUJOURD'HUI</Text>
                  <Icon name="cash" size={16} color="#059669" />
                </View>
                <Text style={[styles.metricValueDark, { color: '#059669' }]}>
                  {formatCurrency(metrics.totalCashToday)}
                </Text>
                <Text style={styles.metricSubDark}>
                  {metrics.paidTodayCount} versements reçus
                </Text>
              </View>

              {/* 4. Mains en Retard */}
              <View
                style={[
                  styles.metricCard,
                  metrics.overdueMembersCount > 0 && styles.metricCardAlert,
                ]}
              >
                <View style={styles.metricCardTop}>
                  <Text
                    style={[
                      styles.metricLabelDark,
                      metrics.overdueMembersCount > 0 && { color: '#B91C1C' },
                    ]}
                  >
                    MAINS EN RETARD
                  </Text>
                  <Icon
                    name="alert"
                    size={16}
                    color={metrics.overdueMembersCount > 0 ? '#DC2626' : '#94A3B8'}
                  />
                </View>
                <Text
                  style={[
                    styles.metricValueDark,
                    metrics.overdueMembersCount > 0 && { color: '#DC2626' },
                  ]}
                >
                  {metrics.overdueMembersCount}
                </Text>
                <Text
                  style={[
                    styles.metricSubDark,
                    metrics.overdueMembersCount > 0 && { color: '#B91C1C' },
                  ]}
                >
                  {metrics.overdueHandsCount} cotisations impayées
                </Text>
              </View>
            </View>

            {/* Sol Turn Hero Banner (if a member is designated for payout) */}
            {metrics.currentPayoutBeneficiary && (
              <View style={styles.heroPayoutBanner}>
                <View style={styles.heroPayoutHeader}>
                  <Icon name="crown" size={18} color="#1D4ED8" />
                  <Text style={styles.heroPayoutTitle}>TOUR DU JOUR (BÉNÉFICIAIRE)</Text>
                </View>
                <View style={styles.heroPayoutBody}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroBeneficiaryName}>
                      {metrics.currentPayoutBeneficiary.fullName}
                    </Text>
                    <Text style={styles.heroBeneficiarySub}>
                      Main #{metrics.currentPayoutBeneficiary.payoutRank} • Cagnotte :{' '}
                      {formatCurrency(
                        metrics.contributionAmount * metrics.totalHandsExpected
                      )}
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handlePayoutHand(metrics.currentPayoutBeneficiary!)}
                    style={styles.heroPayoutBtn}
                  >
                    <Text style={styles.heroPayoutBtnText}>Décaisser</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Search Input */}
            <View style={styles.searchBar}>
              <Icon name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher par nom, téléphone..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Icon name="close" size={16} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Horizontal Tabs */}
            <View style={styles.filterScroll}>
              <TouchableOpacity
                onPress={() => handleFilterChange('ALL')}
                style={[styles.filterChip, filter === 'ALL' && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === 'ALL' && styles.filterChipTextActive,
                  ]}
                >
                  Tous ({metrics.totalMembersCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleFilterChange('PAID_TODAY')}
                style={[styles.filterChip, filter === 'PAID_TODAY' && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === 'PAID_TODAY' && styles.filterChipTextActive,
                  ]}
                >
                  Payé ({metrics.paidTodayCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleFilterChange('UNPAID_TODAY')}
                style={[styles.filterChip, filter === 'UNPAID_TODAY' && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === 'UNPAID_TODAY' && styles.filterChipTextActive,
                  ]}
                >
                  Non payé ({metrics.unpaidTodayCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleFilterChange('OVERDUE')}
                style={[styles.filterChip, filter === 'OVERDUE' && styles.filterChipAlertActive]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === 'OVERDUE' && styles.filterChipTextAlertActive,
                  ]}
                >
                  En retard ({metrics.overdueMembersCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleFilterChange('UPCOMING_PAYOUT')}
                style={[
                  styles.filterChip,
                  filter === 'UPCOMING_PAYOUT' && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === 'UPCOMING_PAYOUT' && styles.filterChipTextActive,
                  ]}
                >
                  Mains à toucher
                </Text>
              </TouchableOpacity>
            </View>

            {/* Members Section Title + Count */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                ADHÉRENTS ("ENFANTS") • {members.length}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  const nextSort: Record<SortOption, SortOption> = {
                    PAYOUT_RANK: 'NAME',
                    NAME: 'BALANCE',
                    BALANCE: 'OVERDUE',
                    OVERDUE: 'PAYOUT_RANK',
                    RECENT: 'PAYOUT_RANK',
                  };
                  handleSortChange(nextSort[sort]);
                }}
                style={styles.sortToggle}
              >
                <Icon name="filter" size={12} color="#64748B" style={{ marginRight: 4 }} />
                <Text style={styles.sortToggleText}>
                  Tri: {sort === 'PAYOUT_RANK' ? 'Rang' : sort === 'NAME' ? 'Nom' : sort === 'BALANCE' ? 'Solde' : 'Retards'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="users" size={36} color="#94A3B8" />
            <Text style={styles.emptyTitle}>Aucun adhérent trouvé</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? 'Aucun résultat ne correspond à votre recherche.'
                : 'Ajoutez votre premier adhérent pour commencer la collecte.'}
            </Text>
          </View>
        }
      />

      {/* Floating Action Button (+ Nouvel Adhérent) */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          triggerMediumImpact();
          router.push('/client/new' as any);
        }}
        style={styles.fab}
        accessibilityLabel="Ajouter un adhérent"
      >
        <Icon name="plus" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
        <Text style={styles.fabText}>Nouvel Adhérent</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  dashboardHeader: {
    marginBottom: 8,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  metricCardPrimary: {
    backgroundColor: SOL_COLORS.secondary,
    borderColor: '#334155',
  },
  metricCardAlert: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  metricCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  metricLabelDark: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  metricValueLight: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  metricValueLightSub: {
    fontSize: 14,
    color: '#94A3B8',
  },
  metricValueDark: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  metricValueRow: {
    marginBottom: 4,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#34D399',
    borderRadius: 2,
  },
  metricSubLight: {
    fontSize: 10,
    color: '#34D399',
    fontWeight: '700',
  },
  metricSubDark: {
    fontSize: 10,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  heroPayoutBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginBottom: 14,
  },
  heroPayoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  heroPayoutTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  heroPayoutBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroBeneficiaryName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  heroBeneficiarySub: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '600',
    marginTop: 2,
  },
  heroPayoutBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  heroPayoutBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  filterScroll: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  filterChipActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primaryDark,
  },
  filterChipAlertActive: {
    backgroundColor: '#DC2626',
    borderColor: '#B91C1C',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterChipTextAlertActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortToggleText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
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
    paddingHorizontal: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
