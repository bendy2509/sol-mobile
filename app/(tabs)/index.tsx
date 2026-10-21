import React, { useState, useCallback, useMemo } from 'react';
import { View, TextInput, FlatList, Pressable, StyleSheet, RefreshControl, Alert, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { Header } from '@/components/Header';
import { MemberCard } from '@/components/MemberCard';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DashboardMetricsGrid } from '@/components/dashboard/DashboardMetricsGrid';
import { BeneficiaryBanner } from '@/components/dashboard/BeneficiaryBanner';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { AmountText, Avatar, Button, EmptyState, Icon, Screen, Text, UiIconName } from '@/components/ui';
import { getDashboardMetrics } from '@/db/businessRepository';
import { getMembersWithPaymentStatus, payoutMemberHand } from '@/db/memberRepository';
import { recordAuditLog } from '@/services/auditService';
import { getActiveCollector } from '@/db/sqlite';
import { generateManagerBusinessReportPdf, sharePdfFile } from '@/services/pdfService';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { DashboardMetrics, FilterStatus, Member, SortOption } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

export default function DashboardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { userRole } = useAuth();
  const { triggerSync } = useSync();
  const { width, isSmallScreen, isVerySmallScreen, isTablet, horizontalPadding } = useResponsive();
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
    ({ item, index }: { item: Member; index: number }) => (
      <MemberCard
        member={item}
        isPayoutTurn={metrics.currentPayoutBeneficiary?.id === item.id}
        isFirst={index === 0}
        isLast={index === members.length - 1}
      />
    ),
    [metrics.currentPayoutBeneficiary?.id, members.length]
  );

  const quickActions: { label: string; a11y: string; icon: UiIconName; onPress: () => void; busy?: boolean }[] = [
    { label: 'Nouvel enfant', a11y: 'Inscrire un nouvel enfant', icon: 'plus', onPress: () => router.push('/client/new' as any) },
    { label: 'Rapport PDF', a11y: 'Générer le rapport PDF du carnet', icon: 'printer', onPress: handleGenerateBusinessReport, busy: isGeneratingReport },
  ];

  return (
    <Screen
      scroll={false}
      padded={false}
      edges={['top', 'left', 'right']}
      header={
        <Header
          title={metrics.businessName || 'SOL'}
          subtitle={`${formatCurrency(metrics.unitAmount)}/main • ${metrics.totalMembersCount} enfants • Fin ${formatDateShort(metrics.endDate)}`}
          onRefresh={handleRefresh}
        />
      }
      footerSafeArea={false}
    >
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={renderMemberItem}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listContent, isTablet && styles.listContentTablet]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.dashboardHeader}>
            <DashboardHero metrics={metrics} cycleProgressPct={cycleProgressPct}>
              {metrics.currentPayoutBeneficiary && (
                <BeneficiaryBanner
                  beneficiary={metrics.currentPayoutBeneficiary}
                  potAmount={metrics.totalPotAmount}
                  onPayout={handleInitiatePayout}
                />
              )}
            </DashboardHero>

            <DashboardMetricsGrid metrics={metrics} membersCount={metrics.totalMembersCount} />

            <View style={styles.quickActionsRow}>
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="secondary"
                  icon={action.icon}
                  loading={action.busy}
                  label={action.busy ? 'Génération…' : action.label}
                  accessibilityLabel={action.a11y}
                  onPress={action.onPress}
                  style={styles.flexOne}
                />
              ))}
            </View>

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
          <EmptyState
            icon={searchQuery ? 'search' : 'users'}
            title="Aucun adhérent trouvé"
            message={
              searchQuery ? 'Aucun résultat ne correspond à votre recherche.' : 'Ajoutez des enfants pour démarrer la collecte et le cycle.'
            }
            action={
              searchQuery || isReadOnly
                ? undefined
                : { label: 'Ajouter un enfant', icon: 'plus', onPress: () => router.push('/client/new' as any) }
            }
          />
        }
      />

      {/* Payout hand ("Bay Men") */}
      <Modal visible={isPayoutModalOpen} transparent animationType="fade" onRequestClose={() => setIsPayoutModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Pressable
              onPress={() => setIsPayoutModalOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={({ pressed }) => [styles.modalClose, pressed && styles.quickActionPressed]}
            >
              <Icon name="close" size={22} color={theme.colors.textMuted} />
            </Pressable>

            <View style={styles.modalHeader}>
              <View style={styles.modalIcon}>
                <Icon name="payout" size={28} color={theme.colors.primary} />
              </View>
              <Text variant="title" align="center" accessibilityRole="header">
                Remise de la main
              </Text>
              <Text variant="body" tone="muted" align="center">
                Cagnotte complète à décaisser
              </Text>
              <AmountText amount={metrics.totalPotAmount} size="large" align="center" />
            </View>

            {payoutTargetMember && (
              <View style={styles.targetBox}>
                <Avatar name={payoutTargetMember.fullName} />
                <View style={styles.flexShrink}>
                  <Text variant="bodyStrong">{payoutTargetMember.fullName}</Text>
                  <Text variant="caption" tone="muted">
                    Main #{payoutTargetMember.rankOrder || 1} · {payoutTargetMember.phoneNumber}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text variant="label">Motif / justification</Text>
              <TextInput
                style={styles.textArea}
                value={payoutNote}
                onChangeText={setPayoutNote}
                placeholder="Ex : remise de la main, cycle 1"
                placeholderTextColor={theme.colors.textPlaceholder}
                multiline
                numberOfLines={2}
                accessibilityLabel="Motif de la remise"
              />
            </View>

            <View style={styles.modalBtnRow}>
              <Button label="Annuler" variant="secondary" onPress={() => setIsPayoutModalOpen(false)} style={styles.flexOne} />
              <Button label="Valider avec PIN" icon="lock" onPress={handleConfirmPayoutDetails} style={styles.flexTwo} />
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
        onLockout={() => {
          recordAuditLog({
            action: 'LOGIN_FAILURE',
            entityType: 'SYSTEM',
            entityId: payoutTargetMember?.id || 'unknown',
            reason: `3 tentatives PIN échouées lors de la remise de main pour ${payoutTargetMember?.fullName || 'un adhérent'}.`,
            userId: 'c011ec70-0000-0000-0000-000000000001', // Fallback local
            userRole: 'MANAGER',
          });
        }}
      />
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout, typography }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    flexOne: { flexGrow: 1, flexBasis: 0 },
    flexTwo: { flexGrow: 2, flexBasis: 0 },

    listContent: {
      paddingHorizontal: layout.gutter,
      paddingBottom: spacing.xl,
    },
    listContentTablet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      alignSelf: 'center',
    },
    dashboardHeader: {
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.lg,
    },

    quickActionsRow: { flexDirection: 'row', gap: spacing.sm },
    quickActionPressed: { backgroundColor: colors.surfacePressed },

    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: layout.gutter,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      padding: spacing.xl,
      gap: spacing.lg,
    },
    modalClose: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      zIndex: 1,
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalHeader: { alignItems: 'center', gap: spacing.xs },
    modalIcon: {
      width: spacing.xxxl + spacing.lg,
      height: spacing.xxxl + spacing.lg,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    targetBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
    },
    inputGroup: { gap: spacing.sm },
    textArea: {
      minHeight: layout.actionHeight + spacing.lg,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      color: colors.text,
      ...typography.body,
      textAlignVertical: 'top',
    },
    modalBtnRow: { flexDirection: 'row', gap: spacing.sm },
  });
