import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Pressable, StyleSheet, Alert, Modal, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

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
  StatusBadge,
  Text,
} from '@/components/ui';
import { getClientById, getAllClients } from '@/db/clientRepository';
import { createTransaction } from '@/db/transactionRepository';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { getDatabase, getActiveCollectorId } from '@/db/sqlite';

import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { BusinessConfig, Client, Transaction } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
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
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

export default function CollectScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string }>();
  const { activeCollector, userRole } = useAuth();
  const { triggerSync } = useSync();
  const { isSmallScreen, isVerySmallScreen, isTablet, horizontalPadding, width } = useResponsive();
  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';

  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [handsCount, setHandsCount] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dbTotalHands, setDbTotalHands] = useState<number>(0);

  const unitAmount = selectedClient?.dailyAmount || business?.contributionAmount || 250;
  const totalAmount = calculateContributionAmount(handsCount, unitAmount);

  const loadData = useCallback(async () => {

    try {
      const [biz, list] = await Promise.all([
        getActiveBusinessConfig(),
        getAllClients(),
      ]);
      setBusiness(biz);
      setAllClients(list);

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

      const targetId = params.clientId || selectedClient?.id;
      if (targetId) {
        const found = list.find((c) => c.id === targetId);
        if (found) {
          setSelectedClient(found);
        } else {
          setSelectedClient(list.length > 0 ? list[0] : null);
        }
      } else if (list.length > 0 && !selectedClient) {
        setSelectedClient(list[0]);
      } else if (list.length === 0) {
        setSelectedClient(null);
      }
    } catch (err) {
      console.warn('Error loading collect data:', err);
    }
  }, [params.clientId, selectedClient?.id]);


  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const totalCycleHands = dbTotalHands || calculateCycleTotalHands(allClients) || (business?.totalSlots || 10);
  const clientUnitAmount = selectedClient?.dailyAmount || business?.contributionAmount || 250;
  const clientBalance = Number(selectedClient?.currentBalance || 0);
  const clientTotalPaid = Number(selectedClient?.totalPaidAmount || clientBalance);
  const currentPaidHands = Math.max(
    Number(selectedClient?.paidHandsCount || 0),
    calculateHandsCovered(clientBalance, clientUnitAmount),
    calculateHandsCovered(clientTotalPaid, clientUnitAmount)
  );
  const memberHandsCount = Math.max(1, selectedClient?.handsCount || 1);
  const limits = calculateCycleContributionLimits({
    currentPaidHands,
    totalCycleHands,
    memberHandsCount,
    unitAmount: clientUnitAmount,
  });

  const presetRounds = [
    { label: memberHandsCount > 1 ? `1 Tour (${memberHandsCount}m)` : '1 Main', hands: memberHandsCount },
    { label: memberHandsCount > 1 ? `2 Tours (${memberHandsCount * 2}m)` : '2 Mains', hands: memberHandsCount * 2 },
    { label: memberHandsCount > 1 ? `3 Tours (${memberHandsCount * 3}m)` : '3 Mains', hands: memberHandsCount * 3 },
    ...(limits.remainingHands > memberHandsCount * 3
      ? [{ label: 'Solde total', hands: limits.remainingHands }]
      : []),
  ];

  const handleSelectClient = (client: Client) => {
    triggerLightImpact();
    setSelectedClient(client);
    const clientMemberHands = Math.max(1, client.handsCount || 1);
    const clientUnit = client.dailyAmount || unitAmount || 250;
    const clientBal = Number(client.currentBalance || 0);
    const clientTot = Number(client.totalPaidAmount || clientBal);
    const clientPaid = Math.max(
      Number(client.paidHandsCount || 0),
      calculateHandsCovered(clientBal, clientUnit),
      calculateHandsCovered(clientTot, clientUnit)
    );
    const clientLimits = calculateCycleContributionLimits({
      currentPaidHands: clientPaid,
      totalCycleHands,
      memberHandsCount: clientMemberHands,
      unitAmount: clientUnit,
    });
    setHandsCount(clientLimits.remainingHands > 0 ? (clientMemberHands > 1 ? Math.min(clientLimits.remainingHands, clientMemberHands) : 1) : 0);
    setIsClientModalOpen(false);
    setSearchQuery('');
  };

  const handleSelectHandsCount = (count: number) => {
    triggerLightImpact();
    const clamped = Math.min(limits.remainingHands, Math.max(1, count));
    setHandsCount(clamped);
  };

  const handleIncrement = () => {
    triggerLightImpact();
    if (handsCount < limits.remainingHands) {
      setHandsCount(handsCount + 1);
    }
  };

  const handleDecrement = () => {
    triggerLightImpact();
    if (handsCount > 1) {
      setHandsCount(handsCount - 1);
    }
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
      Alert.alert('Accès Lecture Seule', "L'encaissement est réservé aux gestionnaires.");
      return;
    }
    if (!selectedClient) {
      triggerErrorFeedback();
      Alert.alert('Aucun adhérent', 'Veuillez sélectionner un enfant adhérent.');
      return;
    }
    if (limits.isCycleCompleted) {
      triggerErrorFeedback();
      Alert.alert(
        'Plafond du cycle atteint',
        `${selectedClient.fullName} a déjà complété toutes ses cotisations pour ce cycle (${currentPaidHands}/${limits.maxAllowedHands} mains - ${formatCurrency(limits.maxPotAmount)}).`
      );
      return;
    }
    if (handsCount <= 0 || totalAmount <= 0) {
      triggerErrorFeedback();
      Alert.alert('Nombre de mains invalide', 'Veuillez sélectionner au moins 1 main.');
      return;
    }
    if (handsCount > limits.remainingHands) {
      triggerErrorFeedback();
      Alert.alert(
        'Dépassement du plafond',
        `Cet adhérent ne peut cotiser que ${limits.remainingHands} main(s) restante(s) maximum pour ce cycle.`
      );
      return;
    }
    triggerMediumImpact();
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
      setLastTx(tx);
      setIsReceiptOpen(true);

      const updated = await getClientById(selectedClient.id);
      if (updated) setSelectedClient(updated);

      triggerSync().catch(() => {});
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert('Erreur', err?.message || "Échec de l'enregistrement de l'encaissement.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShareReceipt = async () => {
    if (!lastTx || !selectedClient) return;
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
        unitAmount,
        handsCount,
        totalAmount,
        coverageStartDate: previewStartDateStr,
        coverageEndDate: previewDateStr,
        createdAt: lastTx.createdAtLocal,
      });

      await sharePdfFile(pdfUri, `Recu_SOL_${selectedClient.fullName.replace(/\s+/g, '_')}.pdf`);
    } catch (err: any) {
      Alert.alert('Erreur PDF', 'Impossible de générer ou partager le document PDF.');
    }
  };

  // Filter clients for modal search
  const filteredClients = allClients.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const rawQ = extractRaw8Digits(q);
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.phoneNumber.includes(q) ||
      (rawQ.length >= 4 && extractRaw8Digits(c.phoneNumber).includes(rawQ)) ||
      (c.payoutRank && c.payoutRank.toString() === q)
    );
  });

  const handsLabel = `${handsCount} main${handsCount > 1 ? 's' : ''}`;
  const progressValue = limits.maxAllowedHands > 0 ? currentPaidHands / limits.maxAllowedHands : 0;

  return (
    <Screen
      edges={['top', 'left', 'right']}
      header={
        <Header
          title="Encaissement"
          subtitle={business ? `${business.name} • ${formatCurrency(unitAmount)}/main` : 'Collecte SOL'}
        />
      }
      footerSafeArea={false}
      footer={
        <Button
          size="lg"
          fullWidth
          icon="cash"
          onPress={handleOpenPinValidation}
          loading={isProcessing}
          disabled={limits.isCycleCompleted || !selectedClient}
          label={
            limits.isCycleCompleted
              ? 'Plafond du cycle atteint'
              : isProcessing
              ? 'Traitement en cours…'
              : `Encaisser ${formatCurrency(totalAmount)} · ${handsLabel}`
          }
        />
      }
    >
      {/* Selected adherent */}
      {selectedClient ? (
        <Card onPress={() => setIsClientModalOpen(true)} accessibilityLabel={`Adhérent : ${selectedClient.fullName}. Changer d'adhérent`}>
          <View style={styles.clientRow}>
            <Avatar name={selectedClient.fullName} size="lg" />
            <View style={styles.clientInfo}>
              <Text variant="heading" numberOfLines={2}>
                {selectedClient.fullName}
              </Text>
              <Text variant="caption" tone="muted" selectable>
                {selectedClient.phoneNumber}
              </Text>
            </View>
            <View style={styles.changeLink}>
              <Icon name="search" size={16} color={theme.colors.primary} />
              <Text variant="label" tone="primary">
                Changer
              </Text>
            </View>
          </View>

          <View style={styles.clientMetaRow}>
            <View style={styles.metaItem}>
              <Icon name="payout" size={16} color={theme.colors.textMuted} />
              <Text variant="label" tone="muted">
                {selectedClient.handsCount && selectedClient.handsCount > 1
                  ? `${selectedClient.handsCount} mains · rangs ${selectedClient.payoutRanks || selectedClient.payoutRank}`
                  : `Main #${selectedClient.payoutRank || 1}`}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Text variant="label" tone="muted">
                Solde
              </Text>
              <AmountText amount={Number(selectedClient.currentBalance || 0)} size="small" />
            </View>
          </View>

          <View style={styles.progressBlock}>
            <View style={styles.progressHeader}>
              <Text variant="label">
                Cotisé : {currentPaidHands} / {limits.maxAllowedHands} mains
              </Text>
              <Text variant="label" tone={limits.remainingHands === 0 ? 'success' : 'warning'}>
                {limits.remainingHands === 0 ? 'Complété' : `Reste ${limits.remainingHands} main(s)`}
              </Text>
            </View>
            <ProgressBar
              value={progressValue}
              tone={limits.isCycleCompleted ? 'success' : 'primary'}
              accessibilityLabel="Progression des cotisations du cycle"
            />
          </View>
        </Card>
      ) : (
        <Card padding="none">
          <EmptyState
            icon="user"
            title="Aucun adhérent sélectionné"
            message="Choisissez l'enfant qui verse sa cotisation."
            action={{ label: 'Choisir un adhérent', icon: 'search', onPress: () => setIsClientModalOpen(true) }}
          />
        </Card>
      )}

      {/* Amount to collect: the hero of the screen */}
      <Card tone="hero" padding="lg">
        <Text variant="label" tone="onHeroMuted">
          Montant à encaisser
        </Text>
        <AmountText amount={totalAmount} size="hero" tone="onHero" />
        <Text variant="body" tone="onHeroMuted">
          {handsLabel} × {formatCurrency(unitAmount)}
        </Text>
        {memberHandsCount > 1 && (
          <Text variant="caption" tone="onHeroMuted">
            Soit {Math.floor(handsCount / memberHandsCount)} tour{Math.floor(handsCount / memberHandsCount) > 1 ? 's' : ''}
            {handsCount % memberHandsCount > 0 ? ` + ${handsCount % memberHandsCount} main(s)` : ''} pour {selectedClient?.fullName} ({memberHandsCount} mains/tour)
          </Text>
        )}
        {!limits.isCycleCompleted && (
          <View style={styles.coverageRow}>
            <Icon name="calendar" size={16} color={theme.colors.onHero} />
            <Text variant="label" tone="onHero" style={styles.flexShrink}>
              Couvre jusqu'au {formatDateShort(previewDateStr)} · {limits.remainingHands - handsCount} restante(s) après
            </Text>
          </View>
        )}
      </Card>

      {/* Hands selector */}
      <Card>
        <View style={styles.handsHeader}>
          <Text variant="subheading">Nombre de mains</Text>
          <Text variant="label" tone={limits.isCycleCompleted ? 'success' : 'muted'}>
            {limits.isCycleCompleted
              ? 'Cycle complété'
              : `${handsLabel} sur ${limits.remainingHands} restante${limits.remainingHands > 1 ? 's' : ''}`}
          </Text>
        </View>

        <View style={styles.stepperRow}>
          <Pressable
            onPress={handleDecrement}
            disabled={handsCount <= 1 || limits.isCycleCompleted}
            accessibilityRole="button"
            accessibilityLabel="Retirer une main"
            style={({ pressed }) => [
              styles.stepperBtn,
              pressed && styles.stepperBtnPressed,
              (handsCount <= 1 || limits.isCycleCompleted) && styles.stepperBtnDisabled,
            ]}
          >
            <Icon name="minus" size={24} color={handsCount <= 1 || limits.isCycleCompleted ? theme.colors.textPlaceholder : theme.colors.text} />
          </Pressable>

          <View style={styles.stepperDisplay} accessible accessibilityLabel={`${handsLabel} à payer`}>
            <Text variant="amountLarge" align="center">
              {handsCount}
            </Text>
            <Text variant="caption" tone="muted" align="center">
              main{handsCount > 1 ? 's' : ''}
            </Text>
          </View>

          <Pressable
            onPress={handleIncrement}
            disabled={handsCount >= limits.remainingHands || limits.isCycleCompleted}
            accessibilityRole="button"
            accessibilityLabel="Ajouter une main"
            style={({ pressed }) => [
              styles.stepperBtn,
              pressed && styles.stepperBtnPressed,
              (handsCount >= limits.remainingHands || limits.isCycleCompleted) && styles.stepperBtnDisabled,
            ]}
          >
            <Icon
              name="plus"
              size={24}
              color={handsCount >= limits.remainingHands || limits.isCycleCompleted ? theme.colors.textPlaceholder : theme.colors.text}
            />
          </Pressable>
        </View>

        <View style={styles.presetGrid}>
          {presetRounds.map((preset) => {
            const isExceeding = preset.hands > limits.remainingHands;
            const isSelected = handsCount === preset.hands && !isExceeding;
            const calcAmount = preset.hands * unitAmount;

            return (
              <Pressable
                key={preset.label}
                onPress={() => !isExceeding && handleSelectHandsCount(preset.hands)}
                disabled={isExceeding || limits.isCycleCompleted}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: isExceeding || limits.isCycleCompleted }}
                style={({ pressed }) => [
                  styles.presetCard,
                  isSmallScreen && styles.presetCardSmall,
                  pressed && !isSelected && styles.presetCardPressed,
                  isSelected && styles.presetCardSelected,
                  isExceeding && styles.presetCardDisabled,
                ]}
              >
                <Text
                  variant="label"
                  align="center"
                  style={isSelected ? styles.onPrimary : isExceeding ? styles.textDisabled : undefined}
                >
                  {preset.label}
                </Text>
                {isExceeding ? (
                  <View style={styles.presetLimitRow}>
                    <Icon name="lock" size={14} color={theme.colors.textMuted} />
                    <Text variant="caption" tone="muted">
                      Max : {limits.remainingHands}
                    </Text>
                  </View>
                ) : (
                  <Text variant="amountSmall" align="center" style={isSelected ? styles.onPrimary : styles.textMuted}>
                    {formatCurrency(calcAmount)}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </Card>

      {limits.isCycleCompleted && (
        <Card tone="success">
          <View style={styles.noticeRow}>
            <Icon name="check" size={20} color={theme.colors.success} />
            <Text variant="body" tone="success" style={styles.flexShrink}>
              Cycle complété : cet adhérent a cotisé la totalité de ses {limits.maxAllowedHands} mains ({formatCurrency(limits.maxPotAmount)}). Aucun
              versement supplémentaire n'est autorisé.
            </Text>
          </View>
        </Card>
      )}

      {/* Select adherent modal */}
      <Modal
        visible={isClientModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsClientModalOpen(false)}
      >
        <SafeAreaView style={styles.modalSafeContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.flexShrink}>
              <Text variant="heading" accessibilityRole="header">
                Choisir un adhérent
              </Text>
              <Text variant="caption" tone="muted">
                {allClients.length} enfants inscrits dans ce carnet
              </Text>
            </View>
            <Pressable
              onPress={() => setIsClientModalOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={({ pressed }) => [styles.iconBtn, pressed && styles.stepperBtnPressed]}
            >
              <Icon name="close" size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.searchBar}>
            <Icon name="search" size={18} color={theme.colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Nom, téléphone ou n° de rang"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              accessibilityLabel="Rechercher un adhérent"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} accessibilityRole="button" accessibilityLabel="Effacer la recherche" hitSlop={12}>
                <Icon name="close" size={18} color={theme.colors.textMuted} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={filteredClients}
            keyExtractor={(item) => item.id}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            keyboardShouldPersistTaps="handled"
            style={styles.modalList}
            contentContainerStyle={styles.modalListContent}
            renderItem={({ item, index }) => {
              const isSelected = selectedClient?.id === item.id;
              const itemHandsCount = Math.max(1, item.handsCount || 1);
              const itemUnit = item.dailyAmount || unitAmount || 250;
              const itemBalance = Number(item.currentBalance || 0);
              const itemTotalPaid = Number(item.totalPaidAmount || itemBalance);
              const itemPaidHands = Math.max(
                Number(item.paidHandsCount || 0),
                calculateHandsCovered(itemBalance, itemUnit),
                calculateHandsCovered(itemTotalPaid, itemUnit)
              );
              const itemLimits = calculateCycleContributionLimits({
                currentPaidHands: itemPaidHands,
                totalCycleHands,
                memberHandsCount: itemHandsCount,
                unitAmount: itemUnit,
              });
              const itemPct = Math.min(100, Math.round((itemPaidHands / itemLimits.maxAllowedHands) * 100));

              return (
                <ListItem
                  selected={isSelected}
                  divider={index < filteredClients.length - 1}
                  onPress={() => handleSelectClient(item)}
                  leading={<Avatar rank={item.payoutRank || 1} highlighted={isSelected} />}
                  title={item.fullName}
                  subtitle={`${item.phoneNumber} · solde ${formatCurrency(item.currentBalance)}${
                    item.paidUntilDate ? ` · couvert ${formatDateShort(item.paidUntilDate)}` : ''
                  }`}
                  meta={
                    <View style={styles.itemProgress}>
                      {itemLimits.isCycleCompleted ? (
                        <StatusBadge status="PAID_TODAY" label="Cotisations complètes" appearance="inline" />
                      ) : (
                        <Text variant="caption" tone="muted">
                          Cotisé {itemPaidHands}/{itemLimits.maxAllowedHands} · reste {itemLimits.remainingHands} main(s) · {itemPct} %
                        </Text>
                      )}
                      <ProgressBar value={itemPct / 100} size="sm" tone={itemLimits.isCycleCompleted ? 'success' : 'primary'} />
                    </View>
                  }
                  trailing={
                    isSelected ? (
                      <View style={styles.selectedCheck}>
                        <Icon name="check" size={16} color={theme.colors.onPrimary} strokeWidth={3} />
                      </View>
                    ) : (
                      <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
                    )
                  }
                />
              );
            }}
            ListEmptyComponent={
              <EmptyState
                icon="search"
                title="Aucun adhérent trouvé"
                message="Vérifiez le nom, le numéro de téléphone ou le rang saisi."
              />
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Universal 4-Digit PIN Security Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Validation de l'Encaissement"
        subtitle={`Saisissez votre code PIN gestionnaire pour confirmer l'encaissement de ${formatCurrency(totalAmount)} (${handsCount} main(s)) pour ${selectedClient?.fullName}.`}
        onSuccess={handlePinSuccessSubmit}
        onCancel={() => setIsPinModalOpen(false)}
      />

      {/* Digital receipt */}
      <Modal visible={isReceiptOpen} transparent animationType="fade" onRequestClose={() => setIsReceiptOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.receiptCard, { maxWidth: Math.min(420, width - theme.spacing.xxl) }]}>
            <Pressable
              onPress={() => setIsReceiptOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={({ pressed }) => [styles.iconBtn, styles.receiptClose, pressed && styles.stepperBtnPressed]}
            >
              <Icon name="close" size={22} color={theme.colors.textMuted} />
            </Pressable>

            <View style={styles.receiptHeader}>
              <View style={styles.receiptIcon}>
                <Icon name="check" size={32} color={theme.colors.success} strokeWidth={3} />
              </View>
              <Text variant="title" tone="success" align="center" accessibilityRole="header">
                Encaissement réussi
              </Text>
              <Text variant="caption" tone="muted" align="center">
                Reçu numérique certifié
              </Text>
              <AmountText amount={totalAmount} size="large" align="center" />
            </View>

            <View style={styles.receiptBody}>
              <View style={styles.receiptRow}>
                <Text variant="caption" tone="muted">
                  Adhérent
                </Text>
                <Text variant="bodyStrong" style={styles.receiptValue}>
                  {selectedClient?.fullName}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" tone="muted">
                  Téléphone
                </Text>
                <Text variant="body" selectable style={styles.receiptValue}>
                  {selectedClient?.phoneNumber}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" tone="muted">
                  Mains payées
                </Text>
                <Text variant="bodyStrong" style={styles.receiptValue}>
                  {handsCount} main(s)
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" tone="muted">
                  Période couverte
                </Text>
                <Text variant="bodyStrong" tone="success" style={styles.receiptValue}>
                  Jusqu'au {formatDateShort(previewDateStr)}
                </Text>
              </View>
              {lastTx && (
                <View style={styles.receiptRow}>
                  <Text variant="caption" tone="muted">
                    Réf. opération
                  </Text>
                  <Text variant="label" tone="muted" selectable style={styles.receiptValue}>
                    #{lastTx.id.slice(0, 8)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.receiptActions}>
              <Button label="Partager / Imprimer" icon="printer" variant="secondary" onPress={handleShareReceipt} style={styles.flexGrow} />
              <Button
                label="Fermer"
                onPress={() => {
                  setIsReceiptOpen(false);
                  router.navigate('/(tabs)' as any);
                }}
                style={styles.flexGrow}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout, typography }: Theme) =>
  StyleSheet.create({
    flexShrink: { flexShrink: 1 },
    flexGrow: { flexGrow: 1, flexBasis: 0 },
    onPrimary: { color: colors.onPrimary },
    textMuted: { color: colors.textMuted },
    textDisabled: { color: colors.textMuted },

    clientRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    clientInfo: { flex: 1, minWidth: 0, gap: spacing.xs },
    changeLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: layout.touchTarget },
    clientMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    progressBlock: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      gap: spacing.sm,
    },
    progressHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },

    coverageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.heroTrack,
    },

    handsHeader: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xl,
      marginVertical: spacing.lg,
    },
    stepperBtn: {
      width: layout.actionHeight,
      height: layout.actionHeight,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    stepperBtnPressed: { backgroundColor: colors.surfacePressed },
    stepperBtnDisabled: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    stepperDisplay: { minWidth: layout.actionHeight + spacing.lg, alignItems: 'center' },

    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    presetCard: {
      flexBasis: '31%',
      flexGrow: 1,
      minHeight: layout.actionHeight + spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    presetCardSmall: { flexBasis: '48%' },
    presetCardPressed: { backgroundColor: colors.surfacePressed },
    presetCardSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    presetCardDisabled: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderStyle: 'dashed' },
    presetLimitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

    noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },

    modalSafeContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: layout.gutter,
      paddingVertical: spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    iconBtn: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      margin: layout.gutter,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      minHeight: layout.touchTarget,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: spacing.sm },
    modalList: { flex: 1 },
    modalListContent: {
      marginHorizontal: layout.gutter,
      marginBottom: spacing.xxl,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    itemProgress: { gap: spacing.xs },
    selectedCheck: {
      width: spacing.xl,
      height: spacing.xl,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: layout.gutter,
    },
    receiptCard: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      padding: spacing.xl,
      gap: spacing.lg,
    },
    receiptClose: { position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1 },
    receiptHeader: { alignItems: 'center', gap: spacing.xs },
    receiptIcon: {
      width: spacing.xxxl + spacing.lg,
      height: spacing.xxxl + spacing.lg,
      borderRadius: radius.pill,
      backgroundColor: colors.successSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    receiptBody: {
      gap: spacing.sm,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md },
    receiptValue: { flexShrink: 1, textAlign: 'right' },
    receiptActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  });
