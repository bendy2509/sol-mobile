import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { getClientById, getAllClients } from '@/db/clientRepository';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { payoutMemberHand } from '@/db/memberRepository';
import { recordAuditLog } from '@/services/auditService';
import { generatePayoutReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Client, BusinessConfig } from '@/types';
import { formatCurrency, formatDate, getInitials } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';

import { calculateCycleTotalHands } from '@/services/financialService';

export default function PayoutScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeCollector, userRole } = useAuth();
  const { triggerSync } = useSync();

  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';

  const [client, setClient] = useState<Client | null>(null);
  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
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
    if (cData) {
      const hands = Math.max(1, cData.handsCount || 1);
      const curRec = cData.receivedHandsCount || 0;
      setPayoutNote(`Remise de la main (${curRec + 1}/${hands}) - ${cData.fullName}`);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const unitAmount = client?.dailyAmount || business?.contributionAmount || 250;
  const memberHandsCount = Math.max(1, client?.handsCount || 1);
  const totalCycleHands = calculateCycleTotalHands(allClients) || (business?.totalSlots || 10);
  const totalPotAmount = totalCycleHands * unitAmount;

  const currentReceivedHands = client?.receivedHandsCount !== undefined
    ? client.receivedHandsCount
    : client?.hasReceivedHand || client?.hasReceivedPayout
    ? memberHandsCount
    : 0;

  const isFullyReceived = currentReceivedHands >= memberHandsCount || Boolean(client?.hasReceivedHand || client?.hasReceivedPayout);

  const handleInitiatePayout = () => {
    if (isFullyReceived) {
      triggerErrorFeedback();
      Alert.alert(
        'Action Interdite',
        `Cet adhérent (${client?.fullName}) a déjà reçu l'intégralité de ses mains (${memberHandsCount}/${memberHandsCount}) pour ce cycle de SOL.`
      );
      return;
    }

    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert('Accès Lecture Seule', 'Le décaissement de la main est réservé aux gestionnaires.');
      return;
    }

    if (!payoutNote.trim()) {
      triggerErrorFeedback();
      Alert.alert('Motif requis', 'Veuillez saisir une note ou justification pour le décaissement.');
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
      Alert.alert('Erreur', "Action interdite : Cet adhérent a déjà reçu l'intégralité de ses mains pour ce cycle.");
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
      Alert.alert(
        'Main Remise avec Succès !',
        `La cagnotte de ${formatCurrency(totalPotAmount)} a été décaissée pour ${client.fullName} (Main ${currentReceivedHands + 1}/${memberHandsCount}).\n\nCalculée sur la base des ${totalCycleHands} mains effectives du cycle (${totalCycleHands} × ${formatCurrency(unitAmount)}).`,
        [
          {
            text: 'Télécharger Reçu PDF',
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
                Alert.alert('Erreur', 'Impossible de générer le reçu PDF.');
              }
              router.replace('/(tabs)' as any);
            },
          },
          {
            text: 'Fermer',
            style: 'cancel',
            onPress: () => router.replace('/(tabs)' as any),
          },
        ]
      );
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert('Erreur', err?.message || 'Échec du décaissement.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!client) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.loadingText}>Chargement du dossier...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Icon name="arrow-left" size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Décaissement ("Bay Men")</Text>
          <Text style={styles.headerSub}>{business?.name || 'Carnet SOL'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Recipient Profile Card */}
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, isFullyReceived && styles.avatarDisabled]}>
              <Text style={styles.avatarText}>{getInitials(client.fullName)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.clientName}>{client.fullName}</Text>
              <Text style={styles.clientPhone}>{client.phoneNumber}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                {memberHandsCount > 1 && (
                  <View style={styles.multiHandsBadgeHeader}>
                    <Icon name="crown" size={11} color="#D97706" style={{ marginRight: 4 }} />
                    <Text style={styles.multiHandsBadgeHeaderText}>{memberHandsCount} MAINS SOUSCRITES</Text>
                  </View>
                )}
                <View style={styles.rankPill}>
                  <Icon name="crown" size={12} color={SOL_COLORS.info} style={{ marginRight: 4 }} />
                  <Text style={styles.rankPillText}>
                    {memberHandsCount > 1 && client.payoutRanks
                      ? `Rangs : #${client.payoutRanks}`
                      : `Main #${client.payoutRank || 1}`}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Status Alert if Already Fully Received */}
        {isFullyReceived ? (
          <View style={styles.blockedAlertCard}>
            <View style={styles.blockedIconBox}>
              <Icon name="check" size={24} color="#059669" />
            </View>
            <Text style={styles.blockedTitle}>
              {memberHandsCount > 1 ? `Toutes les mains remises (${memberHandsCount}/${memberHandsCount})` : 'Main Déjà Remise'}
            </Text>
            <Text style={styles.blockedSub}>
              Cet adhérent a déjà perçu l'intégralité de ses mains ({memberHandsCount} main(s)) pour ce cycle de SOL.
              {client.handReceivedDate ? `\nDernière remise : ${formatDate(client.handReceivedDate)}.` : ''}
              {'\n\n'}
              Règle financière SOL : Un adhérent ne peut pas recevoir plus de mains que son quota souscrit.
            </Text>
          </View>
        ) : (
          <>
            {/* Pot Breakdown Card */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>MONTANT DE LA CAGNOTTE DU TIRAGE</Text>
              <Text style={styles.potAmountDisplay}>{formatCurrency(totalPotAmount)}</Text>
              <Text style={styles.potBreakdownText}>
                Base dynamique : {totalCycleHands} mains effectives au cycle × {formatCurrency(unitAmount)} par main
              </Text>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Effectif total du cycle :</Text>
                <Text style={styles.infoValue}>{totalCycleHands} enfants/mains</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Mains souscrites par l'adhérent :</Text>
                <Text style={styles.infoValue}>{memberHandsCount} part{memberHandsCount > 1 ? 's' : ''} (Rangs : #{client.payoutRanks || client.payoutRank || 1})</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Cotisation unitaire par main :</Text>
                <Text style={styles.infoValue}>{formatCurrency(unitAmount)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Montant de CE tirage ("Bay Men") :</Text>
                <Text style={styles.infoValue}>{formatCurrency(totalPotAmount)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Total à percevoir sur le cycle :</Text>
                <Text style={styles.infoValue}>{formatCurrency(totalPotAmount * memberHandsCount)} ({memberHandsCount} tirage{memberHandsCount > 1 ? 's' : ''})</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Progression des tirages perçus :</Text>
                <Text style={styles.infoValue}>{currentReceivedHands} / {memberHandsCount} tirage{memberHandsCount > 1 ? 's' : ''}</Text>
              </View>
            </View>

            {/* Justification / Note */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>JUSTIFICATION / NOTE DE REMISE *</Text>
              <TextInput
                style={styles.noteInput}
                value={payoutNote}
                onChangeText={setPayoutNote}
                placeholder="Motif ou référence de la remise..."
                placeholderTextColor="#94A3B8"
                multiline
              />
            </View>

            {/* Payout Trigger Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleInitiatePayout}
              disabled={isProcessing}
              style={styles.confirmPayoutBtn}
            >
              <Icon name="crown" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.confirmPayoutBtnText}>
                {isProcessing ? 'Validation en cours...' : `Valider la Remise (${formatCurrency(totalPotAmount)})`}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* PIN Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        onCancel={() => setIsPinModalOpen(false)}
        onSuccess={handleConfirmPayout}
        title="Validation par Code PIN"
        subtitle={`Saisissez votre code PIN gestionnaire pour confirmer le décaissement de ${formatCurrency(totalPotAmount)} à ${client.fullName}.`}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.background,
  },
  loadingText: {
    fontSize: 14,
    color: SOL_COLORS.textSecondary,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: SOL_COLORS.primary,
    ...SHADOWS.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDisabled: {
    backgroundColor: '#94A3B8',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  clientName: {
    fontSize: 16,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  clientPhone: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  multiHandsBadgeHeader: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  multiHandsBadgeHeaderText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#D97706',
  },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  rankPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.info,
  },
  blockedAlertCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    marginBottom: 16,
    ...SHADOWS.sm,
  },
  blockedIconBox: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  blockedTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#15803D',
    marginBottom: 8,
  },
  blockedSub: {
    fontSize: 13,
    color: '#166534',
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: SOL_COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  potAmountDisplay: {
    fontSize: 26,
    fontWeight: '900',
    color: SOL_COLORS.accent,
    marginVertical: 4,
  },
  potBreakdownText: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: SOL_COLORS.border,
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 12,
    color: SOL_COLORS.textPrimary,
    fontWeight: '800',
  },
  noteInput: {
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    padding: 12,
    fontSize: 13,
    color: SOL_COLORS.textPrimary,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  confirmPayoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.accent,
    borderRadius: 16,
    paddingVertical: 15,
    ...SHADOWS.md,
  },
  confirmPayoutBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
