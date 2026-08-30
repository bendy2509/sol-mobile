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
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DashboardMetricsGrid } from '@/components/dashboard/DashboardMetricsGrid';
import { BeneficiaryBanner } from '@/components/dashboard/BeneficiaryBanner';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { getDashboardMetrics } from '@/db/businessRepository';
import { getMembersWithPaymentStatus, payoutMemberHand } from '@/db/memberRepository';
import { getActiveCollector } from '@/db/sqlite';
import { generateManagerBusinessReportPdf, sharePdfFile } from '@/services/pdfService';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { DashboardMetrics, FilterStatus, Member, SortOption } from '@/types';
import { formatCurrency, formatDateShort, getInitials } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';

export default function DashboardScreen() {
  const router = useRouter();
  const { userRole } = useAuth();
  const { triggerSync } = useSync();
  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';

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
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

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
    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert('Accès Lecture Seule', 'Le décaissement de la main est réservé aux gestionnaires.');
      return;
    }
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

  const renderMemberItem = useCallback(
    ({ item }: { item: Member }) => (
      <MemberCard
        member={item}
        isPayoutTurn={metrics.currentPayoutBeneficiary?.id === item.id}
        onPayoutHand={handleInitiatePayout}
      />
    ),
    [metrics.currentPayoutBeneficiary?.id, handleInitiatePayout]
  );

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={metrics.businessName || 'SOL'}
        subtitle={`${formatCurrency(metrics.unitAmount)}/main • ${metrics.totalMembersCount} enfants • ${metrics.totalHandsExpected} mains • Fin: ${formatDateShort(metrics.endDate)}`}
        onRefresh={handleRefresh}
      />

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={renderMemberItem}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
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
            {/* 1. Hero Summary Card */}
            <DashboardHero metrics={metrics} cycleProgressPct={cycleProgressPct} />

            {/* 2. 2x2 Metrics Grid */}
            <DashboardMetricsGrid metrics={metrics} membersCount={metrics.totalMembersCount} />

            {/* 3. Quick Action Buttons */}
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push('/collect' as any)}
                style={styles.quickActionBtn}
              >
                <View style={[styles.quickActionIconCircle, { backgroundColor: SOL_COLORS.primaryLight }]}>
                  <Icon name="cash" size={16} color={SOL_COLORS.primaryDark} />
                </View>
                <Text style={styles.quickActionLabel}>Encaisser</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push('/client/new' as any)}
                style={styles.quickActionBtn}
              >
                <View style={[styles.quickActionIconCircle, { backgroundColor: SOL_COLORS.infoLight }]}>
                  <Icon name="user" size={16} color={SOL_COLORS.info} />
                </View>
                <Text style={styles.quickActionLabel}>+ Enfant</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push('/sol' as any)}
                style={styles.quickActionBtn}
              >
                <View style={[styles.quickActionIconCircle, { backgroundColor: SOL_COLORS.accentLight }]}>
                  <Icon name="crown" size={16} color={SOL_COLORS.accent} />
                </View>
                <Text style={styles.quickActionLabel}>Cycle Sol</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleGenerateBusinessReport}
                disabled={isGeneratingReport}
                style={styles.quickActionBtn}
              >
                <View style={[styles.quickActionIconCircle, { backgroundColor: '#F3E8FF' }]}>
                  <Icon name="print" size={16} color="#7C3AED" />
                </View>
                <Text style={styles.quickActionLabel}>Rapport PDF</Text>
              </TouchableOpacity>
            </View>

            {/* 4. Sol Turn Beneficiary Banner */}
            {metrics.currentPayoutBeneficiary && (
              <BeneficiaryBanner
                beneficiary={metrics.currentPayoutBeneficiary}
                potAmount={metrics.totalPotAmount}
                onPayout={handleInitiatePayout}
              />
            )}

            {/* 5. Search Bar, Filter Chips & Section Header */}
            <DashboardFilters
              metrics={metrics}
              membersCount={metrics.totalMembersCount}
              filteredMembersCount={members.length}
              filter={filter}
              sort={sort}
              searchQuery={searchQuery}
              onFilterChange={handleFilterChange}
              onSortChange={handleSortChange}
              onSearchChange={setSearchQuery}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="user" size={44} color={SOL_COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun adhérent trouvé</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? 'Aucun résultat ne correspond à votre recherche.'
                : 'Ajoutez des enfants pour démarrer la collecte et le cycle.'}
            </Text>
          </View>
        }
      />

      {/* Floating Add Child Button */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push('/client/new' as any)}
        style={styles.fab}
      >
        <Icon name="plus" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
        <Text style={styles.fabText}>Ajouter un Enfant</Text>
      </TouchableOpacity>

      {/* Payout Hand Modal */}
      <Modal
        visible={isPayoutModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPayoutModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => setIsPayoutModalOpen(false)}
                style={styles.modalCloseTopBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={18} color="#64748B" />
              </TouchableOpacity>
              <View style={styles.iconCircleCrown}>
                <Icon name="crown" size={24} color={SOL_COLORS.accent} />
              </View>
              <Text style={styles.modalTitle}>Remise de la Main ("Bay Men")</Text>
            </View>

            <Text style={styles.modalSub}>
              Vous êtes sur le point de décaisser la cagnotte complète de{' '}
              <Text style={styles.modalSubBold}>{formatCurrency(metrics.totalPotAmount)}</Text> pour :
            </Text>

            {payoutTargetMember && (
              <View style={styles.targetBeneficiaryBox}>
                <Text style={styles.targetBeneficiaryName}>{payoutTargetMember.fullName}</Text>
                <Text style={styles.targetBeneficiaryRank}>
                  Main #{payoutTargetMember.rankOrder || 1} • {payoutTargetMember.phoneNumber}
                </Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>MOTIF / JUSTIFICATION :</Text>
              <TextInput
                style={styles.textArea}
                value={payoutNote}
                onChangeText={setPayoutNote}
                placeholder="Ex: Remise de la main cycle #1"
                placeholderTextColor={SOL_COLORS.textMuted}
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setIsPayoutModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmPayoutDetails}
                style={styles.modalConfirmBtn}
              >
                <Text style={styles.modalConfirmBtnText}>Valider avec PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sensitive PIN Security Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Validation du Décaissement"
        subtitle={`Saisissez votre code PIN pour confirmer la remise de ${formatCurrency(metrics.totalPotAmount)}.`}
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
    paddingHorizontal: 16,
    paddingBottom: 90,
  },
  dashboardHeader: {
    paddingTop: 12,
  },
  heroCard: {
    backgroundColor: SOL_COLORS.secondary,
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    ...SHADOWS.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#CBD5E1',
    letterSpacing: 0.5,
  },
  heroAmount: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  heroSubFormula: {
    fontSize: 11,
    color: '#93C5FD',
    fontWeight: '700',
    marginTop: 2,
  },
  heroUnitBadge: {
    backgroundColor: SOL_COLORS.secondaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  heroUnitText: {
    fontSize: 12,
    fontWeight: '800',
    color: SOL_COLORS.primaryLight,
  },
  heroStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 10,
    marginTop: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatItemLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 0.3,
  },
  heroStatItemValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  heroStatItemVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F1F5F9',
  },
  heroStatItemValGreen: {
    fontSize: 12,
    fontWeight: '900',
    color: '#34D399',
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#334155',
  },
  heroProgressSection: {
    marginTop: 14,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  progressPct: {
    fontSize: 12,
    fontWeight: '800',
    color: SOL_COLORS.primaryLight,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  metricCard: {
    width: '48.3%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  metricCardAlert: {
    borderColor: '#FECDD3',
    backgroundColor: '#FFF1F2',
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metricIconBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCardTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: SOL_COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  metricCardValue: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  metricCardSub: {
    fontSize: 10,
    fontWeight: '600',
    color: SOL_COLORS.textMuted,
    marginTop: 2,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickActionBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  quickActionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  heroPayoutBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
    ...SHADOWS.sm,
  },
  heroPayoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  heroPayoutBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroPayoutTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  heroPayoutUnitPill: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400E',
    backgroundColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  heroPayoutBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroBeneficiaryAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBeneficiaryAvatarText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  heroBeneficiaryName: {
    fontSize: 14,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  heroBeneficiarySub: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 2,
    fontWeight: '700',
  },
  heroPayoutBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
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
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    marginBottom: 10,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  filterChipActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primaryDark,
  },
  filterChipAlertActive: {
    backgroundColor: SOL_COLORS.danger,
    borderColor: SOL_COLORS.dangerDark,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: SOL_COLORS.textSecondary,
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
    color: SOL_COLORS.textMuted,
    letterSpacing: 0.5,
  },
  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortToggleText: {
    fontSize: 11,
    color: SOL_COLORS.primaryDark,
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
    bottom: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    ...SHADOWS.lg,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    ...SHADOWS.lg,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
    width: '100%',
  },
  modalCloseTopBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  iconCircleCrown: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SOL_COLORS.accentLight,
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
    color: SOL_COLORS.textSecondary,
    textAlign: 'center',
    marginVertical: 8,
    lineHeight: 18,
  },
  modalSubBold: {
    fontWeight: '900',
    color: SOL_COLORS.primaryDark,
  },
  targetBeneficiaryBox: {
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    alignItems: 'center',
  },
  targetBeneficiaryName: {
    fontSize: 15,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  targetBeneficiaryRank: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  inputGroup: {
    marginVertical: 10,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: SOL_COLORS.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  textArea: {
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    padding: 12,
    fontSize: 13,
    fontWeight: '600',
    color: SOL_COLORS.textPrimary,
    textAlignVertical: 'top',
    minHeight: 60,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    backgroundColor: SOL_COLORS.surfaceSubtle,
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textSecondary,
  },
  modalConfirmBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    backgroundColor: SOL_COLORS.primary,
  },
  modalConfirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
