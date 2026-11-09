import React, { useState, useCallback, useMemo } from 'react';
import { buildCycleRounds, payoutsBehind, roundOnDate } from '@/services/scheduleService';
import { localDateString } from '@/lib/dates';
import { View, TextInput, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { PinVerificationModal } from '@/components/PinVerificationModal';
import {
  ActionMenu,
  AmountText,
  Avatar,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  Icon,
  MemberRow,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
} from '@/components/ui';
import { getActiveBusinessConfig, getCycleHandsTotal } from '@/db/businessRepository';
import { getMembersWithPaymentStatus, payoutMemberHand } from '@/db/memberRepository';
import { BusinessConfig, Member } from '@/types';
import { formatCurrency, formatDateShort, formatDaysCompact } from '@/lib/formatters';
import { triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';
import { cycleHandsPaidOut, cycleTotalHands, handPotAmount, hasReceivedAllHands, memberHandsCount, memberPayoutRanks, memberReceivedHands, nextBeneficiary, handUnitAmount } from '@/services/memberRules';

/** Segmented track (one segment per hand) is readable up to this many hands. */
const MAX_SEGMENTS = 12;

export default function SolMatrixScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Payout Flow State
  const [payoutTargetMember, setPayoutTargetMember] = useState<Member | null>(null);
  const [payoutNote, setPayoutNote] = useState('');
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);


  const [dbTotalHands, setDbTotalHands] = useState<number>(0);

  const loadData = useCallback(async () => {
    try {
      const [activeBusiness, memberList] = await Promise.all([
        getActiveBusinessConfig(),
        getMembersWithPaymentStatus({ sort: 'PAYOUT_RANK' }),
      ]);
      setBusiness(activeBusiness);
      setMembers(memberList);

      // Direct SQL SUM for guaranteed accuracy — avoids ORM mapping issues
      // Rounds in the cycle: same count as the dashboard, payouts and statuses (deleted members excluded)
      setDbTotalHands(Math.max(1, await getCycleHandsTotal()));
    } catch (err) {
      console.warn('Error loading Sol matrix:', err);
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
    const hands = memberHandsCount(member);
    const rec = memberReceivedHands(member);
    setPayoutNote(`Remise de la main (${rec + 1}/${hands}) - ${member.fullName}`);
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

  // Use SQL-based total (most reliable) falling back to JS calculation then business config
  const totalHandsCount = dbTotalHands || cycleTotalHands(members);
  const potValue = handPotAmount(
    handUnitAmount(business),
    totalHandsCount
  );

  const handlePinSuccessPayout = async () => {
    setIsPinModalOpen(false);
    if (!payoutTargetMember) return;

    try {
      await payoutMemberHand(
        payoutTargetMember.id,
        potValue,
        payoutNote.trim(),
        business?.id
      );
      triggerSuccessFeedback();
      Alert.alert(
        t('Main remise'),
        t('{0} remis à {1}. Ses cotisations continuent jusqu\'à la fin du cycle.', formatCurrency(potValue), payoutTargetMember.fullName)
      );
      loadData();
    } catch (err: any) {
      Alert.alert(t('Erreur'), err?.message || t('Échec du décaissement.'));
    } finally {
      setPayoutTargetMember(null);
    }
  };


  const totalHandsTouched = cycleHandsPaidOut(members);
  // The next hand to pay out: lowest pending rank (same rule as the dashboard)
  const nextTurn = nextBeneficiary(members);
  // Round days of the cycle: rank r receives on the day of round r
  const cycleRounds = business ? buildCycleRounds(business.startDate, business.frequency, totalHandsCount) : [];
  // The round follows the calendar, not the payouts already made
  const todayStr = localDateString();
  const roundNow = roundOnDate(cycleRounds, todayStr);
  const pendingPayouts = payoutsBehind(cycleRounds, totalHandsTouched, todayStr);

  const progressRatio = totalHandsTouched / (totalHandsCount || 1);
  const isCycleDone = totalHandsTouched >= totalHandsCount && totalHandsCount > 0;

  return (
    <Screen
      edges={['top', 'left', 'right']}
      header={
        <ScreenHeader
          title={t('Sol')}
          subtitle={business?.name ? t('{0} · ordre de passage', business.name) : t('Ordre de passage')}
          right={
            <ActionMenu
              title={t('Cycle')}
              items={[
                { label: t('Paramètres du sol'), icon: 'settings', onPress: () => router.push('/setup-business' as any) },
                { label: t('Clôtures de caisse'), icon: 'calendar', onPress: () => router.push('/closure' as any) },
                { label: t('Cycles clôturés'), description: t('Clôturer, renouveler, bilans PDF'), icon: 'cycle', onPress: () => router.push('/cycle-management' as any) },
              ]}
            />
          }
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Cycle hero */}
      <Card tone="hero" padding="lg" style={styles.heroCard}>
        <View style={styles.heroPot}>
          <Text variant="label" tone="onHero">
            {t('Tour {0} sur {1}', roundNow, totalHandsCount)}
            {nextTurn ? ` · ${t('{0} reçoit', nextTurn.member.fullName)}` : ''}
          </Text>
          <AmountText amount={potValue} size="hero" tone="onHero" />
          <Text variant="body" tone="onHeroMuted">{t('Cagnotte du tour · {0} mains × {1}', totalHandsCount, formatCurrency(handUnitAmount(business)))}
          </Text>
        </View>

        <View style={styles.heroProgress}>
          {totalHandsCount <= MAX_SEGMENTS ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t('{0} main(s) remise(s) sur {1}', totalHandsTouched, totalHandsCount)}
              style={styles.segments}
            >
              {Array.from({ length: totalHandsCount }).map((_, i) => (
                <View key={i} style={[styles.segment, i < totalHandsTouched && styles.segmentDone]} />
              ))}
            </View>
          ) : (
            <ProgressBar value={progressRatio} accessibilityLabel={t('Mains remises')} />
          )}
          <View style={styles.heroProgressRow}>
            <Text variant="label" tone="onHero">
              {t('{0} / {1} mains remises', totalHandsTouched, totalHandsCount)}
            </Text>
          </View>
          {pendingPayouts > 0 && (
            <Text variant="label" tone="warning">
              {t('{0} remise(s) en attente sur les tours passés', pendingPayouts)}
            </Text>
          )}
          {cycleRounds.length > 0 && (
            <Text variant="caption" tone="onHeroMuted">
              {t('Du {0} au {1}', formatDateShort(cycleRounds[0]), formatDateShort(cycleRounds[cycleRounds.length - 1]))}
            </Text>
          )}
        </View>
      </Card>

      {isCycleDone && (
        <Card tone="success">
          <View style={styles.noticeRow}>
            <Icon name="check" size={22} color={theme.colors.success} strokeWidth={2.5} />
            <View style={styles.flexShrink}>
              <Text variant="subheading" tone="success">{t('Cycle terminé')}</Text>
              <Text variant="body" tone="success">{t('Les {0} mains de ce cycle ont été remises.', totalHandsCount)}</Text>
            </View>
          </View>
        </Card>
      )}

      <SectionHeader title={t('Adhérents')} count={members.length} />

      {members.length === 0 ? (
        <Card padding="none">
          <EmptyState icon="users" title={t('Aucun adhérent dans ce cycle')} message={t('Inscrivez les enfants du sol pour établir l\'ordre de passage.')} />
        </Card>
      ) : (
        <Card padding="none" style={styles.ledger}>
          {members.map((member, index) => {
            const handsOfMember = memberHandsCount(member);
            const receivedCount = memberReceivedHands(member);
            const hasReceived = hasReceivedAllHands(member);
            const isNextTurn = nextTurn?.member.id === member.id;
            const isMulti = handsOfMember > 1;
            // Payout days of the member's ranks, written compactly (« 07, 08 nov. »)
            const payoutDays = memberPayoutRanks(member).map((r) => cycleRounds[r - 1]).filter(Boolean);
            const payoutLabel = isMulti ? t('Remettre la main {0}/{1}', receivedCount + 1, handsOfMember) : t('Remettre la main');
            const meta = [
              isMulti ? t('{0}/{1} mains reçues', receivedCount, handsOfMember) : '',
              !hasReceived && payoutDays.length ? t('Reçoit le {0}', formatDaysCompact(payoutDays)) : '',
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <MemberRow
                key={`${member.id}-${index}`}
                name={member.fullName}
                rank={member.rankOrder || member.payoutRank || index + 1}
                highlighted={isNextTurn}
                status={isNextTurn ? 'UPCOMING_PAYOUT' : hasReceived ? 'HAND_RECEIVED' : undefined}
                statusDetail={hasReceived && !isMulti && member.handReceivedDate ? formatDateShort(member.handReceivedDate) : undefined}
                meta={meta || (hasReceived ? undefined : t('En attente de son tour'))}
                divider={index < members.length - 1}
                onPress={() => router.push(`/client/${member.id}` as any)}
                accessibilityLabel={t('Ouvrir la fiche de {0}', member.fullName)}
                action={
                  isNextTurn ? (
                    <Button label={t('Remettre')} onPress={() => handleInitiatePayout(member)} accessibilityLabel={`${payoutLabel} à ${member.fullName}`} />
                  ) : undefined
                }
              />
            );
          })}
        </Card>
      )}

      {/* Payout justification */}
      <BottomSheet
        visible={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        title={t('Remettre la main')}
        subtitle={t('{0} · rang {1}', payoutTargetMember?.fullName ?? '', payoutTargetMember?.rankOrder || payoutTargetMember?.payoutRank || 1)}
        footer={<Button size="lg" fullWidth label={t('Valider avec le PIN')} icon="lock" onPress={handleConfirmPayoutDetails} />}
      >
        <AmountText amount={potValue} size="hero" align="center" />
        <View style={styles.inputGroup}>
          <Text variant="label">{t('Motif')}</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={3}
            placeholder={t('Ex : remise effectuée en mains propres au marché')}
            placeholderTextColor={theme.colors.textPlaceholder}
            value={payoutNote}
            onChangeText={setPayoutNote}
            accessibilityLabel={t('Motif de la remise')}
          />
        </View>
        <View style={styles.noticeRow}>
          <Icon name="info" size={16} color={theme.colors.textMuted} />
          <Text variant="caption" tone="muted" style={styles.flexShrink}>{t('L\'adhérent reste dans le carnet et continue ses cotisations jusqu\'à la fin du cycle.')}</Text>
        </View>
      </BottomSheet>

      {/* 4-Digit PIN Security Modal for Payout */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title={t('Confirmer la remise')}
        subtitle={t('{0} pour {1}', formatCurrency(potValue), payoutTargetMember?.fullName ?? '')}
        onSuccess={handlePinSuccessPayout}
        onCancel={() => setIsPinModalOpen(false)}
      />
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout, typography }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    pressed: { backgroundColor: colors.surfacePressed },
    heroCard: { gap: spacing.lg },
    heroPot: { gap: spacing.xs },
    heroProgress: { gap: spacing.sm },
    heroProgressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    segments: { flexDirection: 'row', gap: spacing.xs },
    segment: { flex: 1, height: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.heroTrack },
    segmentDone: { backgroundColor: colors.heroTrackActive },

    noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },

    ledger: { overflow: 'hidden' },

    inputGroup: { gap: spacing.sm },
    textArea: {
      minHeight: layout.actionHeight + spacing.xl,
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
