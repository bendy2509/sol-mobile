import React, { useState, useCallback, useMemo } from 'react';
import { View, TextInput, FlatList, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { SyncBadge } from '@/components/SyncBadge';
import { MemberCard } from '@/components/MemberCard';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DashboardMetricsGrid } from '@/components/dashboard/DashboardMetricsGrid';
import { BeneficiaryBanner } from '@/components/dashboard/BeneficiaryBanner';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { ActionMenu, AmountText, Avatar, BottomSheet, Button, EmptyState, ListSkeleton, Screen, Text, UiIconName } from '@/components/ui';
import { getDashboardMetrics } from '@/db/businessRepository';
import { getMembersWithPaymentStatus, payoutMemberHand } from '@/db/memberRepository';
import { recordAuditLog } from '@/services/auditService';
import { exportBusinessReport } from '@/services/reportExport';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { DashboardMetrics, FilterStatus, Member, SortOption } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

export default function DashboardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { userRole } = useAuth();
  const { triggerSync } = useSync();
  const { isTablet } = useResponsive();
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
  const [loaded, setLoaded] = useState(false);

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
    } finally {
      setLoaded(true);
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
      Alert.alert(t('Accès Lecture Seule'), t('Le décaissement de la main est réservé aux gestionnaires.'));
      return;
    }
    triggerMediumImpact();
    setPayoutTargetMember(member);
    setPayoutNote(`Remise de la main #${member.rankOrder || 1} - ${member.fullName}`);
    setIsPayoutModalOpen(true);
  };

  const handleConfirmPayoutDetails = () => {
    if (!payoutNote.trim()) {
      Alert.alert(t('Justification requise'), t('Veuillez saisir une note ou motif pour le déblocage de la main.'));
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
        t('Main remise'),
        t('{0} remis à {1}. Ses cotisations continuent jusqu\'à la fin du cycle.', formatCurrency(metrics.totalPotAmount), payoutTargetMember.fullName)
      );
      loadData();
    } catch (err: any) {
      Alert.alert(t('Erreur'), err?.message || t('Échec du décaissement.'));
    } finally {
      setPayoutTargetMember(null);
    }
  };

  const handleGenerateBusinessReport = async () => {
    triggerMediumImpact();
    setIsGeneratingReport(true);
    try {
      await exportBusinessReport();
    } catch {
      Alert.alert(t('Erreur'), t('Impossible de générer le rapport d\'évolution.'));
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

  const quickActions: { label: string; a11y: string; icon: UiIconName; onPress: () => void }[] = [
    { label: t('Clôturer'), a11y: t('Ouvrir la clôture de caisse du jour'), icon: 'calendar', onPress: () => router.push('/closure' as any) },
    { label: t('Inscrire'), a11y: t('Inscrire un nouvel adhérent'), icon: 'plus', onPress: () => router.push('/client/new' as any) },
  ];

  return (
    <Screen
      scroll={false}
      padded={false}
      edges={['top', 'left', 'right']}
      header={
        <View style={[styles.topBar, isTablet && styles.listContentTablet]}>
          <View style={styles.flexShrink}>
            <Text variant="title" numberOfLines={1} accessibilityRole="header">
              {metrics.businessName || t('SOL')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {t('{0} la main · {1} adhérents{2}', formatCurrency(metrics.unitAmount), metrics.totalMembersCount, metrics.endDate ? t(' · fin {0}', formatDateShort(metrics.endDate)) : '')}
            </Text>
          </View>
          <SyncBadge onSyncComplete={handleRefresh} compact />
          <ActionMenu
            title={metrics.businessName}
            items={[
              { label: t('Rapport PDF du carnet'), icon: 'printer', onPress: handleGenerateBusinessReport, disabled: isGeneratingReport },
              { label: t('Scanner une carte'), icon: 'scan', onPress: () => router.push('/scan' as any) },
              { label: t('Gestion du cycle'), icon: 'cycle', onPress: () => router.push('/cycle-management' as any) },
            ]}
          />
        </View>
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
                  label={action.label}
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
          !loaded ? (
            <ListSkeleton hero={false} rows={4} />
          ) : (
          <EmptyState
            icon={searchQuery ? 'search' : 'users'}
            title={t('Aucun adhérent trouvé')}
            message={
              searchQuery ? t('Aucun résultat ne correspond à votre recherche.') : t('Ajoutez des enfants pour démarrer la collecte et le cycle.')
            }
            action={
              searchQuery || isReadOnly
                ? undefined
                : { label: t('Nouvel adhérent'), icon: 'plus', onPress: () => router.push('/client/new' as any) }
            }
          />
          )
        }
      />

      {/* Payout hand ("Bay Men") */}
      <BottomSheet
        visible={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        title={t('Remettre la main')}
        subtitle={t('Cagnotte complète du tour, confirmée par votre code PIN.')}
        footer={<Button size="lg" fullWidth label={t('Valider avec le PIN')} icon="lock" onPress={handleConfirmPayoutDetails} />}
      >
        <AmountText amount={metrics.totalPotAmount} size="hero" align="center" />
        {payoutTargetMember && (
          <View style={styles.targetBox}>
            <Avatar name={payoutTargetMember.fullName} />
            <View style={styles.flexShrink}>
              <Text variant="bodyStrong">{payoutTargetMember.fullName}</Text>
              <Text variant="caption" tone="muted">{t('Main')}{' '}{payoutTargetMember.rankOrder || 1} · {payoutTargetMember.phoneNumber}
              </Text>
            </View>
          </View>
        )}
        <View style={styles.inputGroup}>
          <Text variant="label">{t('Motif')}</Text>
          <TextInput
            style={styles.textArea}
            value={payoutNote}
            onChangeText={setPayoutNote}
            placeholder={t('Ex : remise de la main, cycle 1')}
            placeholderTextColor={theme.colors.textPlaceholder}
            multiline
            numberOfLines={2}
            accessibilityLabel={t('Motif de la remise')}
          />
        </View>
      </BottomSheet>

      {/* Sensitive PIN Security Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title={t('Confirmer la remise')}
        subtitle={t('{0} pour {1}', formatCurrency(metrics.totalPotAmount), payoutTargetMember?.fullName ?? '')}
        onSuccess={handlePinSuccessPayout}
        onCancel={() => setIsPinModalOpen(false)}
        onLockout={() => {
          recordAuditLog({
            action: 'LOGIN_FAILURE',
            entityType: 'SYSTEM',
            entityId: payoutTargetMember?.id || 'unknown',
            reason: t('3 tentatives PIN échouées lors de la remise de main pour {0}.', payoutTargetMember?.fullName || 'un adhérent'),
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
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingLeft: layout.gutter,
      paddingRight: spacing.sm,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xs,
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
  });
