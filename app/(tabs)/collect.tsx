import React, { useState, useCallback, useMemo } from 'react';
import { View, Pressable, ScrollView, StyleSheet, Alert, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { PinVerificationModal } from '@/components/PinVerificationModal';
import {
  AmountText,
  Avatar,
  BottomSheet,
  Button,
  EmptyState,
  Card,
  Chip,
  Icon,
  ListSkeleton,
  MemberRow,
  ProgressBar,
  Screen,
  ScreenHeader,
  memberStatusDetail,
  Text,
} from '@/components/ui';
import { getClientById, getAllClients } from '@/db/clientRepository';
import { createTransaction, reverseTransaction } from '@/db/transactionRepository';
import { getActiveBusinessConfig, getCycleHandsTotal } from '@/db/businessRepository';
import { getMembersWithPaymentStatus } from '@/db/memberRepository';

import { useAuth } from '@/context/AuthContext';
import { BusinessConfig, Client, Member, Transaction } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { extractRaw8Digits } from '@/lib/phoneUtils';
import { triggerSuccessFeedback, triggerErrorFeedback, triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { calculateContributionAmount, calculateCycleContributionLimits, calculateHandsCovered } from '@/services/financialService';
import { generateContributionReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';
import { localDateString } from '@/lib/dates';
import { buildCycleRounds } from '@/services/scheduleService';
import {
  COLLECT_FILTERS,
  CollectFilter,
  cycleTotalHands,
  matchesCollectFilter,
  memberPaidHands,
  memberHandsCount as handsOfMember,
  handUnitAmount,
  memberOwedHands,
  needsCollection,
  owedAmount,
  sortForCollection,
  summarizeCycleDay,
} from '@/services/memberRules';

/**
 * Encaisser, the most used screen. Each member to collect shows what they owe on a button:
 * one touch → PIN → collected, with the receipt and an « Annuler » that reverses it at once.
 * Tapping the row opens the sheet to choose another number of hands. Members up to date are
 * grouped at the bottom, folded.
 */
export default function CollectScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string }>();
  const { activeCollector } = useAuth();

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
  const [showUpToDate, setShowUpToDate] = useState(false);
  const [filter, setFilter] = useState<CollectFilter>('ALL');
  const [isUndoPinOpen, setIsUndoPinOpen] = useState(false);

  const unitAmount = handUnitAmount(business, selectedClient);
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

  const totalCycleHands = dbTotalHands || cycleTotalHands(allClients);

  const limitsFor = useCallback(
    (client: Client) => {
      const unit = handUnitAmount(business, client);
      const paidHands = memberPaidHands(client);
      const memberHands = handsOfMember(client);
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
      // Preselect what is owed up to today (late hands + today's missing hands, e.g. the second
      // hand of a partial round); a member up to date gets one full round
      const member = statusById[client.id];
      const owed = member ? memberOwedHands(member) : 0;
      const preset = owed > 0 ? owed : l.memberHands;
      setHandsCount(l.remainingHands > 0 ? Math.min(l.remainingHands, preset) : 0);
      setIsSheetOpen(true);
    },
    [limitsFor, statusById]
  );

  /** One touch: the hands owed today, straight to the PIN (the row opens the full sheet). */
  const handleQuickCollect = useCallback(
    (client: Client) => {
      triggerMediumImpact();
      const l = limitsFor(client);
      const member = statusById[client.id];
      const owed = member ? memberOwedHands(member) : 0;
      const hands = Math.min(l.remainingHands, owed > 0 ? owed : l.memberHands);
      if (hands <= 0) return handleSelectClient(client);
      setSelectedClient(client);
      setLastTx(null);
      setHandsCount(hands);
      setIsPinModalOpen(true);
    },
    [limitsFor, statusById, handleSelectClient]
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
        collectorName: activeCollector?.fullName || 'Bendy SERVILUS',
        collectorPhone: activeCollector?.phoneNumber || '',
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

  const handleUndoConfirmed = async () => {
    setIsUndoPinOpen(false);
    if (!lastTx) return;
    try {
      await reverseTransaction({ transactionId: lastTx.id, reason: t('Annulé juste après l\'encaissement') });
      triggerSuccessFeedback();
      closeSheet();
      Alert.alert(t('Encaissement annulé'), t('Une écriture d\'annulation a été ajoutée au registre.'));
      loadData();
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert(t('Erreur'), err?.message || t('Échec de l\'annulation.'));
      setIsSheetOpen(true);
    }
  };

  const rows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const rawQ = extractRaw8Digits(q);
    const matching = allClients
      .filter(
        (c) =>
          !q ||
          c.fullName.toLowerCase().includes(q) ||
          c.phoneNumber.includes(q) ||
          (rawQ.length >= 4 && extractRaw8Digits(c.phoneNumber).includes(rawQ)) ||
          (c.payoutRank && c.payoutRank.toString() === q)
      )
      .map((client) => ({ client, l: limitsFor(client), member: statusById[client.id], paymentStatusToday: statusById[client.id]?.paymentStatusToday }));
    // Same order as the home screen (memberRules): late first, then today's, then up to date
    return sortForCollection(matching.map((r) => ({ ...r, lateHands: r.member?.lateHands, missingHandsToday: r.member?.missingHandsToday })));
  }, [allClients, searchQuery, limitsFor, statusById]);

  const dueRows = rows.filter((r) => !r.l.isCycleCompleted && needsCollection(r));
  const upToDateRows = rows.filter((r) => r.l.isCycleCompleted || !needsCollection(r));

  // Filters (memberRules.matchesCollectFilter): a member whose cycle is fully paid has nothing to collect
  const inFilter = (r: (typeof rows)[number], f: CollectFilter) =>
    matchesCollectFilter({ ...r.client, paymentStatusToday: r.l.isCycleCompleted ? 'PAID_TODAY' : r.paymentStatusToday, lateHands: r.lateHands, missingHandsToday: r.missingHandsToday }, f);
  const filterLabels: Record<CollectFilter, string> = {
    ALL: t('Tous'),
    TO_COLLECT: t('À encaisser'),
    LATE: t('En retard'),
    UP_TO_DATE: t('À jour'),
    HAND_RECEIVED: t('Main reçue'),
  };
  const filteredRows = filter === 'ALL' ? rows : rows.filter((r) => inFilter(r, filter));
  const day = summarizeCycleDay(Object.values(statusById), business?.contributionAmount ?? 0);
  const handsLabel = t('{0} main{1}', handsCount, handsCount > 1 ? 's' : '');

  const renderRow = (item: (typeof rows)[number], index: number, count: number) => {
    const { client, l, member } = item;
    const owed = member ? memberOwedHands(member) : 0;
    const due = !l.isCycleCompleted && owed > 0;
    const amount = owedAmount(Math.min(owed, l.remainingHands), handUnitAmount(business, client));
    return (
      <MemberRow
        key={client.id}
        name={client.fullName}
        rank={client.payoutRank || 1}
        status={l.isCycleCompleted ? 'HAND_RECEIVED' : member?.paymentStatusToday}
        statusDetail={l.isCycleCompleted ? undefined : member ? memberStatusDetail(member) : undefined}
        meta={t('{0}/{1} mains payées', l.paidHands, l.maxAllowedHands)}
        divider={index < count - 1}
        onPress={() => handleSelectClient(client)}
        accessibilityLabel={t('Choisir le nombre de mains pour {0}', client.fullName)}
        action={
          due ? (
            <Button
              label={formatCurrency(amount)}
              onPress={() => handleQuickCollect(client)}
              accessibilityLabel={t('Encaisser {0} pour {1}', formatCurrency(amount), client.fullName)}
            />
          ) : undefined
        }
      />
    );
  };

  const success = lastTx && selectedClient;

  return (
    <Screen scroll={false} padded={false} edges={['top', 'left', 'right']}>
      <View style={styles.top}>
        <ScreenHeader
          title={t('Encaisser')}
          subtitle={
            dueRows.length > 0
              ? t('{0} à encaisser · {1} dû', dueRows.length, formatCurrency(day.owedAmount))
              : business
              ? t('{0} par main', formatCurrency(business.contributionAmount))
              : undefined
          }
        />

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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsBar} contentContainerStyle={styles.chips}>
        {COLLECT_FILTERS.map((f) => (
          <Chip
            key={f}
            label={`${filterLabels[f]} (${rows.filter((r) => inFilter(r, f)).length})`}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>

      {!loaded ? (
        <View style={styles.listPad}>
          <ListSkeleton hero={false} rows={6} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.listPad}>
          {allClients.length === 0 ? (
            <EmptyState
              icon="users"
              title={t('Aucun adhérent')}
              message={t('Inscrivez les membres du sol pour commencer à encaisser.')}
              action={{ label: t('Nouvel adhérent'), icon: 'plus', onPress: () => router.push('/client/new' as any) }}
            />
          ) : (
            <EmptyState icon="search" title={t('Aucun résultat')} message={t('Vérifiez le nom, le numéro ou le rang saisi.')} />
          )}
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {filter !== 'ALL' ? (
            // One filter: one list, in the collection order
            filteredRows.length > 0 ? (
              <Card padding="none" style={styles.listCard}>
                {filteredRows.map((r, i) => renderRow(r, i, filteredRows.length))}
              </Card>
            ) : (
              <EmptyState icon="users" title={t('Aucun adhérent')} message={t('Aucun adhérent ne correspond à ce filtre.')} />
            )
          ) : (
          <>
          {dueRows.length > 0 ? (
            <Card padding="none" style={styles.listCard}>
              {dueRows.map((r, i) => renderRow(r, i, dueRows.length))}
            </Card>
          ) : (
            <Card style={styles.allPaid}>
              <Text variant="bodyStrong" tone="success">{t('Tout le monde est à jour')}</Text>
              <Text variant="caption" tone="muted">{t('Aucune main à encaisser pour aujourd\'hui.')}</Text>
            </Card>
          )}

          {upToDateRows.length > 0 ? (
            <View style={styles.section}>
              <Pressable
                onPress={() => setShowUpToDate((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showUpToDate }}
                style={styles.groupToggle}
              >
                <Text variant="subheading" style={styles.flexShrink}>
                  {t('À jour ({0})', upToDateRows.length)}
                </Text>
                <Text variant="label" tone="primary">
                  {showUpToDate ? t('Masquer') : t('Afficher')}
                </Text>
              </Pressable>
              {showUpToDate ? (
                <Card padding="none" style={styles.listCard}>
                  {upToDateRows.map((r, i) => renderRow(r, i, upToDateRows.length))}
                </Card>
              ) : null}
            </View>
          ) : null}
          </>
          )}
        </ScrollView>
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
            <View style={styles.footerColumn}>
              <View style={styles.footerRow}>
                <Button label={t('Partager le reçu')} icon="share" variant="secondary" onPress={handleShareReceipt} style={styles.flexGrow} />
                <Button label={t('Terminé')} onPress={closeSheet} style={styles.flexGrow} />
              </View>
              <Button label={t('Annuler cet encaissement')} variant="ghost" fullWidth onPress={() => { setIsSheetOpen(false); setIsUndoPinOpen(true); }} />
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
        visible={isUndoPinOpen}
        title={t('Annuler cet encaissement')}
        subtitle={lastTx ? t('{0} pour {1}', formatCurrency(lastTx.amount), selectedClient?.fullName ?? '') : undefined}
        onSuccess={handleUndoConfirmed}
        onCancel={() => {
          setIsUndoPinOpen(false);
          setIsSheetOpen(true);
        }}
      />

      <PinVerificationModal
        visible={isPinModalOpen}
        title={t('Confirmer l\'encaissement')}
        subtitle={t('{0} · {1} pour {2}', formatCurrency(totalAmount), handsLabel, selectedClient?.fullName ?? '')}
        onSuccess={handlePinSuccessSubmit}
        onCancel={() => {
          setIsPinModalOpen(false);
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
      gap: spacing.sm,
    },
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
    chipsBar: { flexGrow: 0 },
    chips: { gap: spacing.sm, paddingHorizontal: layout.gutter, paddingTop: spacing.md, paddingBottom: spacing.xs },
    listPad: { paddingHorizontal: layout.gutter },
    listContent: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: layout.gutter,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
      gap: spacing.xl,
    },

    listCard: { overflow: 'hidden' },
    allPaid: { gap: spacing.xs },
    section: { gap: spacing.md },
    groupToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: layout.touchTarget },
    footerColumn: { gap: spacing.sm },

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
