import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  FlatList,
  TextInput,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Header } from '@/components/Header';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { getClientById, getAllClients } from '@/db/clientRepository';
import { createTransaction } from '@/db/transactionRepository';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { BusinessConfig, Client, Transaction } from '@/types';
import { formatCurrency, formatDate, formatDateShort, getInitials } from '@/lib/formatters';
import { arePhoneNumbersEqual, extractRaw8Digits, normalizePhoneNumber } from '@/lib/phoneUtils';
import { triggerSuccessFeedback, triggerErrorFeedback, triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';
import {
  calculateCoverageDate,
  calculateContributionAmount,
  calculateCycleContributionLimits,
  calculateCycleTotalHands,
} from '@/services/financialService';
import { generateContributionReceiptPdf, sharePdfFile } from '@/services/pdfService';

export default function CollectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string }>();
  const { activeCollector, userRole } = useAuth();
  const { triggerSync } = useSync();
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

  const unitAmount = selectedClient?.dailyAmount || business?.contributionAmount || 250;
  const totalAmount = calculateContributionAmount(handsCount, unitAmount);

  useEffect(() => {
    async function init() {
      const [biz, list] = await Promise.all([
        getActiveBusinessConfig(),
        getAllClients(),
      ]);
      setBusiness(biz);
      setAllClients(list);

      if (params.clientId) {
        const found = await getClientById(params.clientId);
        if (found) {
          setSelectedClient(found);
        }
      } else if (list.length > 0) {
        setSelectedClient(list[0]);
      }
    }
    init();
  }, [params.clientId]);

  const totalCycleHands = calculateCycleTotalHands(allClients) || (business?.totalSlots || 10);
  const currentPaidHands = selectedClient?.paidHandsCount || 0;
  const memberHandsCount = Math.max(1, selectedClient?.handsCount || 1);
  const limits = calculateCycleContributionLimits({
    currentPaidHands,
    totalCycleHands,
    memberHandsCount,
    unitAmount,
  });

  const presetHands = memberHandsCount > 1
    ? [1, 2, memberHandsCount, memberHandsCount * 2]
    : [1, 2, 3, 5];

  const handleSelectClient = (client: Client) => {
    triggerLightImpact();
    setSelectedClient(client);
    const clientMemberHands = Math.max(1, client.handsCount || 1);
    const clientLimits = calculateCycleContributionLimits({
      currentPaidHands: client.paidHandsCount || 0,
      totalCycleHands,
      memberHandsCount: clientMemberHands,
      unitAmount: client.dailyAmount || unitAmount,
    });
    setHandsCount(clientLimits.remainingHands > 0 ? (clientMemberHands > 1 ? clientMemberHands : 1) : 0);
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

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Encaissement"
        subtitle={business ? `${business.name} • ${formatCurrency(unitAmount)}/main` : 'Collecte SOL'}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Info Banner */}
        {business && (
          <View style={styles.businessBanner}>
            <View style={styles.businessBannerLeft}>
              <View style={styles.businessIconCircle}>
                <Icon name="sol" size={16} color={SOL_COLORS.primary} />
              </View>
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.businessBannerName}>{business.name}</Text>
                <Text style={styles.businessBannerRate}>
                  Valeur par main : <Text style={styles.businessBannerRateBold}>{formatCurrency(unitAmount)}</Text>
                </Text>
              </View>
            </View>

            <View style={styles.totalSlotsBadge}>
              <Text style={styles.totalSlotsBadgeText}>{allClients.length} inscrits</Text>
            </View>
          </View>
        )}

        {/* Selected Adherent Card */}
        <View style={styles.clientHeroCard}>
          <View style={styles.clientHeroHeader}>
            <Text style={styles.sectionLabel}>ADHÉRENT EN COURS D'ENCAISSEMENT</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setIsClientModalOpen(true)}
              style={styles.changeClientBtn}
            >
              <Icon name="search" size={13} color={SOL_COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={styles.changeClientBtnText}>Changer</Text>
            </TouchableOpacity>
          </View>

          {selectedClient ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsClientModalOpen(true)}
              style={styles.clientProfileBox}
            >
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{getInitials(selectedClient.fullName)}</Text>
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.clientName}>{selectedClient.fullName}</Text>
                <Text style={styles.clientPhone}>{selectedClient.phoneNumber}</Text>

                <View style={styles.clientBadgesRow}>
                  {selectedClient.handsCount && selectedClient.handsCount > 1 ? (
                    <View style={styles.multiHandsBadge}>
                      <Icon name="crown" size={11} color="#D97706" style={{ marginRight: 4 }} />
                      <Text style={styles.multiHandsBadgeText}>{selectedClient.handsCount} mains (#{selectedClient.payoutRanks || selectedClient.payoutRank})</Text>
                    </View>
                  ) : (
                    <View style={styles.rankPill}>
                      <Icon name="crown" size={11} color="#1D4ED8" style={{ marginRight: 3 }} />
                      <Text style={styles.rankPillText}>Main #{selectedClient.payoutRank || 1}</Text>
                    </View>
                  )}

                  <View style={styles.balancePill}>
                    <Text style={styles.balancePillText}>
                      Solde : {formatCurrency(selectedClient.currentBalance)}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsClientModalOpen(true)}
              style={styles.emptyClientSelectBox}
            >
              <Icon name="user" size={24} color="#64748B" />
              <Text style={styles.emptyClientSelectText}>Sélectionner un enfant adhérent</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Hands Multiplier Selector (Konbyen Men) */}
        <View style={styles.handsSectionCard}>
          <View style={styles.handsSectionHeader}>
            <Text style={styles.sectionLabel}>NOMBRE DE MAIN(S) À PAYER</Text>
            <Text style={styles.handsCountLiveBadge}>
              {handsCount} main{handsCount > 1 ? 's' : ''} sélectionnée{handsCount > 1 ? 's' : ''}
            </Text>
          </View>

          {/* Stepper Control */}
          <View style={styles.stepperRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleDecrement}
              style={[styles.stepperBtn, handsCount <= 1 && styles.stepperBtnDisabled]}
              disabled={handsCount <= 1}
            >
              <Text style={styles.stepperBtnSymbol}>−</Text>
            </TouchableOpacity>

            <View style={styles.stepperDisplay}>
              <Text style={styles.stepperValueText}>{handsCount}</Text>
              <Text style={styles.stepperSubText}>main{handsCount > 1 ? 's' : ''}</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleIncrement}
              style={styles.stepperBtn}
            >
              <Text style={styles.stepperBtnSymbol}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Preset Buttons Grid */}
          <View style={styles.presetGrid}>
            {presetHands.map((num) => {
              const isSelected = handsCount === num;
              const calcAmount = num * unitAmount;

              return (
                <TouchableOpacity
                  key={num}
                  activeOpacity={0.7}
                  onPress={() => handleSelectHandsCount(num)}
                  style={[
                    styles.presetCard,
                    isSelected && styles.presetCardSelected,
                  ]}
                >
                  <Text style={[styles.presetCardHands, isSelected && styles.presetCardHandsSelected]}>
                    {num} Main{num > 1 ? 's' : ''}
                  </Text>
                  <Text style={[styles.presetCardAmount, isSelected && styles.presetCardAmountSelected]}>
                    {formatCurrency(calcAmount)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Calculated Total Hero Display Card */}
        <View style={styles.amountDisplayCard}>
          <Text style={styles.amountDisplayLabel}>MONTANT TOTAL CALCULÉ</Text>
          <Text style={styles.totalAmountValue}>{formatCurrency(totalAmount)}</Text>

          <View style={styles.formulaRow}>
            <Text style={styles.formulaText}>
              <Text style={styles.formulaBold}>{handsCount} main{handsCount > 1 ? 's' : ''}</Text> × {formatCurrency(unitAmount)} = {formatCurrency(totalAmount)}
            </Text>
          </View>

          {/* Coverage Preview Pill */}
          <View style={styles.coverageBadge}>
            <Icon name="calendar" size={14} color="#065F46" style={{ marginRight: 6 }} />
            <Text style={styles.coverageBadgeText}>
              {limits.isCycleCompleted
                ? `Plafond atteint (${currentPaidHands}/${limits.maxAllowedHands} mains cotisées)`
                : `Avance : Couvre jusqu'au ${formatDateShort(previewDateStr)}`}
            </Text>
          </View>
        </View>

        {limits.isCycleCompleted && (
          <View style={styles.cycleCompletedBanner}>
            <Icon name="crown" size={16} color="#059669" style={{ marginRight: 8 }} />
            <Text style={styles.cycleCompletedText}>
              Cycle complété : Cet adhérent a cotisé la totalité des {limits.maxAllowedHands} mains ({formatCurrency(limits.maxPotAmount)}). Aucun versement supplémentaire n'est requis.
            </Text>
          </View>
        )}

        {/* Main Action Button */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleOpenPinValidation}
          disabled={isProcessing || limits.isCycleCompleted}
          style={[styles.submitBtn, limits.isCycleCompleted && styles.submitBtnDisabled]}
        >
          <Icon name="shield" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.submitBtnText}>
            {limits.isCycleCompleted
              ? 'Cycle Complété (Plafond Atteint)'
              : isProcessing
              ? 'Traitement en cours...'
              : `Valider l'Encaissement (${formatCurrency(totalAmount)})`}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Select Adherent Modal */}
      <Modal
        visible={isClientModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsClientModalOpen(false)}
      >
        <SafeAreaView style={styles.modalSafeContainer}>
          {/* Modal Header */}
          <View style={styles.modalClientHeader}>
            <View>
              <Text style={styles.modalClientTitle}>Choisir un Adhérent</Text>
              <Text style={styles.modalClientSub}>{allClients.length} enfants enregistrés dans ce carnet</Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsClientModalOpen(false)}
              style={styles.modalCloseBtn}
            >
              <Icon name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={styles.modalSearchBar}>
            <Icon name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Rechercher par nom, téléphone (+509...), # rang..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Icon name="close" size={16} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          {/* Adherent List */}
          <FlatList
            data={filteredClients}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            renderItem={({ item }) => {
              const isSelected = selectedClient?.id === item.id;
              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => handleSelectClient(item)}
                  style={[
                    styles.clientOptionCard,
                    isSelected && styles.clientOptionCardActive,
                  ]}
                >
                  <View style={styles.clientOptionLeft}>
                    <View style={styles.rankCircle}>
                      <Text style={styles.rankText}>#{item.payoutRank || 1}</Text>
                    </View>

                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={styles.clientOptionName}>{item.fullName}</Text>
                      <Text style={styles.clientOptionPhone}>{item.phoneNumber}</Text>

                      <View style={styles.clientOptionSubRow}>
                        <Text style={styles.clientOptionBalance}>
                          Solde : {formatCurrency(item.currentBalance)}
                        </Text>
                        {item.paidUntilDate && (
                          <Text style={styles.clientOptionCovered}>
                            • Couvert : {formatDateShort(item.paidUntilDate)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  <View style={styles.clientOptionRight}>
                    {isSelected ? (
                      <View style={styles.selectedCheckCircle}>
                        <Icon name="check" size={12} color="#FFFFFF" />
                      </View>
                    ) : (
                      <Icon name="arrow-right" size={14} color="#94A3B8" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptySearchContainer}>
                <Icon name="user" size={32} color="#94A3B8" />
                <Text style={styles.emptySearchText}>Aucun adhérent correspondant à votre recherche.</Text>
              </View>
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

      {/* Digital Receipt Modal */}
      <Modal
        visible={isReceiptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsReceiptOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.receiptCard}>
            <View style={styles.receiptHeader}>
              <View style={styles.receiptIconCircle}>
                <Icon name="check" size={28} color="#FFFFFF" />
              </View>
              <Text style={styles.receiptTitle}>ENCAISSEMENT RÉUSSI !</Text>
              <Text style={styles.receiptSub}>Récépissé Numérique Certifié</Text>
            </View>

            <View style={styles.receiptDivider} />

            <View style={styles.receiptBody}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Adhérent :</Text>
                <Text style={styles.receiptValueBold}>{selectedClient?.fullName}</Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Téléphone :</Text>
                <Text style={styles.receiptValue}>{selectedClient?.phoneNumber}</Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Mains payées :</Text>
                <Text style={styles.receiptValueBold}>{handsCount} main(s)</Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Montant Total :</Text>
                <Text style={styles.receiptValueAmount}>{formatCurrency(totalAmount)}</Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Période couverte :</Text>
                <Text style={styles.receiptValueGreen}>Jusqu'au {formatDateShort(previewDateStr)}</Text>
              </View>

              {lastTx && (
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Réf Opération :</Text>
                  <Text style={styles.receiptValueSmall}>#{lastTx.id.slice(0, 8)}</Text>
                </View>
              )}
            </View>

            <View style={styles.receiptActionRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleShareReceipt}
                style={styles.receiptShareBtn}
              >
                <Icon name="print" size={16} color={SOL_COLORS.primary} style={{ marginRight: 6 }} />
                <Text style={styles.receiptShareBtnText}>Partager / Imprimer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setIsReceiptOpen(false);
                  router.push('/(tabs)' as any);
                }}
                style={styles.receiptDoneBtn}
              >
                <Text style={styles.receiptDoneBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  businessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  businessBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  businessIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessBannerName: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  businessBannerRate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  businessBannerRateBold: {
    fontWeight: '800',
    color: SOL_COLORS.primary,
  },
  totalSlotsBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  totalSlotsBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  clientHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 12,
  },
  clientHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  changeClientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  changeClientBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.primary,
  },
  clientProfileBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  clientName: {
    fontSize: 17,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  clientPhone: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  clientBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  rankPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  multiHandsBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  multiHandsBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#D97706',
  },
  balancePill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  balancePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  emptyClientSelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyClientSelectText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginLeft: 8,
  },
  handsSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 12,
  },
  handsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  handsCountLiveBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperBtnSymbol: {
    fontSize: 24,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    lineHeight: 28,
  },
  stepperDisplay: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stepperValueText: {
    fontSize: 28,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  stepperSubText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: -2,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetCard: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  presetCardSelected: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primary,
  },
  presetCardHands: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  presetCardHandsSelected: {
    color: '#FFFFFF',
  },
  presetCardAmount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  presetCardAmountSelected: {
    color: '#E0E7FF',
  },
  amountDisplayCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  amountDisplayLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  totalAmountValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#34D399',
    marginTop: 4,
  },
  formulaRow: {
    marginTop: 4,
    marginBottom: 10,
  },
  formulaText: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  formulaBold: {
    fontWeight: '900',
    color: '#FFFFFF',
  },
  coverageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 150, 105, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#059669',
  },
  coverageBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34D399',
  },
  cycleCompletedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 12,
  },
  cycleCompletedText: {
    flex: 1,
    fontSize: 12,
    color: '#065F46',
    fontWeight: '700',
    lineHeight: 16,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    height: 52,
    borderRadius: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  modalSafeContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalClientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  modalClientTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  modalClientSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  clientOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  clientOptionCardActive: {
    borderColor: SOL_COLORS.primary,
    backgroundColor: '#EFF6FF',
  },
  clientOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rankCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '900',
    color: SOL_COLORS.primary,
  },
  clientOptionName: {
    fontSize: 15,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  clientOptionPhone: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  clientOptionSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  clientOptionBalance: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  clientOptionCovered: {
    fontSize: 11,
    color: '#64748B',
    marginLeft: 4,
  },
  clientOptionRight: {
    marginLeft: 10,
  },
  selectedCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySearchContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptySearchText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  receiptCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
  },
  receiptHeader: {
    alignItems: 'center',
  },
  receiptIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  receiptTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
  },
  receiptSub: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 14,
  },
  receiptBody: {
    gap: 8,
    marginBottom: 16,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  receiptValue: {
    fontSize: 13,
    color: SOL_COLORS.textPrimary,
    fontWeight: '700',
  },
  receiptValueBold: {
    fontSize: 14,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  receiptValueAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
  },
  receiptValueGreen: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  receiptValueSmall: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
  },
  receiptActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  receiptShareBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  receiptShareBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SOL_COLORS.primary,
  },
  receiptDoneBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: SOL_COLORS.primary,
  },
  receiptDoneBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
