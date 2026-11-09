import React, { useState, useCallback, useMemo } from 'react';
import { View, TextInput, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { PinVerificationModal } from '@/components/PinVerificationModal';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DashboardMetricsGrid } from '@/components/dashboard/DashboardMetricsGrid';
import { BeneficiaryBanner } from '@/components/dashboard/BeneficiaryBanner';
import { ActionMenu, AmountText, Avatar, BottomSheet, Button, Card, EmptyState, ListSkeleton, MemberRow, Screen, ScreenHeader, SectionHeader, Text, UiIconName, memberStatusDetail } from '@/components/ui';
import { getDashboardMetrics } from '@/db/businessRepository';
import { getMembersWithPaymentStatus, payoutMemberHand } from '@/db/memberRepository';
import { recordAuditLog } from '@/services/auditService';
import { exportBusinessReport } from '@/services/reportExport';
import { DashboardMetrics, Member } from '@/types';
import { memberOwedHands, needsCollection, owedAmount, sortForCollection } from '@/services/memberRules';
import { formatCurrency } from '@/lib/formatters';
import { triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

/** Rows of « À encaisser aujourd'hui » on the home screen; the full list is on Encaisser. */
const HOME_PREVIEW_ROWS = 4;

export default function DashboardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  
  const { isTablet } = useResponsive();

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    unitAmount: 250,
    totalPotAmount: 2500,
    handsCollectedToday: 0,
    amountCollectedToday: 0,
    handsCollectedTotal: 0,
    totalHandsExpected: 10,
    daysRemaining: 0,
    overdueMembersCount: 0,
    overdueHandsCount: 0,
    overdueAmount: 0,
    dueTodayCount: 0,
    amountCollectedCycle: 0,
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
    cycleNotStarted: false,
    payoutsBehind: 0,
  });

  const [members, setMembers] = useState<Member[]>([]);
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
        getMembersWithPaymentStatus({ filter: 'ALL', sort: 'PAYOUT_RANK' }),
      ]);
      setMetrics(fetchedMetrics);
      setMembers(memberList);
    } catch (err) {
      console.warn('Dashboard load error:', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleInitiatePayout = (member: Member) => {
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

  // Today's collection: late members first, then today's (memberRules, same order as Encaisser)
  const toCollect = sortForCollection(members.filter(needsCollection));
  const preview = toCollect.slice(0, HOME_PREVIEW_ROWS);

  const quickActions: { label: string; a11y: string; icon: UiIconName; onPress: () => void }[] = [
    { label: t('Clôturer'), a11y: t('Ouvrir la clôture de caisse du jour'), icon: 'calendar', onPress: () => router.push('/closure' as any) },
    { label: t('Inscrire'), a11y: t('Inscrire un nouvel adhérent'), icon: 'plus', onPress: () => router.push('/client/new' as any) },
  ];

  return (
    <Screen
      padded={false}
      edges={['top', 'left', 'right']}
      footerSafeArea={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
      }
      contentStyle={[styles.content, isTablet && styles.contentTablet]}
      header={
        <View style={isTablet && styles.contentTablet}>
          <ScreenHeader
            title={metrics.businessName || t('SOL')}
            subtitle={t('{0} la main · {1} adhérents', formatCurrency(metrics.unitAmount), metrics.totalMembersCount)}
            right={
              <ActionMenu
                title={metrics.businessName}
                items={[
                  { label: t('Rapport PDF du carnet'), icon: 'printer', onPress: handleGenerateBusinessReport, disabled: isGeneratingReport },
                  { label: t('Scanner une carte'), icon: 'scan', onPress: () => router.push('/scan' as any) },
                  { label: t('Gestion du cycle'), icon: 'cycle', onPress: () => router.push('/cycle-management' as any) },
                ]}
              />
            }
          />
        </View>
      }
    >
      {!loaded ? (
        <ListSkeleton rows={3} />
      ) : metrics.totalMembersCount === 0 ? (
        <EmptyState
          icon="users"
          title={t('Aucun adhérent')}
          message={t('Ajoutez des enfants pour démarrer la collecte et le cycle.')}
          action={{ label: t('Nouvel adhérent'), icon: 'plus', onPress: () => router.push('/client/new' as any) }}
        />
      ) : (
        <>
          <DashboardHero metrics={metrics} cycleProgressPct={cycleProgressPct}>
            {metrics.currentPayoutBeneficiary && (
              <BeneficiaryBanner beneficiary={metrics.currentPayoutBeneficiary} potAmount={metrics.totalPotAmount} onPayout={handleInitiatePayout} />
            )}
          </DashboardHero>

          <DashboardMetricsGrid metrics={metrics} membersCount={metrics.totalMembersCount} />

          <View style={styles.section}>
            <SectionHeader
              title={t("À encaisser aujourd'hui")}
              count={toCollect.length}
              action={toCollect.length > 0 ? { label: t('Voir tout'), onPress: () => router.push('/collect' as any) } : undefined}
            />
            {preview.length === 0 ? (
              <Card style={styles.allPaid}>
                <Text variant="bodyStrong" tone="success">{t('Tout le monde est à jour')}</Text>
                <Text variant="caption" tone="muted">{t('Aucune main à encaisser pour aujourd\'hui.')}</Text>
              </Card>
            ) : (
              <Card padding="none" style={styles.listCard}>
                {preview.map((m, i) => (
                  <MemberRow
                    key={m.id}
                    name={m.fullName}
                    rank={m.rankOrder ?? m.payoutRank ?? undefined}
                    status={m.paymentStatusToday}
                    statusDetail={memberStatusDetail(m)}
                    value={formatCurrency(owedAmount(memberOwedHands(m), metrics.unitAmount))}
                    valueTone={m.paymentStatusToday === 'OVERDUE' ? 'warning' : 'default'}
                    divider={i < preview.length - 1}
                    onPress={() => router.push(`/client/${m.id}` as any)}
                  />
                ))}
              </Card>
            )}
          </View>

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
        </>
      )}

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

    content: {
      paddingHorizontal: layout.gutter,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xxl,
      gap: spacing.xl,
    },
    contentTablet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      alignSelf: 'center',
    },
    section: { gap: spacing.md },
    listCard: { overflow: 'hidden' },
    allPaid: { gap: spacing.xs },

    quickActionsRow: { flexDirection: 'row', gap: spacing.sm },
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
