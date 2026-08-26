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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';

import { Header } from '@/components/Header';
import { MemberCard } from '@/components/MemberCard';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { getDashboardMetrics, getActiveBusinessConfig } from '@/db/businessRepository';
import { getMembersWithPaymentStatus, payoutMemberHand } from '@/db/memberRepository';
import { getActiveCollector } from '@/db/sqlite';
import { generateManagerBusinessReportPdf, sharePdfFile } from '@/services/pdfService';
import { useSync } from '@/context/SyncContext';
import { DashboardMetrics, FilterStatus, Member, SortOption } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function DashboardScreen() {
  const router = useRouter();
  const { triggerSync } = useSync();

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    unitAmount: 250,
    totalPotAmount: 2500,
    handsCollectedToday: 0,
    handsCollectedTotal: 0,
    totalHandsExpected: 10,
    daysRemaining: 0,
    overdueMembersCount: 0,
    overdueHandsCount: 0,
    paidTodayCount: 0,
    unpaidTodayCount: 0,
    totalMembersCount: 0,
    handsTouchedCount: 0,
    businessName: 'Chargement...',
    businessType: 'SABOTAY',
    frequency: 'DAILY',
    startDate: '',
    endDate: '',
    handsCollected: 0,
    handsRemaining: 10,
    totalCashToday: 0,
    contributionAmount: 250,
    currentRound: 1,
    totalRounds: 10,
  });

  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [sort, setSort] = useState<SortOption>('PAYOUT_RANK');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Payout Flow State
  const [payoutTargetMember, setPayoutTargetMember] = useState<Member | null>(null);
  const [payoutNote, setPayoutNote] = useState('');
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

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

  const handleInitiatePayout = (member: Member) => {
    triggerMediumImpact();
    setPayoutTargetMember(member);
    setPayoutNote(`Remise de la main #${member.rankOrder || 1} - ${member.fullName}`);
    setIsPayoutModalOpen(true);
  };

  const handleConfirmPayoutDetails = () => {
    if (!payoutNote.trim()) {
      Alert.alert('Justification requise', 'Veuillez saisir une note ou motif pour le déblocage de la main.');
      return;
    }
    setIsPayoutModalOpen(false);
    setIsPinModalOpen(true);
  };

  const handlePinSuccessPayout = async () => {
    setIsPinModalOpen(false);
    if (!payoutTargetMember) return;

    try {
      await payoutMemberHand(
        payoutTargetMember.id,
        metrics.totalPotAmount,
        payoutNote.trim()
      );
      triggerSuccessFeedback();
      Alert.alert(
        'Main Remise avec Succès !',
        `La cagnotte complète de ${formatCurrency(metrics.totalPotAmount)} a été décaissée pour ${payoutTargetMember.fullName}.\n\nRappel : Cet enfant reste actif et doit continuer ses cotisations restantes jusqu'à la fin du cycle.`
      );
      loadData();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Échec du décaissement.');
    } finally {
      setPayoutTargetMember(null);
    }
  };

  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const handleGenerateBusinessReport = async () => {
    triggerMediumImpact();
    setIsGeneratingReport(true);
    try {
      const activeCollector = await getActiveCollector();
      const currentMembers = await getMembersWithPaymentStatus({ filter: 'ALL', sort: 'PAYOUT_RANK' });

      const totalCashCollected = currentMembers.reduce((sum, m) => sum + (m.totalPaidInCycle || m.currentBalance || 0), 0);
      const totalDistributed = currentMembers.filter(m => m.hasReceivedPayout).length * metrics.totalPotAmount;
      const netReserveBalance = totalCashCollected - totalDistributed;
      const completionRate = metrics.totalHandsExpected > 0 ? Math.round((metrics.handsCollectedTotal / metrics.totalHandsExpected) * 100) : 0;

      const pdfUri = await generateManagerBusinessReportPdf({
        businessName: metrics.businessName,
        collectorName: activeCollector?.fullName || 'Gestionnaire SOL',
        collectorPhone: activeCollector?.phoneNumber || '+509 XX XX XXXX',
        collectorZone: activeCollector?.zone,
        unitAmount: metrics.unitAmount,
        totalSlots: metrics.totalHandsExpected,
        registeredChildrenCount: metrics.totalMembersCount,
        totalPotAmount: metrics.totalPotAmount,
        cycleStartDate: metrics.startDate || new Date().toISOString(),
        cycleEndDate: metrics.endDate || new Date().toISOString(),
        handsCollectedTotal: metrics.handsCollectedTotal,
        totalCashCollected,
        totalDistributed,
        netReserveBalance,
        completionRate,
        members: currentMembers.map((m) => {
          const hands = metrics.unitAmount > 0 ? Math.floor((m.totalPaidInCycle || m.currentBalance || 0) / metrics.unitAmount) : 1;
          return {
            rank: m.payoutRank || 1,
            fullName: m.fullName,
            phoneNumber: m.phoneNumber,
            totalPaid: m.totalPaidInCycle || m.currentBalance || 0,
            handsCovered: hands,
            coverageStatus: m.paymentStatusToday,
            hasReceivedPayout: m.hasReceivedPayout,
          };
        }),
        generatedAt: new Date().toISOString(),
      });

      await sharePdfFile(pdfUri, `Rapport_Evolution_${metrics.businessName.replace(/\s+/g, '_')}.pdf`);
    } catch (err: any) {
      Alert.alert('Erreur', 'Impossible de générer le rapport d\'évolution.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const cycleProgressPct =
    metrics.totalHandsExpected > 0
      ? Math.min(100, Math.round((metrics.handsTouchedCount / metrics.totalHandsExpected) * 100))
      : 0;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={metrics.businessName || 'SOL'}
        subtitle={`${formatCurrency(metrics.unitAmount)}/main • ${metrics.totalMembersCount} enfants • Fin: ${formatDateShort(metrics.endDate)}`}
        onRefresh={handleRefresh}
      />

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MemberCard
            member={item}
            isPayoutTurn={metrics.currentPayoutBeneficiary?.id === item.id}
            onPayoutHand={handleInitiatePayout}
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
              {/* 1. Main Unitaire vs Cagnotte Totale */}
              <View style={[styles.metricCard, styles.metricCardPrimary]}>
                <View style={styles.metricCardTop}>
                  <Text style={styles.metricLabel}>VALEUR MAIN / CAGNOTTE</Text>
                  <Icon name="target" size={16} color="#FFFFFF" />
                </View>
                <View style={styles.metricValueRow}>
                  <Text style={styles.metricValueLight}>
                    {formatCurrency(metrics.unitAmount)}
                    <Text style={styles.metricValueLightSub}> / main</Text>
                  </Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${cycleProgressPct}%` }]} />
                </View>
                <Text style={styles.metricSubLight}>
                  Cagnotte : {formatCurrency(metrics.totalPotAmount)} ({metrics.handsTouchedCount}/{metrics.totalHandsExpected} touchées)
                </Text>
              </View>

              {/* 2. Mains Collectées Aujourd'hui */}
              <View style={styles.metricCard}>
                <View style={styles.metricCardTop}>
                  <Text style={styles.metricLabelDark}>COLLECTES AUJOURD'HUI</Text>
                  <Icon name="cash" size={16} color="#059669" />
                </View>
                <Text style={[styles.metricValueDark, { color: '#059669' }]}>
                  {metrics.handsCollectedToday} mains
                </Text>
                <Text style={styles.metricSubDark}>
                  {metrics.paidTodayCount} enfants à jour
                </Text>
              </View>

              {/* 3. Jours Restants */}
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

              {/* 4. Retards de Cotisation */}
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
                    ENFANTS EN RETARD
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
                  {metrics.overdueHandsCount} main{metrics.overdueHandsCount > 1 ? 's' : ''} impayée{metrics.overdueHandsCount > 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            {/* Quick Actions Row */}
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push('/collect' as any)}
                style={styles.quickActionBtn}
              >
                <View style={[styles.quickActionIconCircle, { backgroundColor: '#ECFDF5' }]}>
                  <Icon name="cash" size={16} color="#059669" />
                </View>
                <Text style={styles.quickActionLabel}>Encaisser</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push('/client/new' as any)}
                style={styles.quickActionBtn}
              >
                <View style={[styles.quickActionIconCircle, { backgroundColor: '#EFF6FF' }]}>
                  <Icon name="user" size={16} color="#2563EB" />
                </View>
                <Text style={styles.quickActionLabel}>+ Enfant</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push('/sol' as any)}
                style={styles.quickActionBtn}
              >
                <View style={[styles.quickActionIconCircle, { backgroundColor: '#FEF3C7' }]}>
                  <Icon name="crown" size={16} color="#D97706" />
                </View>
                <Text style={styles.quickActionLabel}>Matrice Sol</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push('/closure' as any)}
                style={styles.quickActionBtn}
              >
                <View style={[styles.quickActionIconCircle, { backgroundColor: '#F3E8FF' }]}>
                  <Icon name="shield" size={16} color="#7C3AED" />
                </View>
                <Text style={styles.quickActionLabel}>Clôture</Text>
              </TouchableOpacity>
            </View>

            {/* Business Evolution & Performance Report Banner */}
            <View style={styles.reportBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reportBannerTitle}>Rapport d'Évolution du Carnet</Text>
                <Text style={styles.reportBannerSub}>
                  Générez et imprimez l'état complet du cycle et de vos adhérents en PDF.
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleGenerateBusinessReport}
                disabled={isGeneratingReport}
                style={styles.reportBannerBtn}
              >
                <Icon name="print" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.reportBannerBtnText}>
                  {isGeneratingReport ? 'Génération...' : 'Imprimer PDF'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sol Turn Hero Banner (Next Beneficiary in Order) */}
            {metrics.currentPayoutBeneficiary && (
              <View style={styles.heroPayoutBanner}>
                <View style={styles.heroPayoutHeader}>
                  <Icon name="crown" size={18} color="#1D4ED8" />
                  <Text style={styles.heroPayoutTitle}>PROCHAINE MAIN À DÉCAISSER (BÉNÉFICIAIRE)</Text>
                </View>
                <View style={styles.heroPayoutBody}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroBeneficiaryName}>
                      {metrics.currentPayoutBeneficiary.fullName}
                    </Text>
                    <Text style={styles.heroBeneficiarySub}>
                      Main #{metrics.currentPayoutBeneficiary.rankOrder || 1} • Cagnotte :{' '}
                      {formatCurrency(metrics.totalPotAmount)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleInitiatePayout(metrics.currentPayoutBeneficiary!)}
                    style={styles.heroPayoutBtn}
                  >
                    <Text style={styles.heroPayoutBtnText}>Donner la Main</Text>
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
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Icon name="close" size={16} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Horizontal Chips */}
            <View style={styles.filterScroll}>
              <TouchableOpacity
                onPress={() => handleFilterChange('ALL')}
                style={[styles.filterChip, filter === 'ALL' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filter === 'ALL' && styles.filterChipTextActive]}>
                  Tous ({metrics.totalMembersCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleFilterChange('PAID_TODAY')}
                style={[styles.filterChip, filter === 'PAID_TODAY' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filter === 'PAID_TODAY' && styles.filterChipTextActive]}>
                  À jour ({metrics.paidTodayCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleFilterChange('UNPAID_TODAY')}
                style={[styles.filterChip, filter === 'UNPAID_TODAY' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filter === 'UNPAID_TODAY' && styles.filterChipTextActive]}>
                  Non payé ({metrics.unpaidTodayCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleFilterChange('OVERDUE')}
                style={[styles.filterChip, filter === 'OVERDUE' && styles.filterChipAlertActive]}
              >
                <Text style={[styles.filterChipText, filter === 'OVERDUE' && styles.filterChipTextAlertActive]}>
                  En retard ({metrics.overdueMembersCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleFilterChange('HAND_RECEIVED')}
                style={[styles.filterChip, filter === 'HAND_RECEIVED' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filter === 'HAND_RECEIVED' && styles.filterChipTextActive]}>
                  Main touchée ({metrics.handsTouchedCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleFilterChange('HAND_PENDING')}
                style={[styles.filterChip, filter === 'HAND_PENDING' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filter === 'HAND_PENDING' && styles.filterChipTextActive]}>
                  Main en attente ({Math.max(0, metrics.totalMembersCount - metrics.handsTouchedCount)})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Section Title & Sorting Toggle */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                LISTE DES ENFANTS ({members.length})
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
                  Tri: {sort === 'PAYOUT_RANK' ? 'Rang' : sort === 'NAME' ? 'Nom' : sort === 'BALANCE' ? 'Cotisé' : 'Retards'}
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
                : 'Ajoutez des enfants pour démarrer le carnet SOL.'}
            </Text>
          </View>
        }
      />

      {/* Floating Action Button (+ Nouvel Enfant) */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          triggerMediumImpact();
          router.push('/client/new' as any);
        }}
        style={styles.fab}
      >
        <Icon name="plus" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
        <Text style={styles.fabText}>Nouvel Enfant</Text>
      </TouchableOpacity>

      {/* Payout Justification Modal */}
      <Modal
        visible={isPayoutModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPayoutModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.iconCircleCrown}>
                <Icon name="crown" size={24} color="#1D4ED8" />
              </View>
              <Text style={styles.modalTitle}>Remise de la Main (Payout)</Text>
            </View>

            <Text style={styles.modalSub}>
              Vous allez débloquer la cagnotte complète de{' '}
              <Text style={styles.modalSubBold}>{formatCurrency(metrics.totalPotAmount)}</Text> pour{' '}
              <Text style={styles.modalSubBold}>{payoutTargetMember?.fullName}</Text> (Main #{payoutTargetMember?.rankOrder || 1}).
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NOTE / JUSTIFICATION DU DÉCAISSEMENT (OBLIGATOIRE)</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Ex: Remise de main effectuée en mains propres au marché."
                placeholderTextColor="#94A3B8"
                value={payoutNote}
                onChangeText={setPayoutNote}
              />
            </View>

            <View style={styles.modalWarningBox}>
              <Icon name="shield" size={14} color="#0284C7" style={{ marginRight: 6 }} />
              <Text style={styles.modalWarningText}>
                L'adhérent restera sur le tableau de bord et continuera d'être exigible pour les cotisations restantes.
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIsPayoutModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleConfirmPayoutDetails}
                style={styles.modalConfirmBtn}
              >
                <Text style={styles.modalConfirmBtnText}>Valider (Code PIN)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4-Digit PIN Security Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Validation Sécurisée de la Main"
        subtitle={`Saisissez votre code PIN gestionnaire pour autoriser le décaissement de ${formatCurrency(metrics.totalPotAmount)}.`}
        onSuccess={handlePinSuccessPayout}
        onCancel={() => setIsPinModalOpen(false)}
      />
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
    paddingBottom: 85,
  },
  dashboardHeader: {
    marginBottom: 8,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  quickActionBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  quickActionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  quickActionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
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
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  metricLabelDark: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  metricValueLight: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  metricValueLightSub: {
    fontSize: 12,
    color: '#94A3B8',
  },
  metricValueDark: {
    fontSize: 17,
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
    fontSize: 10,
    fontWeight: '900',
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  heroPayoutBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
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
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    fontSize: 11,
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
    fontWeight: '900',
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
    paddingHorizontal: 18,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    elevation: 6,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircleCrown: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  modalSub: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginVertical: 8,
    lineHeight: 18,
  },
  modalSubBold: {
    fontWeight: '900',
    color: '#1D4ED8',
  },
  inputGroup: {
    marginVertical: 10,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  textArea: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    padding: 12,
    fontSize: 13,
    fontWeight: '600',
    color: SOL_COLORS.textPrimary,
    textAlignVertical: 'top',
    minHeight: 70,
  },
  modalWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 14,
  },
  modalWarningText: {
    flex: 1,
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '600',
    lineHeight: 15,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modalConfirmBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  modalConfirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  reportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    marginBottom: 10,
  },
  reportBannerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  reportBannerSub: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 14,
    paddingRight: 6,
  },
  reportBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  reportBannerBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
