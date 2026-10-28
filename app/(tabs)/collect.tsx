import React, { useState, useCallback, useMemo } from 'react';
import { View, Pressable, StyleSheet, Alert, FlatList, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { PinVerificationModal } from '@/components/PinVerificationModal';
import { SyncBadge } from '@/components/SyncBadge';
import {
  AmountText,
  Avatar,
  BottomSheet,
  Button,
  EmptyState,
  Icon,
  ListItem,
  ListSkeleton,
  ProgressBar,
  Screen,
  StatusBadge,
  memberStatusDetail,
  Text,
} from '@/components/ui';
import { getClientById, getAllClients } from '@/db/clientRepository';
import { createTransaction } from '@/db/transactionRepository';
import { getActiveBusinessConfig, getCycleHandsTotal } from '@/db/businessRepository';
import { getMembersWithPaymentStatus } from '@/db/memberRepository';

import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { BusinessConfig, Client, Member, MemberPaymentStatus, Transaction } from '@/types';
import { formatCurrency, formatDateShort, formatDayMonth } from '@/lib/formatters';
import { extractRaw8Digits } from '@/lib/phoneUtils';
import { triggerSuccessFeedback, triggerErrorFeedback, triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import {
  calculateContributionAmount,
  calculateCycleContributionLimits,
  calculateCycleTotalHands,
  calculateHandsCovered,
} from '@/services/financialService';
import { generateContributionReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';
import { localDateString } from '@/lib/dates';
import { buildCycleRounds } from '@/services/scheduleService';

/** Members still to collect come first, completed cycles last. */
const STATUS_ORDER: Record<MemberPaymentStatus, number> = {
  OVERDUE: 0,
  UNPAID_TODAY: 1,
  UPCOMING_PAYOUT: 2,
  PAID_TODAY: 3,
  PAID_IN_ADVANCE: 4,
};

/**
 * Encaisser: search + list of members (to collect first). Tap a member → bottom sheet
 * (hands −/+, amount, Encaisser → PIN) → success state with the receipt. 3 taps from the tab.
 */
export default function CollectScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string }>();
  const { activeCollector, userRole } = useAuth();
  const { triggerSync } = useSync();
  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';

  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [statusById, setStatusById] = useState<Record<string, Member>>({});
  const [handsCount, setHandsCount] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  /** Figures of the last collection, frozen before the member is reloaded (receipt + success state). */
  const [lastReceipt, setLastReceipt] = useState<{ handsCount: number; unitAmount: number; totalAmount: number; start: string; end: string; coverageText: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dbTotalHands, setDbTotalHands] = useState<number>(0);

  const unitAmount = business?.contributionAmount || selectedClient?.dailyAmount || 250;
  const totalAmount = calculateContributionAmount(handsCount, unitAmount);

  const loadData = useCallback(async () => {
    try {
      const [biz, list, members] = await Promise.all([
        getActiveBusinessConfig(),
        getAllClients(),
        getMembersWithPaymentStatus({ filter: 'ALL', sort: 'PAYOUT_RANK' }).catch(() => []),
      ]);
      setBusiness(biz);
      setAllClients(list);
      setStatusById(Object.fromEntries(members.map((m) => [m.id, m])));

      // Direct SQL SUM for guaranteed accuracy
      // Rounds in the cycle: same count as the dashboard, payouts and statuses (deleted members excluded)
      setDbTotalHands(Math.max(1, await getCycleHandsTotal()));
      return list;
    } catch (err) {
      console.warn('Error loading collect data:', err);
      return [];
    } finally {
      setLoaded(true);
    }
  }, []);

  const totalCycleHands = dbTotalHands || calculateCycleTotalHands(allClients) || (business?.totalSlots || 10);

  const limitsFor = useCallback(
    (client: Client) => {
      const unit = business?.contributionAmount || client.dailyAmount || 250;
      const balance = Number(client.currentBalance || 0);
      const totalPaid = Number(client.totalPaidAmount || balance);
      const paidHands = Math.max(Number(client.paidHandsCount || 0), calculateHandsCovered(balance, unit), calculateHandsCovered(totalPaid, unit));
      const memberHands = Math.max(1, client.handsCount || 1);
      return {
        paidHands,
        memberHands,
        unit,
        ...calculateCycleContributionLimits({ currentPaidHands: paidHands, totalCycleHands, memberHandsCount: memberHands, unitAmount: unit }),
      };
    },
    [business?.contributionAmount, totalCycleHands]
  );

  const handleSelectClient = useCallback(
    (client: Client) => {
      triggerLightImpact();
      const l = limitsFor(client);
      setSelectedClient(client);
      setLastTx(null);
      setHandsCount(l.remainingHands > 0 ? (l.memberHands > 1 ? Math.min(l.remainingHands, l.memberHands) : 1) : 0);
      setIsSheetOpen(true);
    },
    [limitsFor]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadData().then((list) => {
        if (!active || !params.clientId) return;
        const found = list.find((c) => c.id === params.clientId);
        router.setParams({ clientId: undefined });
        if (found) handleSelectClient(found);
      });
      return () => {
        active = false;
        // A sheet left open must not float over the other tabs
        setIsSheetOpen(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadData, params.clientId])
  );

  const current = selectedClient ? limitsFor(selectedClient) : null;
  const memberHandsCount = current?.memberHands ?? 1;
  const currentPaidHands = current?.paidHands ?? 0;
  const limits = current ?? {
    remainingHands: 0,
    maxAllowedHands: 0,
    maxPotAmount: 0,
    isCycleCompleted: false,
  };

  const presetRounds = [
    { label: memberHandsCount > 1 ? t('1 tour') : t('1 main'), hands: memberHandsCount },
    { label: memberHandsCount > 1 ? t('2 tours') : t('2 mains'), hands: memberHandsCount * 2 },
    { label: memberHandsCount > 1 ? t('3 tours') : t('3 mains'), hands: memberHandsCount * 3 },
    ...(limits.remainingHands > memberHandsCount * 3 ? [{ label: t('Tout le solde'), hands: limits.remainingHands }] : []),
  ].filter((p) => p.hands <= limits.remainingHands);

  const handleIncrement = () => {
    triggerLightImpact();
    if (handsCount < limits.remainingHands) setHandsCount(handsCount + 1);
  };

  const handleDecrement = () => {
    triggerLightImpact();
    if (handsCount > 1) setHandsCount(handsCount - 1);
  };

  // Coverage from the cycle calendar: every round needs all the member's hands, oldest first
  const todayStr = localDateString();
  const cycleRounds = useMemo(
    () => (business ? buildCycleRounds(business.startDate, business.frequency, totalCycleHands) : []),
    [business, totalCycleHands]
  );
  const paidAfter = currentPaidHands + (handsCount > 0 ? handsCount : 1);
  const fullRoundsAfter = Math.min(cycleRounds.length, Math.floor(paidAfter / memberHandsCount));
  const previewStartDateStr = cycleRounds[Math.floor(currentPaidHands / memberHandsCount)] || todayStr;
  const previewDateStr = fullRoundsAfter > 0 ? cycleRounds[fullRoundsAfter - 1] : '';
  // Hands left over for the next round (1 hand of a 2-hand member): that round stays partial
  const previewPartialDate = paidAfter % memberHandsCount !== 0 ? cycleRounds[fullRoundsAfter] || '' : '';
  const coverageText = [
    previewDateStr ? `${t('· couvert jusqu\'au')} ${formatDateShort(previewDateStr)}` : '',
    previewPartialDate ? t('· tour du {0} partiel', formatDateShort(previewPartialDate)) : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleOpenPinValidation = () => {
    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert(t('Accès en lecture seule'), t('L\'encaissement est réservé aux gestionnaires.'));
      return;
    }
    if (!selectedClient) return;
    if (limits.isCycleCompleted) {
      triggerErrorFeedback();
      Alert.alert(
        t('Plafond du cycle atteint'),
        t('{0} a déjà complété toutes ses cotisations pour ce cycle ({1}/{2} mains, {3}).', selectedClient.fullName, currentPaidHands, limits.maxAllowedHands, formatCurrency(limits.maxPotAmount))
      );
      return;
    }
    if (handsCount <= 0 || totalAmount <= 0) {
      triggerErrorFeedback();
      Alert.alert(t('Nombre de mains invalide'), t('Sélectionnez au moins 1 main.'));
      return;
    }
    if (handsCount > limits.remainingHands) {
      triggerErrorFeedback();
      Alert.alert(t('Dépassement du plafond'), t('Cet adhérent ne peut plus cotiser que {0} main(s) pour ce cycle.', limits.remainingHands));
      return;
    }
    triggerMediumImpact();
    setIsSheetOpen(false);
    setIsPinModalOpen(true);
  };

  const handlePinSuccessSubmit = async () => {
    setIsPinModalOpen(false);
    if (!selectedClient) return;

    setIsProcessing(true);
    try {
      const collectorId = activeCollector?.id || 'c011ec70-0000-0000-0000-000000000001';

      const tx = await createTransaction({
        clientId: selectedClient.id,
        collectorId,
        amount: totalAmount,
        handsCovered: handsCount,
        type: 'SOL_CONTRIBUTION',
        paymentMethod: 'CASH',
        note: `Encaissement de ${handsCount} main(s) de ${formatCurrency(unitAmount)}${previewDateStr ? ` (Couvre jusqu'au ${formatDateShort(previewDateStr)})` : ''}${previewPartialDate ? ` (Tour du ${formatDateShort(previewPartialDate)} partiel)` : ''}`,
      });

      triggerSuccessFeedback();
      setLastReceipt({ handsCount, unitAmount, totalAmount, start: previewStartDateStr, end: previewDateStr || previewPartialDate || previewStartDateStr, coverageText });
      setLastTx(tx);
      setIsSheetOpen(true);

      const updated = await getClientById(selectedClient.id);
      if (updated) setSelectedClient(updated);
      loadData();

      triggerSync().catch(() => {});
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert(t('Erreur'), err?.message || t('Échec de l\'enregistrement de l\'encaissement.'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShareReceipt = async () => {
    if (!lastTx || !selectedClient || !lastReceipt) return;
    triggerMediumImpact();
    try {
      const pdfUri = await generateContributionReceiptPdf({
        transactionId: lastTx.id,
        businessName: business?.name || 'SOL Mobile',
        collectorName: activeCollector?.fullName || 'Gestionnaire SOL',
        collectorPhone: activeCollector?.phoneNumber || '+509 XX XX XXXX',
        collectorZone: activeCollector?.zone,
        clientName: selectedClient.fullName,
        clientPhone: selectedClient.phoneNumber,
        payoutRank: selectedClient.payoutRank || undefined,
        qrCodeToken: selectedClient.qrCodeToken,
        unitAmount: lastReceipt.unitAmount,
        handsCount: lastReceipt.handsCount,
        totalAmount: lastReceipt.totalAmount,
        coverageStartDate: lastReceipt.start,
        coverageEndDate: lastReceipt.end,
        createdAt: lastTx.createdAtLocal,
      });

      await sharePdfFile(pdfUri, `Recu_SOL_${selectedClient.fullName.replace(/\s+/g, '_')}.pdf`);
    } catch {
      Alert.alert(t('Erreur PDF'), t('Impossible de générer ou partager le document PDF.'));
    }
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    setLastTx(null);
  };

  const rows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const rawQ = extractRaw8Digits(q);
    return allClients
      .filter(
        (c) =>
          !q ||
          c.fullName.toLowerCase().includes(q) ||
          c.phoneNumber.includes(q) ||
          (rawQ.length >= 4 && extractRaw8Digits(c.phoneNumber).includes(rawQ)) ||
          (c.payoutRank && c.payoutRank.toString() === q)
      )
      .map((client) => ({ client, l: limitsFor(client), member: statusById[client.id], status: statusById[client.id]?.paymentStatusToday }))
      .sort((a, b) => {
        if (a.l.isCycleCompleted !== b.l.isCycleCompleted) return a.l.isCycleCompleted ? 1 : -1;
        return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      });
  }, [allClients, searchQuery, limitsFor, statusById]);

  const toCollect = rows.filter((r) => !r.l.isCycleCompleted && (r.status === 'OVERDUE' || r.status === 'UNPAID_TODAY')).length;
  const handsLabel = t('{0} main{1}', handsCount, handsCount > 1 ? 's' : '');

  const renderRow = ({ item, index }: { item: (typeof rows)[number]; index: number }) => {
    const { client, l, status, member } = item;
    return (
      <View style={[styles.rowBg, index === 0 && styles.rowFirst, index === rows.length - 1 && styles.rowLast]}>
      <ListItem
        divider={index < rows.length - 1}
        onPress={() => handleSelectClient(client)}
        accessibilityLabel={t('Encaisser {0}', client.fullName)}
        leading={<Avatar rank={client.payoutRank || 1} />}
        title={client.fullName}
        subtitle={t('{0}/{1} mains{2}', l.paidHands, l.maxAllowedHands, client.paidUntilDate ? ` · au ${formatDayMonth(client.paidUntilDate)}` : '')}
        trailing={
          l.isCycleCompleted ? (
            <StatusBadge status="HAND_RECEIVED" label={t('Complet')} appearance="inline" />
          ) : status ? (
            <StatusBadge status={status} detail={member ? memberStatusDetail(member) : undefined} appearance="inline" />
          ) : null
        }
      />
      </View>
    );
  };

  const success = lastTx && selectedClient;

  return (
    <Screen scroll={false} padded={false} edges={['top', 'left', 'right']}>
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <View style={styles.flexShrink}>
            <Text variant="title" accessibilityRole="header">{t('Encaisser')}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {toCollect > 0 ? t('{0} à encaisser aujourd\'hui', toCollect) : business ? t('{0} par main', formatCurrency(business.contributionAmount)) : ' '}
            </Text>
          </View>
          <SyncBadge compact />
        </View>

        <View style={styles.searchBar}>
          <Icon name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('Nom, téléphone ou rang')}
            placeholderTextColor={theme.colors.textPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            accessibilityLabel={t('Rechercher un adhérent')}
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery('')} accessibilityRole="button" accessibilityLabel={t('Effacer la recherche')} hitSlop={12}>
              <Icon name="close" size={18} color={theme.colors.textMuted} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/scan' as any)}
              accessibilityRole="button"
              accessibilityLabel={t('Scanner la carte QR d\'un adhérent')}
              hitSlop={8}
              style={styles.scanBtn}
            >
              <Icon name="scan" size={20} color={theme.colors.primary} />
            </Pressable>
          )}
        </View>
      </View>

      {!loaded ? (
        <View style={styles.listPad}>
          <ListSkeleton hero={false} rows={6} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.client.id}
          renderItem={renderRow}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          style={styles.list}
          ListEmptyComponent={
            allClients.length === 0 ? (
              <EmptyState
                icon="users"
                title={t('Aucun adhérent')}
                message={t('Inscrivez les membres du sol pour commencer à encaisser.')}
                action={{ label: t('Nouvel adhérent'), icon: 'plus', onPress: () => router.push('/client/new' as any) }}
              />
            ) : (
              <EmptyState icon="search" title={t('Aucun résultat')} message={t('Vérifiez le nom, le numéro ou le rang saisi.')} />
            )
          }
        />
      )}

      {/* Collect sheet */}
      <BottomSheet
        visible={isSheetOpen && !!selectedClient}
        onClose={closeSheet}
        title={success ? undefined : selectedClient?.fullName}
        subtitle={
          success || !selectedClient
            ? undefined
            : t('{0} · cotisé {1}/{2}', memberHandsCount > 1 ? `${memberHandsCount} mains · rangs ${selectedClient.payoutRanks || selectedClient.payoutRank}` : `Rang ${selectedClient.payoutRank || 1}`, currentPaidHands, limits.maxAllowedHands)
        }
        footer={
          success ? (
            <View style={styles.footerRow}>
              <Button label={t('Partager le reçu')} icon="share" variant="secondary" onPress={handleShareReceipt} style={styles.flexGrow} />
              <Button label={t('Terminé')} onPress={closeSheet} style={styles.flexGrow} />
            </View>
          ) : limits.isCycleCompleted ? (
            <Button size="lg" fullWidth variant="secondary" label={t('Fermer')} onPress={closeSheet} />
          ) : (
            <Button
              size="lg"
              fullWidth
              icon="lock"
              onPress={handleOpenPinValidation}
              loading={isProcessing}
              disabled={limits.isCycleCompleted || handsCount <= 0}
              label={limits.isCycleCompleted ? t('Cycle complété') : t('Encaisser {0}', formatCurrency(totalAmount))}
            />
          )
        }
      >
        {success ? (
          <View style={styles.success} accessibilityLiveRegion="polite">
            <View style={styles.successIcon}>
              <Icon name="check" size={28} color={theme.colors.success} strokeWidth={3} />
            </View>
            <Text variant="heading" align="center" accessibilityRole="header">{t('Encaissement enregistré')}</Text>
            <AmountText amount={lastTx.amount} size="hero" align="center" />
            <Text variant="body" tone="muted" align="center">
              {selectedClient.fullName} · {lastReceipt?.handsCount}{' '}{t('main')}{(lastReceipt?.handsCount ?? 1) > 1 ? 's' : ''}{' '}
              {lastReceipt?.coverageText ?? coverageText}
            </Text>
            <Text variant="caption" tone="muted" align="center" selectable>{t('Réf. #{0}', lastTx.id.slice(0, 8))}
            </Text>
          </View>
        ) : limits.isCycleCompleted ? (
          <View style={styles.noticeRow}>
            <Icon name="check" size={20} color={theme.colors.success} />
            <Text variant="body" style={styles.flexShrink}>{t('Toutes les cotisations du cycle sont versées ({0} mains, {1}). Aucun versement supplémentaire n\'est possible.', limits.maxAllowedHands, formatCurrency(limits.maxPotAmount))}</Text>
          </View>
        ) : (
          <>
            <View style={styles.amountBlock}>
              <AmountText amount={totalAmount} size="hero" align="center" />
              <Text variant="caption" tone="muted" align="center">
                {handsLabel} × {formatCurrency(unitAmount)} {coverageText}
              </Text>
            </View>

            <View style={styles.stepperRow}>
              <Pressable
                onPress={handleDecrement}
                disabled={handsCount <= 1}
                accessibilityRole="button"
                accessibilityLabel={t('Retirer une main')}
                style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed, handsCount <= 1 && styles.stepperBtnDisabled]}
              >
                <Icon name="minus" size={22} color={handsCount <= 1 ? theme.colors.textPlaceholder : theme.colors.text} />
              </Pressable>
              <View style={styles.stepperDisplay} accessible accessibilityLabel={t('{0} sur {1} restantes', handsLabel, limits.remainingHands)}>
                <Text variant="amountLarge" align="center">
                  {handsCount}
                </Text>
                <Text variant="caption" tone="muted" align="center">{t('sur {0} restante{1}', limits.remainingHands, limits.remainingHands > 1 ? 's' : '')}
                </Text>
              </View>
              <Pressable
                onPress={handleIncrement}
                disabled={handsCount >= limits.remainingHands}
                accessibilityRole="button"
                accessibilityLabel={t('Ajouter une main')}
                style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed, handsCount >= limits.remainingHands && styles.stepperBtnDisabled]}
              >
                <Icon name="plus" size={22} color={handsCount >= limits.remainingHands ? theme.colors.textPlaceholder : theme.colors.text} />
              </Pressable>
            </View>

            {presetRounds.length > 1 ? (
              <View style={styles.presetRow}>
                {presetRounds.map((preset) => {
                  const isSelected = handsCount === preset.hands;
                  return (
                    <Pressable
                      key={preset.label}
                      onPress={() => {
                        triggerLightImpact();
                        setHandsCount(preset.hands);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${preset.label}, ${formatCurrency(preset.hands * unitAmount)}`}
                      style={({ pressed }) => [styles.preset, pressed && styles.pressed, isSelected && styles.presetSelected]}
                    >
                      <Text variant="label" style={isSelected ? styles.onPrimarySoft : undefined}>
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <ProgressBar
              value={limits.maxAllowedHands > 0 ? (currentPaidHands + handsCount) / limits.maxAllowedHands : 0}
              accessibilityLabel={t('Progression des cotisations du cycle après cet encaissement')}
            />
          </>
        )}
      </BottomSheet>

      <PinVerificationModal
        visible={isPinModalOpen}
        title={t('Confirmer l\'encaissement')}
        subtitle={t('{0} · {1} pour {2}', formatCurrency(totalAmount), handsLabel, selectedClient?.fullName ?? '')}
        onSuccess={handlePinSuccessSubmit}
        onCancel={() => {
          setIsPinModalOpen(false);
          setIsSheetOpen(true);
        }}
      />
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout, typography }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    flexGrow: { flexGrow: 1, flexBasis: 0 },
    onPrimarySoft: { color: colors.onPrimarySoft },
    pressed: { backgroundColor: colors.surfacePressed },

    top: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: layout.gutter,
      paddingTop: spacing.lg,
      gap: spacing.md,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
      minHeight: layout.touchTarget,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
    },
    searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: spacing.sm },
    scanBtn: { width: layout.touchTarget - spacing.sm, height: layout.touchTarget - spacing.sm, alignItems: 'center', justifyContent: 'center' },

    list: { flex: 1 },
    listPad: { paddingHorizontal: layout.gutter },
    listContent: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: layout.gutter,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
    },

    rowBg: { backgroundColor: colors.surface, overflow: 'hidden' },
    rowFirst: { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
    rowLast: { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },

    amountBlock: { gap: spacing.xs, alignItems: 'center' },
    stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
    stepperBtn: {
      width: layout.actionHeight,
      height: layout.actionHeight,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    stepperBtnDisabled: { opacity: 0.5 },
    stepperDisplay: { minWidth: layout.actionHeight * 2, alignItems: 'center' },

    presetRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
    preset: {
      minHeight: layout.touchTarget - spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    presetSelected: { backgroundColor: colors.primarySoft },

    noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    success: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
    successIcon: {
      width: spacing.xxxl + spacing.sm,
      height: spacing.xxxl + spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.successSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    footerRow: { flexDirection: 'row', gap: spacing.sm },
  });
