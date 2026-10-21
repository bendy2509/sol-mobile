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
  Text,
} from '@/components/ui';
import { getClientById, getAllClients } from '@/db/clientRepository';
import { createTransaction } from '@/db/transactionRepository';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { getMembersWithPaymentStatus } from '@/db/memberRepository';
import { getDatabase, getActiveCollectorId } from '@/db/sqlite';

import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { BusinessConfig, Client, MemberPaymentStatus, Transaction } from '@/types';
import { formatCurrency, formatDateShort, formatDayMonth } from '@/lib/formatters';
import { extractRaw8Digits } from '@/lib/phoneUtils';
import { triggerSuccessFeedback, triggerErrorFeedback, triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import {
  calculateCoverageDate,
  calculateContributionAmount,
  calculateCycleContributionLimits,
  calculateCycleTotalHands,
  calculateHandsCovered,
} from '@/services/financialService';
import { generateContributionReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { Theme, useTheme } from '@/theme';

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
  const [statusById, setStatusById] = useState<Record<string, MemberPaymentStatus>>({});
  const [handsCount, setHandsCount] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  /** Figures of the last collection, frozen before the member is reloaded (receipt + success state). */
  const [lastReceipt, setLastReceipt] = useState<{ handsCount: number; unitAmount: number; totalAmount: number; start: string; end: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dbTotalHands, setDbTotalHands] = useState<number>(0);

  const unitAmount = selectedClient?.dailyAmount || business?.contributionAmount || 250;
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
      setStatusById(Object.fromEntries(members.map((m) => [m.id, m.paymentStatusToday])));

      // Direct SQL SUM for guaranteed accuracy
      try {
        const db = await getDatabase();
        const collectorId = await getActiveCollectorId();
        const row = await db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(COALESCE(hands_count, 1)), 0) as total FROM clients WHERE collector_id = ?`,
          [collectorId]
        );
        const totalFromSql = Number(row?.total || 0);
        const totalFromList = calculateCycleTotalHands(list);
        setDbTotalHands(Math.max(1, totalFromList, totalFromSql));
      } catch {
        setDbTotalHands(Math.max(1, calculateCycleTotalHands(list)));
      }
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
      const unit = client.dailyAmount || business?.contributionAmount || 250;
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
    { label: memberHandsCount > 1 ? '1 tour' : '1 main', hands: memberHandsCount },
    { label: memberHandsCount > 1 ? '2 tours' : '2 mains', hands: memberHandsCount * 2 },
    { label: memberHandsCount > 1 ? '3 tours' : '3 mains', hands: memberHandsCount * 3 },
    ...(limits.remainingHands > memberHandsCount * 3 ? [{ label: 'Tout le solde', hands: limits.remainingHands }] : []),
  ].filter((p) => p.hands <= limits.remainingHands);

  const handleIncrement = () => {
    triggerLightImpact();
    if (handsCount < limits.remainingHands) setHandsCount(handsCount + 1);
  };

  const handleDecrement = () => {
    triggerLightImpact();
    if (handsCount > 1) setHandsCount(handsCount - 1);
  };

  // Coverage date calculation
  const todayStr = new Date().toISOString().split('T')[0];
  const coveragePreview = calculateCoverageDate({
    todayStr,
    handsCovered: handsCount > 0 ? handsCount : 1,
    frequency: business?.frequency || 'DAILY',
    currentPaidUntilDate: selectedClient?.paidUntilDate,
  });
  const previewStartDateStr = coveragePreview.startDate;
  const previewDateStr = coveragePreview.paidUntilDate;

  const handleOpenPinValidation = () => {
    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert('Accès en lecture seule', "L'encaissement est réservé aux gestionnaires.");
      return;
    }
    if (!selectedClient) return;
    if (limits.isCycleCompleted) {
      triggerErrorFeedback();
      Alert.alert(
        'Plafond du cycle atteint',
        `${selectedClient.fullName} a déjà complété toutes ses cotisations pour ce cycle (${currentPaidHands}/${limits.maxAllowedHands} mains, ${formatCurrency(limits.maxPotAmount)}).`
      );
      return;
    }
    if (handsCount <= 0 || totalAmount <= 0) {
      triggerErrorFeedback();
      Alert.alert('Nombre de mains invalide', 'Sélectionnez au moins 1 main.');
      return;
    }
    if (handsCount > limits.remainingHands) {
      triggerErrorFeedback();
      Alert.alert('Dépassement du plafond', `Cet adhérent ne peut plus cotiser que ${limits.remainingHands} main(s) pour ce cycle.`);
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
        note: `Encaissement de ${handsCount} main(s) de ${formatCurrency(unitAmount)} (Couvre jusqu'au ${formatDateShort(previewDateStr)})`,
      });

      triggerSuccessFeedback();
      setLastReceipt({ handsCount, unitAmount, totalAmount, start: previewStartDateStr, end: previewDateStr });
      setLastTx(tx);
      setIsSheetOpen(true);

      const updated = await getClientById(selectedClient.id);
      if (updated) setSelectedClient(updated);
      loadData();

      triggerSync().catch(() => {});
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert('Erreur', err?.message || "Échec de l'enregistrement de l'encaissement.");
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
      Alert.alert('Erreur PDF', 'Impossible de générer ou partager le document PDF.');
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
      .map((client) => ({ client, l: limitsFor(client), status: statusById[client.id] }))
      .sort((a, b) => {
        if (a.l.isCycleCompleted !== b.l.isCycleCompleted) return a.l.isCycleCompleted ? 1 : -1;
        return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      });
  }, [allClients, searchQuery, limitsFor, statusById]);

  const toCollect = rows.filter((r) => !r.l.isCycleCompleted && (r.status === 'OVERDUE' || r.status === 'UNPAID_TODAY')).length;
  const handsLabel = `${handsCount} main${handsCount > 1 ? 's' : ''}`;

  const renderRow = ({ item, index }: { item: (typeof rows)[number]; index: number }) => {
    const { client, l, status } = item;
    return (
      <View style={[styles.rowBg, index === 0 && styles.rowFirst, index === rows.length - 1 && styles.rowLast]}>
      <ListItem
        divider={index < rows.length - 1}
        onPress={() => handleSelectClient(client)}
        accessibilityLabel={`Encaisser ${client.fullName}`}
        leading={<Avatar rank={client.payoutRank || 1} />}
        title={client.fullName}
        subtitle={`${l.paidHands}/${l.maxAllowedHands} mains${client.paidUntilDate ? ` · au ${formatDayMonth(client.paidUntilDate)}` : ''}`}
        trailing={
          l.isCycleCompleted ? (
            <StatusBadge status="HAND_RECEIVED" label="Complet" appearance="inline" />
          ) : status ? (
            <StatusBadge status={status} appearance="inline" />
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
            <Text variant="title" accessibilityRole="header">
              Encaisser
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {toCollect > 0 ? `${toCollect} à encaisser aujourd'hui` : business ? `${formatCurrency(business.contributionAmount)} par main` : ' '}
            </Text>
          </View>
          <SyncBadge compact />
        </View>

        <View style={styles.searchBar}>
          <Icon name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Nom, téléphone ou rang"
            placeholderTextColor={theme.colors.textPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            accessibilityLabel="Rechercher un adhérent"
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery('')} accessibilityRole="button" accessibilityLabel="Effacer la recherche" hitSlop={12}>
              <Icon name="close" size={18} color={theme.colors.textMuted} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/scan' as any)}
              accessibilityRole="button"
              accessibilityLabel="Scanner la carte QR d'un adhérent"
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
                title="Aucun adhérent"
                message="Inscrivez les membres du sol pour commencer à encaisser."
                action={{ label: 'Nouvel adhérent', icon: 'plus', onPress: () => router.push('/client/new' as any) }}
              />
            ) : (
              <EmptyState icon="search" title="Aucun résultat" message="Vérifiez le nom, le numéro ou le rang saisi." />
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
            : `${memberHandsCount > 1 ? `${memberHandsCount} mains · rangs ${selectedClient.payoutRanks || selectedClient.payoutRank}` : `Rang ${selectedClient.payoutRank || 1}`} · cotisé ${currentPaidHands}/${limits.maxAllowedHands}`
        }
        footer={
          success ? (
            <View style={styles.footerRow}>
              <Button label="Partager le reçu" icon="share" variant="secondary" onPress={handleShareReceipt} style={styles.flexGrow} />
              <Button label="Terminé" onPress={closeSheet} style={styles.flexGrow} />
            </View>
          ) : limits.isCycleCompleted ? (
            <Button size="lg" fullWidth variant="secondary" label="Fermer" onPress={closeSheet} />
          ) : (
            <Button
              size="lg"
              fullWidth
              icon="lock"
              onPress={handleOpenPinValidation}
              loading={isProcessing}
              disabled={limits.isCycleCompleted || handsCount <= 0}
              label={limits.isCycleCompleted ? 'Cycle complété' : `Encaisser ${formatCurrency(totalAmount)}`}
            />
          )
        }
      >
        {success ? (
          <View style={styles.success} accessibilityLiveRegion="polite">
            <View style={styles.successIcon}>
              <Icon name="check" size={28} color={theme.colors.success} strokeWidth={3} />
            </View>
            <Text variant="heading" align="center" accessibilityRole="header">
              Encaissement enregistré
            </Text>
            <AmountText amount={lastTx.amount} size="hero" align="center" />
            <Text variant="body" tone="muted" align="center">
              {selectedClient.fullName} · {lastReceipt?.handsCount} main{(lastReceipt?.handsCount ?? 1) > 1 ? 's' : ''} · couvert jusqu'au{' '}
              {formatDateShort(lastReceipt?.end ?? previewDateStr)}
            </Text>
            <Text variant="caption" tone="muted" align="center" selectable>
              Réf. #{lastTx.id.slice(0, 8)}
            </Text>
          </View>
        ) : limits.isCycleCompleted ? (
          <View style={styles.noticeRow}>
            <Icon name="check" size={20} color={theme.colors.success} />
            <Text variant="body" style={styles.flexShrink}>
              Toutes les cotisations du cycle sont versées ({limits.maxAllowedHands} mains, {formatCurrency(limits.maxPotAmount)}). Aucun versement
              supplémentaire n'est possible.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.amountBlock}>
              <AmountText amount={totalAmount} size="hero" align="center" />
              <Text variant="caption" tone="muted" align="center">
                {handsLabel} × {formatCurrency(unitAmount)} · couvert jusqu'au {formatDateShort(previewDateStr)}
              </Text>
            </View>

            <View style={styles.stepperRow}>
              <Pressable
                onPress={handleDecrement}
                disabled={handsCount <= 1}
                accessibilityRole="button"
                accessibilityLabel="Retirer une main"
                style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed, handsCount <= 1 && styles.stepperBtnDisabled]}
              >
                <Icon name="minus" size={22} color={handsCount <= 1 ? theme.colors.textPlaceholder : theme.colors.text} />
              </Pressable>
              <View style={styles.stepperDisplay} accessible accessibilityLabel={`${handsLabel} sur ${limits.remainingHands} restantes`}>
                <Text variant="amountLarge" align="center">
                  {handsCount}
                </Text>
                <Text variant="caption" tone="muted" align="center">
                  sur {limits.remainingHands} restante{limits.remainingHands > 1 ? 's' : ''}
                </Text>
              </View>
              <Pressable
                onPress={handleIncrement}
                disabled={handsCount >= limits.remainingHands}
                accessibilityRole="button"
                accessibilityLabel="Ajouter une main"
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
              accessibilityLabel="Progression des cotisations du cycle après cet encaissement"
            />
          </>
        )}
      </BottomSheet>

      <PinVerificationModal
        visible={isPinModalOpen}
        title="Confirmer l'encaissement"
        subtitle={`${formatCurrency(totalAmount)} · ${handsLabel} pour ${selectedClient?.fullName ?? ''}`}
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
