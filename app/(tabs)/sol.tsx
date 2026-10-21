import React, { useState, useCallback, useMemo } from 'react';
import { View, TextInput, Pressable, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getDatabase, getActiveCollectorId } from '@/db/sqlite';

import { SyncBadge } from '@/components/SyncBadge';
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
import { calculatePot, calculateCycleTotalHands } from '@/services/financialService';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { Theme, useTheme } from '@/theme';

/** Segmented track (one segment per hand) is readable up to this many hands. */
const MAX_SEGMENTS = 12;

export default function SolMatrixScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { userRole } = useAuth();
  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';
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
    if (isReadOnly) {
      Alert.alert('Accès en lecture seule', 'La remise de la main est réservée aux gestionnaires.');
      return;
    }
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
        'Main remise',
        `${formatCurrency(potValue)} remis à ${payoutTargetMember.fullName}. Ses cotisations continuent jusqu'à la fin du cycle.`
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
        <View style={styles.topBar}>
          <View style={styles.flexShrink}>
            <Text variant="title" accessibilityRole="header">
              Sol
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {business?.name ? `${business.name} · ordre de passage` : 'Ordre de passage'}
            </Text>
          </View>
          <SyncBadge onSyncComplete={handleRefresh} compact />
          <ActionMenu
            title="Cycle"
            items={[
              { label: 'Gestion du cycle', description: 'Clôturer, renouveler, bilans PDF', icon: 'cycle', onPress: () => router.push('/cycle-management' as any) },
              { label: 'Clôtures de caisse', icon: 'calendar', onPress: () => router.push('/closure' as any) },
            ]}
          />
        </View>
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
          <AmountText amount={potValue} size="hero" tone="onHero" />
          <Text variant="body" tone="onHeroMuted">
            Cagnotte du tour · {totalHandsCount} mains × {formatCurrency(business?.contributionAmount || 250)}
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
            <ProgressBar value={progressRatio} accessibilityLabel="Mains remises" />
          )}
          <View style={styles.heroProgressRow}>
            <Text variant="label" tone="onHero">
              {totalHandsTouched} / {totalHandsCount} mains remises
            </Text>
            <Text variant="caption" tone="onHeroMuted">
              Tour {currentRound} sur {totalHandsCount}
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

      <SectionHeader title="Adhérents" count={members.length} />

      {members.length === 0 ? (
        <Card padding="none">
          <EmptyState icon="users" title="Aucun adhérent dans ce cycle" message="Inscrivez les enfants du sol pour établir l'ordre de passage." />
        </Card>
      ) : (
        <Card padding="none" style={styles.ledger}>
          {members.map((member, index) => {
            const memberHandsCount = Math.max(1, member.handsCount || 1);
            const receivedCount = Number(member.receivedHandsCount || 0);
            const hasReceived = receivedCount >= memberHandsCount || Boolean(member.hasReceivedHand || member.hasReceivedPayout);

            const ranksList = (member.payoutRanks ? String(member.payoutRanks).split(',') : [String(member.payoutRank || '')])
              .map((r) => Number(r.trim()))
              .filter((n) => !isNaN(n) && n > 0);
            const isNextTurn = !hasReceived && (ranksList.includes(currentRound) || member.payoutRank === currentRound);
            const isMulti = memberHandsCount > 1;
            const isLast = index === members.length - 1;
            const payoutLabel = isMulti ? `Remettre la main ${receivedCount + 1}/${memberHandsCount}` : 'Remettre la main';

            return (
              <View key={`${member.id}-${index}`} style={isNextTurn && styles.rowCurrent}>
                <ListItem
                  divider={false}
                  leading={<Avatar rank={member.rankOrder || member.payoutRank || index + 1} highlighted={isNextTurn} />}
                  title={member.fullName}
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
                        </>
                      )}
                      {!isNextTurn && !hasReceived && !isMulti && (
                        <Text variant="caption" tone="muted">
                          En attente de son tour
                        </Text>
                      )}
                    </View>
                  }
                  trailing={
                    isNextTurn ? (
                      <Button
                        label="Remettre"
                        onPress={() => handleInitiatePayout(member)}
                        accessibilityLabel={`${payoutLabel} à ${member.fullName}`}
                      />
                    ) : !hasReceived ? (
                      <Pressable
                        onPress={() => handleInitiatePayout(member)}
                        accessibilityRole="button"
                        accessibilityLabel={`${payoutLabel} à ${member.fullName} (hors tour)`}
                        hitSlop={4}
                        style={({ pressed }) => [styles.roundAction, pressed && styles.pressed]}
                      >
                        <Icon name="payout" size={20} color={theme.colors.textMuted} />
                      </Pressable>
                    ) : undefined
                  }
                />
                {!isLast && <View style={styles.rule} />}
              </View>
            );
          })}
        </Card>
      )}

      {/* Payout justification */}
      <BottomSheet
        visible={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        title="Remettre la main"
        subtitle={`${payoutTargetMember?.fullName ?? ''} · rang ${payoutTargetMember?.rankOrder || payoutTargetMember?.payoutRank || 1}`}
        footer={<Button size="lg" fullWidth label="Valider avec le PIN" icon="lock" onPress={handleConfirmPayoutDetails} />}
      >
        <AmountText amount={potValue} size="hero" align="center" />
        <View style={styles.inputGroup}>
          <Text variant="label">Motif</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={3}
            placeholder="Ex : remise effectuée en mains propres au marché"
            placeholderTextColor={theme.colors.textPlaceholder}
            value={payoutNote}
            onChangeText={setPayoutNote}
            accessibilityLabel="Motif de la remise"
          />
        </View>
        <View style={styles.noticeRow}>
          <Icon name="info" size={16} color={theme.colors.textMuted} />
          <Text variant="caption" tone="muted" style={styles.flexShrink}>
            L'adhérent reste dans le carnet et continue ses cotisations jusqu'à la fin du cycle.
          </Text>
        </View>
      </BottomSheet>

      {/* 4-Digit PIN Security Modal for Payout */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Confirmer la remise"
        subtitle={`${formatCurrency(potValue)} pour ${payoutTargetMember?.fullName ?? ''}`}
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
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingLeft: layout.gutter,
      paddingRight: spacing.sm,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xs,
    },

    heroCard: { gap: spacing.lg },
    heroPot: { gap: spacing.xs },
    heroProgress: { gap: spacing.sm },
    heroProgressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    segments: { flexDirection: 'row', gap: spacing.xs },
    segment: { flex: 1, height: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.heroTrack },
    segmentDone: { backgroundColor: colors.heroTrackActive },

    noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },

    ledger: { overflow: 'hidden' },
    rowCurrent: { backgroundColor: colors.primarySoft },
    rule: { height: 1, marginLeft: spacing.md + spacing.xxxl - spacing.sm + spacing.md, backgroundColor: colors.divider },
    meta: { gap: spacing.xs },
    roundAction: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
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
  });
