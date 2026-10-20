import React, { useState, useCallback, useMemo } from 'react';
import { View, TextInput, Pressable, StyleSheet, Alert, Modal, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getDatabase, getActiveCollectorId } from '@/db/sqlite';

import { Header } from '@/components/Header';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import {
  AmountText,
  Avatar,
  Button,
  Card,
  EmptyState,
  Icon,
  ListItem,
  ProgressBar,
  Screen,
  SectionHeader,
  StatusBadge,
  Text,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { getMembersWithPaymentStatus, payoutMemberHand } from '@/db/memberRepository';
import { BusinessConfig, Member } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { getFrequencyLabel } from '@/lib/dateCalculations';
import { calculatePot, calculateCycleTotalHands } from '@/services/financialService';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

/** Segmented track (one segment per hand) is readable up to this many hands. */
const MAX_SEGMENTS = 12;

export default function SolMatrixScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { activeCollector, userRole } = useAuth();
  const { width, isSmallScreen, isTablet, horizontalPadding } = useResponsive();
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
      try {
        const db = await getDatabase();
        const collectorId = await getActiveCollectorId();
        const row = await db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(COALESCE(hands_count, 1)), 0) as total FROM clients WHERE collector_id = ?`,
          [collectorId]
        );
        const totalFromSql = Number(row?.total || 0);
        const totalFromMembers = calculateCycleTotalHands(memberList);
        setDbTotalHands(Math.max(1, totalFromMembers, totalFromSql));
      } catch {
        // Fallback to JS calculation if direct query fails
        setDbTotalHands(Math.max(1, calculateCycleTotalHands(memberList)));
      }
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
    const hands = Math.max(1, member.handsCount || 1);
    const rec = Number(member.receivedHandsCount || 0);
    setPayoutNote(`Remise de la main (${rec + 1}/${hands}) - ${member.fullName}`);
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

  // Use SQL-based total (most reliable) falling back to JS calculation then business config
  const totalHandsCount = dbTotalHands || calculateCycleTotalHands(members) || (business?.totalSlots || 10);
  const potValue = calculatePot(
    business?.contributionAmount || 250,
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
        'Main Remise avec Succès !',
        `La cagnotte complète de ${formatCurrency(potValue)} a été décaissée pour ${payoutTargetMember.fullName}.\n\nRappel : Cet enfant reste actif et doit continuer ses cotisations restantes jusqu'à la fin du cycle.`
      );
      loadData();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Échec du décaissement.');
    } finally {
      setPayoutTargetMember(null);
    }
  };


  const totalHandsTouched = members.reduce(
    (sum, m) => sum + (m.receivedHandsCount || (m.hasReceivedHand ? m.handsCount || 1 : 0)),
    0
  );
  const currentRound = Math.min(totalHandsCount, totalHandsTouched + 1);

  const progressRatio = totalHandsTouched / (totalHandsCount || 1);
  const isCycleDone = totalHandsTouched >= totalHandsCount && totalHandsCount > 0;

  return (
    <Screen
      edges={['top', 'left', 'right']}
      header={
        <Header title={business?.name || 'Sol (ROSCA)'} subtitle="Ordre de passage des mains" onRefresh={handleRefresh} />
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
        <Text variant="label" tone="onHeroMuted">
          Cycle en cours · {getFrequencyLabel(business?.frequency || 'DAILY')}
        </Text>
        <Text variant="heading" tone="onHero" numberOfLines={2}>
          {business?.name || 'Groupe Sol'}
        </Text>

        <View style={styles.heroPot}>
          <Text variant="caption" tone="onHeroMuted">
            Cagnotte par tour
          </Text>
          <AmountText amount={potValue} size="hero" tone="onHero" />
          <Text variant="body" tone="onHeroMuted">
            {totalHandsCount} mains × {formatCurrency(business?.contributionAmount || 250)}
          </Text>
        </View>

        <View style={styles.heroProgress}>
          {totalHandsCount <= MAX_SEGMENTS ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${totalHandsTouched} main(s) remise(s) sur ${totalHandsCount}`}
              style={styles.segments}
            >
              {Array.from({ length: totalHandsCount }).map((_, i) => (
                <View key={i} style={[styles.segment, i < totalHandsTouched && styles.segmentDone]} />
              ))}
            </View>
          ) : (
            <ProgressBar value={progressRatio} tone="onHero" accessibilityLabel="Mains remises" />
          )}
          <View style={styles.heroProgressRow}>
            <Text variant="label" tone="onHero">
              {totalHandsTouched} / {totalHandsCount} mains remises
            </Text>
            <Text variant="label" tone="onHero">
              {Math.round(progressRatio * 100)} %
            </Text>
          </View>
        </View>
      </Card>

      {isCycleDone && (
        <Card tone="success">
          <View style={styles.noticeRow}>
            <Icon name="check" size={22} color={theme.colors.success} strokeWidth={2.5} />
            <View style={styles.flexShrink}>
              <Text variant="subheading" tone="success">
                Cycle terminé
              </Text>
              <Text variant="body" tone="success">
                Les {totalHandsCount} mains de ce cycle ont été remises.
              </Text>
            </View>
          </View>
        </Card>
      )}

      <SectionHeader title="Ordre de passage" count={members.length} />

      {members.length === 0 ? (
        <Card padding="none">
          <EmptyState icon="users" title="Aucun adhérent dans ce cycle" message="Inscrivez les enfants du sol pour établir l'ordre de passage." />
        </Card>
      ) : (
        members.map((member, index) => {
          const memberHandsCount = Math.max(1, member.handsCount || 1);
          const receivedCount = Number(member.receivedHandsCount || 0);
          const hasReceived = receivedCount >= memberHandsCount || Boolean(member.hasReceivedHand || member.hasReceivedPayout);

          const ranksList = (member.payoutRanks ? String(member.payoutRanks).split(',') : [String(member.payoutRank || '')])
            .map((r) => Number(r.trim()))
            .filter((n) => !isNaN(n) && n > 0);
          const isNextTurn = !hasReceived && (ranksList.includes(currentRound) || member.payoutRank === currentRound);
          const isMulti = memberHandsCount > 1;

          return (
            <Card
              key={`${member.id}-${index}`}
              padding="none"
              style={[styles.rankCard, isNextTurn && styles.rankCardCurrent, hasReceived && styles.rankCardDone]}
            >
              <ListItem
                divider={false}
                leading={<Avatar rank={member.rankOrder || member.payoutRank || index + 1} highlighted={isNextTurn} />}
                title={member.fullName}
                subtitle={member.phoneNumber}
                meta={
                  <View style={styles.meta}>
                    {isNextTurn && <StatusBadge status="UPCOMING_PAYOUT" appearance="inline" />}
                    {hasReceived && (
                      <StatusBadge
                        status="HAND_RECEIVED"
                        appearance="inline"
                        label={isMulti ? `${memberHandsCount}/${memberHandsCount} mains reçues` : 'Main reçue'}
                        detail={!isMulti && member.handReceivedDate ? formatDateShort(member.handReceivedDate) : undefined}
                      />
                    )}
                    {isMulti && !hasReceived && (
                      <>
                        <Text variant="caption" tone="muted">
                          {receivedCount}/{memberHandsCount} mains reçues · rangs {member.payoutRanks || member.payoutRank}
                        </Text>
                        <ProgressBar value={receivedCount / memberHandsCount} size="sm" tone="success" />
                      </>
                    )}
                  </View>
                }
              />
              {!hasReceived && (
                <View style={styles.rankAction}>
                  <Button
                    variant={isNextTurn ? 'primary' : 'secondary'}
                    icon="payout"
                    fullWidth
                    label={isMulti ? `Remettre la main (${receivedCount + 1}/${memberHandsCount})` : 'Remettre la main'}
                    onPress={() => handleInitiatePayout(member)}
                    accessibilityLabel={`Remettre la main à ${member.fullName}`}
                  />
                </View>
              )}
            </Card>
          );
        })
      )}

      {/* Payout justification */}
      <Modal visible={isPayoutModalOpen} transparent animationType="fade" onRequestClose={() => setIsPayoutModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: Math.min(420, width - theme.spacing.xxl) }]}>
            <Pressable
              onPress={() => setIsPayoutModalOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
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
              <AmountText amount={potValue} size="large" align="center" />
              <Text variant="body" tone="muted" align="center">
                pour {payoutTargetMember?.fullName} (main #{payoutTargetMember?.rankOrder || payoutTargetMember?.payoutRank || 1})
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text variant="label">Justification du décaissement (obligatoire)</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Ex : remise effectuée en mains propres au marché"
                placeholderTextColor={theme.colors.textPlaceholder}
                value={payoutNote}
                onChangeText={setPayoutNote}
                accessibilityLabel="Justification du décaissement"
              />
            </View>

            <View style={styles.infoBox}>
              <Icon name="info" size={18} color={theme.colors.info} />
              <Text variant="caption" style={[styles.flexShrink, { color: theme.colors.info }]}>
                L'adhérent reste dans le carnet et doit continuer ses cotisations restantes.
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <Button label="Annuler" variant="secondary" onPress={() => setIsPayoutModalOpen(false)} style={styles.flexOne} />
              <Button label="Valider avec PIN" icon="lock" onPress={handleConfirmPayoutDetails} style={styles.flexTwo} />
            </View>
          </View>
        </View>
      </Modal>

      {/* 4-Digit PIN Security Modal for Payout */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Validation Sécurisée de la Main"
        subtitle={`Saisissez votre code PIN gestionnaire pour autoriser le décaissement de ${formatCurrency(potValue)}.`}
        onSuccess={handlePinSuccessPayout}
        onCancel={() => setIsPinModalOpen(false)}
      />
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout, typography }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    flexOne: { flexGrow: 1, flexBasis: 0 },
    flexTwo: { flexGrow: 2, flexBasis: 0 },
    pressed: { backgroundColor: colors.surfacePressed },

    heroCard: { gap: spacing.xs },
    heroPot: { marginTop: spacing.md },
    heroProgress: { marginTop: spacing.md, gap: spacing.sm },
    heroProgressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    segments: { flexDirection: 'row', gap: spacing.xs },
    segment: { flex: 1, height: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.heroTrack },
    segmentDone: { backgroundColor: colors.heroTrackActive },

    noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },

    rankCard: { overflow: 'hidden' },
    rankCardCurrent: { borderColor: colors.primary, borderWidth: 2 },
    rankCardDone: { backgroundColor: colors.surfaceAlt },
    meta: { gap: spacing.xs },
    rankAction: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },

    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: layout.gutter,
    },
    modalCard: {
      width: '100%',
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
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.infoLine,
      backgroundColor: colors.infoSoft,
    },
    modalBtnRow: { flexDirection: 'row', gap: spacing.sm },
  });
