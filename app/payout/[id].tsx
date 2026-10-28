import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { getClientById, getAllClients } from '@/db/clientRepository';
import { getActiveBusinessConfig, getCycleHandsTotal } from '@/db/businessRepository';
import { payoutMemberHand } from '@/db/memberRepository';

import { recordAuditLog } from '@/services/auditService';
import { generatePayoutReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Client, BusinessConfig } from '@/types';
import { formatCurrency, formatDate, getInitials } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { safeBack } from '@/lib/navigation';
import { Header } from '@/components/Header';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { AmountText, Avatar, Button, Card, Icon, ProgressBar, Screen, Text, TextField } from '@/components/ui';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

import { calculateCycleTotalHands } from '@/services/financialService';
import { t } from '@/i18n';

export default function PayoutScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeCollector, userRole } = useAuth();
  const { triggerSync } = useSync();
  const { isSmallScreen, contentMaxWidth, horizontalPadding } = useResponsive();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';

  const [client, setClient] = useState<Client | null>(null);
  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [dbTotalHands, setDbTotalHands] = useState<number>(0);
  const [payoutNote, setPayoutNote] = useState('');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadData = async () => {
    if (!id) return;
    const [cData, biz, cList] = await Promise.all([
      getClientById(id),
      getActiveBusinessConfig(),
      getAllClients(),
    ]);
    setClient(cData);
    setBusiness(biz);
    setAllClients(cList);

    // Rounds in the cycle: same count as the dashboard, payouts and statuses (deleted members excluded)
    setDbTotalHands(Math.max(1, await getCycleHandsTotal()));

    if (cData) {
      const hands = Math.max(1, cData.handsCount || 1);
      const curRec = cData.receivedHandsCount || 0;
      setPayoutNote(`Remise de la main (${curRec + 1}/${hands}) - ${cData.fullName}`);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const unitAmount = business?.contributionAmount || client?.dailyAmount || 250;
  const memberHandsCount = Math.max(1, client?.handsCount || 1);
  const totalCycleHands = dbTotalHands || calculateCycleTotalHands(allClients) || (business?.totalSlots || 10);
  const totalPotAmount = totalCycleHands * unitAmount;

  const rawReceived = Number(client?.receivedHandsCount || 0);
  const hasPayoutFlag = Boolean(client?.hasReceivedHand || client?.hasReceivedPayout);
  const currentReceivedHands = Math.max(
    rawReceived,
    hasPayoutFlag ? (rawReceived > 0 ? rawReceived : memberHandsCount) : 0
  );

  const isFullyReceived = currentReceivedHands >= memberHandsCount || hasPayoutFlag;

  const totalHandsTouched = allClients.reduce((sum, m) => {
    const rawRec = Number(m.receivedHandsCount || 0);
    const flag = Boolean(m.hasReceivedHand || m.hasReceivedPayout);
    const hands = Math.max(1, Number(m.handsCount || 1));
    return sum + Math.max(rawRec, flag ? (rawRec > 0 ? rawRec : hands) : 0);
  }, 0);
  const effectiveTotalHandsTouched = Math.max(totalHandsTouched, currentReceivedHands);
  const cycleProgressPct = totalCycleHands > 0 ? Math.min(100, Math.round((effectiveTotalHandsTouched / totalCycleHands) * 100)) : 0;
  const memberPayoutProgressPct = memberHandsCount > 0 ? Math.min(100, Math.round((currentReceivedHands / memberHandsCount) * 100)) : 0;

  const handleInitiatePayout = () => {
    if (isFullyReceived) {
      triggerErrorFeedback();
      Alert.alert(
        t('Action Interdite'),
        t('Cet adhérent ({0}) a déjà reçu l\'intégralité de ses mains ({1}/{2}) pour ce cycle de SOL.', client?.fullName, memberHandsCount, memberHandsCount)
      );
      return;
    }

    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert(t('Accès Lecture Seule'), t('Le décaissement de la main est réservé aux gestionnaires.'));
      return;
    }

    if (!payoutNote.trim()) {
      triggerErrorFeedback();
      Alert.alert(t('Motif requis'), t('Veuillez saisir une note ou justification pour le décaissement.'));
      return;
    }

    triggerMediumImpact();
    setIsPinModalOpen(true);
  };

  const handleConfirmPayout = async () => {
    setIsPinModalOpen(false);
    if (!client) return;

    if (isFullyReceived) {
      triggerErrorFeedback();
      Alert.alert(t('Erreur'), t('Action interdite : Cet adhérent a déjà reçu l\'intégralité de ses mains pour ce cycle.'));
      return;
    }

    setIsProcessing(true);
    try {
      const tx = await payoutMemberHand(
        client.id,
        totalPotAmount,
        payoutNote.trim() || `Remise de la main (${currentReceivedHands + 1}/${memberHandsCount}) pour ${client.fullName}`,
        business?.id
      );

      triggerSuccessFeedback();
      const remainingHandsToReceive = memberHandsCount - (currentReceivedHands + 1);
      const remainingNotice = remainingHandsToReceive > 0
        ? '\n\n' + t('Il reste encore {0} main{1} à décaisser pour cet adhérent au cours de ce cycle.', remainingHandsToReceive, remainingHandsToReceive > 1 ? 's' : '')
        : '\n\n' + t('Toutes les {0} mains de cet adhérent ont été intégralement remises.', memberHandsCount);

      Alert.alert(
        t('Main Remise avec Succès !'),
        t('La cagnotte de {0} a été décaissée pour {1} (Main {2}/{3}).\n\nCalculée sur la base des {4} mains effectives du cycle ({5} × {6}).{7}', formatCurrency(totalPotAmount), client.fullName, currentReceivedHands + 1, memberHandsCount, totalCycleHands, totalCycleHands, formatCurrency(unitAmount), remainingNotice),
        [
          {
            text: t('Télécharger Reçu PDF'),
            onPress: async () => {
              try {
                const pdfUri = await generatePayoutReceiptPdf({
                  transactionId: tx.id,
                  businessName: business?.name || 'SOL Mobile',
                  collectorName: activeCollector?.fullName || 'Agent SOL',
                  collectorPhone: activeCollector?.phoneNumber || '+509 XX XX XXXX',
                  collectorZone: activeCollector?.zone,
                  clientName: client.fullName,
                  clientPhone: client.phoneNumber,
                  payoutRank: client.payoutRank || undefined,
                  totalPotAmount,
                  registeredChildrenCount: totalCycleHands,
                  unitAmount,
                  note: payoutNote.trim(),
                  createdAt: new Date().toISOString(),
                });
                await sharePdfFile(pdfUri, `Recu_Decaissement_${client.fullName.replace(/\s+/g, '_')}.pdf`);
              } catch {
                Alert.alert(t('Erreur'), t('Impossible de générer le reçu PDF.'));
              }
              router.replace('/(tabs)' as any);
            },
          },
          {
            text: t('Fermer'),
            style: 'cancel',
            onPress: () => router.replace('/(tabs)' as any),
          },
        ]
      );
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert(t('Erreur'), err?.message || t('Échec du décaissement.'));
    } finally {
      setIsProcessing(false);
    }
  };

  const header = (
    <Header
      title={t('Décaissement')}
      subtitle={t('Bay Men · {0}', business?.name || 'Carnet SOL')}
      showBack={true}
      showScanner={false}
      fallbackBackRoute="/(tabs)"
    />
  );

  if (!client) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']} header={header} scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text variant="body" tone="muted">{t('Chargement du dossier…')}</Text>
        </View>
      </Screen>
    );
  }

  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
  const details: { label: string; value: string }[] = [
    { label: t('Effectif total du cycle'), value: `${plural(allClients.length, 'enfant')} · ${plural(totalCycleHands, 'main')}` },
    { label: t('Mains souscrites par l\'adhérent'), value: t('{0} (rangs #{1})', plural(memberHandsCount, 'part'), client.payoutRanks || client.payoutRank || 1) },
    { label: t('Cotisation par main'), value: formatCurrency(unitAmount) },
    { label: t('Total à percevoir sur le cycle'), value: `${formatCurrency(totalPotAmount * memberHandsCount)} (${plural(memberHandsCount, 'tirage')})` },
  ];

  return (
    <Screen
      edges={['top', 'left', 'right', 'bottom']}
      header={header}
      contentStyle={styles.content}
      footer={
        isFullyReceived ? undefined : (
          <Button
            size="lg"
            fullWidth
            icon="payout"
            loading={isProcessing}
            disabled={isProcessing}
            label={isProcessing ? t('Validation en cours…') : t('Valider la remise · {0}', formatCurrency(totalPotAmount))}
            accessibilityHint={t('Demande votre code PIN gestionnaire')}
            onPress={handleInitiatePayout}
          />
        )
      }
    >
      {/* Recipient Profile Card */}
      <Card>
        <View style={styles.profileRow}>
          <Avatar name={client.fullName} size="lg" highlighted={!isFullyReceived} />
          <View style={styles.flexShrink}>
            <Text variant="heading" numberOfLines={2}>
              {client.fullName}
            </Text>
            <Text variant="body" tone="muted">
              {client.phoneNumber}
            </Text>
            <View style={styles.pills}>
              <View style={styles.pill}>
                <Icon name="payout" size={14} color={theme.colors.primary} />
                <Text variant="label" tone="primary">
                  {memberHandsCount > 1 && client.payoutRanks ? t('Rangs #{0}', client.payoutRanks) : t('Main #{0}', client.payoutRank || 1)}
                </Text>
              </View>
              {memberHandsCount > 1 && (
                <View style={styles.pill}>
                  <Text variant="label" tone="primary">
                    {t('{0} mains souscrites', memberHandsCount)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Card>

      {/* Status Alert if Already Fully Received */}
      {isFullyReceived ? (
        <Card tone="success" style={styles.doneCard}>
          <View style={styles.doneDisc}>
            <Icon name="check" size={28} color={theme.colors.success} />
          </View>
          <Text variant="heading" align="center">
            {memberHandsCount > 1 ? t('Toutes les mains remises ({0}/{1})', memberHandsCount, memberHandsCount) : t('Main déjà remise')}
          </Text>
          <Text variant="body" align="center">{t('Cet adhérent a déjà perçu l\'intégralité de ses mains ({0} main(s)) pour ce cycle de SOL.{1}', memberHandsCount, client.handReceivedDate ? t('\nDernière remise : {0}.', formatDate(client.handReceivedDate)) : '')}
          </Text>
          <Text variant="caption" tone="muted" align="center">{t('Règle SOL : un adhérent ne peut pas recevoir plus de mains que son quota souscrit.')}</Text>
        </Card>
      ) : (
        <>
          {/* Pot Breakdown Card */}
          <Card tone="hero" style={styles.heroCard}>
            <Text variant="label" tone="onHeroMuted">{t('Montant de la cagnotte du tirage')}</Text>
            <AmountText amount={totalPotAmount} size="hero" tone="onHero" />
            <Text variant="caption" tone="onHeroMuted">
              {t('{0} mains effectives au cycle × {1} par main', totalCycleHands, formatCurrency(unitAmount))}</Text>
          </Card>

          <Card style={styles.detailsCard}>
            {details.map((d) => (
              <View key={d.label} style={styles.row}>
                <Text variant="body" tone="muted" style={styles.flexShrink}>
                  {d.label}
                </Text>
                <Text variant="bodyStrong" align="right" style={styles.value}>
                  {d.value}
                </Text>
              </View>
            ))}

            <View style={styles.divider} />

            {/* Recipient Payout Progress */}
            <View style={styles.progressBlock}>
              <View style={styles.row}>
                <Text variant="label">{t('Tirages perçus')}</Text>
                <Text variant="amountSmall">
                  {currentReceivedHands} / {memberHandsCount} · {memberPayoutProgressPct} %
                </Text>
              </View>
              <ProgressBar value={memberPayoutProgressPct / 100} accessibilityLabel={t('Tirages perçus : {0} %', memberPayoutProgressPct)} />
            </View>

            {/* Global Cycle Progress */}
            <View style={styles.progressBlock}>
              <View style={styles.row}>
                <Text variant="label">{t('Mains données au total')}</Text>
                <Text variant="amountSmall">
                  {totalHandsTouched} / {totalCycleHands} · {cycleProgressPct} %
                </Text>
              </View>
              <ProgressBar value={cycleProgressPct / 100} tone="success" accessibilityLabel={t('Mains données au total : {0} %', cycleProgressPct)} />
            </View>
          </Card>

          {/* Justification / Note */}
          <Card>
            <TextField
              label={t('Justification / note de remise *')}
              value={payoutNote}
              onChangeText={setPayoutNote}
              placeholder={t('Motif ou référence de la remise…')}
              multiline
            />
          </Card>
        </>
      )}

      {/* PIN Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        onCancel={() => setIsPinModalOpen(false)}
        onSuccess={handleConfirmPayout}
        title={t('Validation par Code PIN')}
        subtitle={t('Saisissez votre code PIN gestionnaire pour confirmer le décaissement de {0} à {1}.', formatCurrency(totalPotAmount), client.fullName)}
        onLockout={() => {
          recordAuditLog({
            action: 'LOGIN_FAILURE',
            entityType: 'SYSTEM',
            entityId: client.id || 'unknown',
            reason: t('3 tentatives PIN échouées lors du décaissement pour {0} (Montant: {1}).', client.fullName, formatCurrency(totalPotAmount)),
            userId: activeCollector?.id || 'c011ec70-0000-0000-0000-000000000001',
            userRole: 'MANAGER',
          });
        }}
      />
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    content: { gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },

    profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
    },

    doneCard: { alignItems: 'center', gap: spacing.sm },
    doneDisc: {
      width: spacing.xxxl + spacing.sm,
      height: spacing.xxxl + spacing.sm,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },

    heroCard: { gap: spacing.xs },
    detailsCard: { gap: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    value: { flexShrink: 1, minWidth: 0 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
    progressBlock: { gap: spacing.xs },
  });
