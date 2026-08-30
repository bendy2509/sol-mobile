import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getClientById, updateClientDetails, deleteClient, getAllClients } from '@/db/clientRepository';
import { getTransactionsByClient, reverseTransaction } from '@/db/transactionRepository';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { getDatabase, getActiveCollectorId } from '@/db/sqlite';
import { payoutMemberHand } from '@/db/memberRepository';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { BusinessConfig, Client, Transaction } from '@/types';
import { formatCurrency, formatDate, formatDateShort, getInitials } from '@/lib/formatters';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { generateContributionReceiptPdf, generatePayoutReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { recordAuditLog } from '@/services/auditService';
import { calculateCycleContributionLimits, calculateCycleTotalHands } from '@/services/financialService';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';

export default function ClientDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeCollector, userRole, getAdminProfile } = useAuth();
  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';
  const isAdmin = userRole === 'ADMIN';

  const [client, setClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [dbTotalHands, setDbTotalHands] = useState<number>(0);

  // Modals & form state
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isReversalModalOpen, setIsReversalModalOpen] = useState(false);
  const [selectedTxForReversal, setSelectedTxForReversal] = useState<Transaction | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editRank, setEditRank] = useState('');
  const [payoutNote, setPayoutNote] = useState('');

  // 4-Digit PIN Security State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingActionTitle, setPendingActionTitle] = useState('');
  const [pendingActionSubtitle, setPendingActionSubtitle] = useState('');
  const [pendingActionCallback, setPendingActionCallback] = useState<(() => Promise<void>) | null>(null);

  const loadClientData = async () => {
    if (!id) return;
    const [data, txs, activeBiz, clientList] = await Promise.all([
      getClientById(id),
      getTransactionsByClient(id),
      getActiveBusinessConfig(),
      getAllClients(),
    ]);
    setClient(data);
    setTransactions(txs);
    setBusiness(activeBiz);
    setAllClients(clientList);

    // Direct SQL SUM for guaranteed total hands accuracy
    try {
      const db = await getDatabase();
      const collectorId = await getActiveCollectorId();
      const row = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(COALESCE(hands_count, 1)), 0) as total FROM clients WHERE collector_id = ?`,
        [collectorId]
      );
      const totalFromSql = Number(row?.total || 0);
      const totalFromClients = calculateCycleTotalHands(clientList);
      setDbTotalHands(Math.max(1, totalFromClients, totalFromSql));
    } catch {
      setDbTotalHands(Math.max(1, calculateCycleTotalHands(clientList)));
    }

    if (data) {
      setEditFullName(data.fullName);
      setEditPhoneNumber(data.phoneNumber);
      setEditRank(data.payoutRank ? data.payoutRank.toString() : '1');
      setPayoutNote(`Remise de la main #${data.payoutRank || 1} - ${data.fullName}`);
    }
  };

  useEffect(() => {
    loadClientData();
  }, [id]);

  const unitAmount = client?.dailyAmount || business?.contributionAmount || 250;
  const memberHandsCount = Math.max(1, client?.handsCount || 1);
  const totalCycleHands = dbTotalHands || calculateCycleTotalHands(allClients) || (business?.totalSlots || 10);
  const totalPotAmount = totalCycleHands * unitAmount;


  const limits = calculateCycleContributionLimits({
    currentPaidHands: client?.paidHandsCount || 0,
    totalCycleHands,
    memberHandsCount,
    unitAmount,
  });

  const remainingHands = limits.remainingHands;
  const remainingAmount = limits.remainingAmount;
  const maxAllowedHands = limits.maxAllowedHands;

  // Direct count of payout transactions to guarantee 100% coherence with transaction timeline
  const clientPayoutTxsCount = transactions.filter(
    (t) => !t.isReversed && (t.type === 'HAND_PAYOUT' || t.type === 'SOL_PAYOUT')
  ).length;

  const rawReceived = Number(client?.receivedHandsCount || 0);
  const hasPayoutFlag = Boolean(client?.hasReceivedHand || client?.hasReceivedPayout);
  const currentReceivedHands = Math.max(
    rawReceived,
    clientPayoutTxsCount,
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
  const memberContributionProgressPct = maxAllowedHands > 0 ? Math.min(100, Math.round(((client?.paidHandsCount || 0) / maxAllowedHands) * 100)) : 0;

  const pendingRankClients = allClients
    .filter((c) => !c.hasReceivedHand && !c.hasReceivedPayout && c.payoutRank)
    .sort((a, b) => (a.payoutRank || 999) - (b.payoutRank || 999));
  const expectedNextRank = pendingRankClients.length > 0 ? pendingRankClients[0].payoutRank || 1 : 1;
  const isOutOfOrder = Boolean(client?.payoutRank && client.payoutRank !== expectedNextRank);

  const requirePinForAction = (title: string, subtitle: string, action: () => Promise<void>) => {
    setPendingActionTitle(title);
    setPendingActionSubtitle(subtitle);
    setPendingActionCallback(() => action);
    setIsPinModalOpen(true);
  };

  const handlePinSuccess = async () => {
    setIsPinModalOpen(false);
    if (pendingActionCallback) {
      await pendingActionCallback();
      setPendingActionCallback(null);
    }
  };

  const handleOpenEditModal = () => {
    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert('Accès Lecture Seule', 'La modification est réservée aux gestionnaires.');
      return;
    }
    triggerLightImpact();
    if (!client) return;
    setEditFullName(client.fullName);
    setEditPhoneNumber(client.phoneNumber);
    setEditRank(client.payoutRank ? client.payoutRank.toString() : '1');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert('Accès Lecture Seule', 'La modification est réservée aux gestionnaires.');
      return;
    }
    if (!client) return;
    if (!editFullName.trim()) {
      Alert.alert('Erreur', "Le nom de l'adhérent ne peut pas être vide.");
      return;
    }

    requirePinForAction(
      "Modifier l'Adhérent",
      `Saisissez votre code PIN gestionnaire (4 chiffres) pour valider la mise à jour des coordonnées de ${editFullName}.`,
      async () => {
        try {
          const normPhone = normalizePhoneNumber(editPhoneNumber);
          const parsedRank = parseInt(editRank, 10) || client.payoutRank || 1;
          await updateClientDetails(client.id, {
            fullName: editFullName.trim(),
            phoneNumber: normPhone,
            payoutRank: parsedRank,
          });

          triggerSuccessFeedback();
          Alert.alert('Succès', 'Les coordonnées ont été mises à jour.');
          setIsEditModalOpen(false);
          loadClientData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert('Erreur', err?.message || 'Échec de la modification.');
        }
      }
    );
  };

  const handleInitiatePayout = () => {
    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert('Accès Lecture Seule', 'Le décaissement est réservé aux gestionnaires.');
      return;
    }
    triggerMediumImpact();
    if (!client) return;
    if (client.hasReceivedHand || client.hasReceivedPayout) {
      Alert.alert(
        'Main Déjà Remise',
        `${client.fullName} a déjà touché sa main pour ce cycle de SOL. Une deuxième remise nécessite une procédure exceptionnelle.`
      );
    }
    setPayoutNote(`Remise de la main #${client.payoutRank || 1} - ${client.fullName}`);
    setIsPayoutModalOpen(true);
  };

  const handleConfirmPayout = () => {
    if (!client) return;
    if (isOutOfOrder && !payoutNote.trim()) {
      Alert.alert('Justification requise', 'Pour une remise hors ordre normal du SOL, veuillez obligatoirement saisir une justification.');
      return;
    }
    setIsPayoutModalOpen(false);

    requirePinForAction(
      'Validation du Décaissement',
      `Saisissez votre code PIN pour décaisser la cagnotte de ${formatCurrency(totalPotAmount)} (${totalCycleHands} mains × ${formatCurrency(unitAmount)}) à ${client.fullName}.`,
      async () => {
        try {
          const tx = await payoutMemberHand(
            client.id,
            totalPotAmount,
            payoutNote.trim() || `Remise de la main du SOL pour ${client.fullName}`,
            business?.id
          );

          if (isOutOfOrder) {
            await recordAuditLog({
              userId: activeCollector?.id || 'collector',
              userRole: 'COLLECTOR',
              action: 'PAYOUT_OUT_OF_ORDER',
              entityType: 'TRANSACTION',
              entityId: tx.id,
              reason: payoutNote.trim() || `Remise au rang #${client.payoutRank} au lieu du rang attendu #${expectedNextRank}`,
            });
          }

          triggerSuccessFeedback();
          Alert.alert(
            'Main Remise avec Succès !',
            `La main de ${formatCurrency(totalPotAmount)} a été décaissée pour ${client.fullName}.\n\nCalculée sur la base des ${totalCycleHands} mains effectives du cycle.`,
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
                },
              },
              { text: 'Fermer', style: 'cancel' },
            ]
          );
          loadClientData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert('Erreur', err?.message || 'Échec du décaissement de la main.');
        }
      }
    );
  };

  const handleDeleteClient = () => {
    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert('Accès Lecture Seule', 'La suppression est réservée aux gestionnaires.');
      return;
    }
    if (!client) return;
    triggerMediumImpact();

    Alert.alert(
      "Supprimer l'Adhérent",
      `Êtes-vous sûr de vouloir supprimer définitivement le dossier de ${client.fullName} ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            requirePinForAction(
              'Confirmation de Suppression',
              `Saisissez votre code PIN pour supprimer définitivement le dossier de ${client.fullName}.`,
              async () => {
                try {
                  await deleteClient(client.id);
                  triggerSuccessFeedback();
                  Alert.alert('Supprimé', "Le dossier de l'adhérent a été supprimé.", [
                    {
                      text: 'OK',
                      onPress: () => router.replace('/(tabs)' as any),
                    },
                  ]);
                } catch (err: any) {
                  triggerErrorFeedback();
                  Alert.alert('Erreur', err?.message || 'Échec de la suppression.');
                }
              }
            );
          },
        },
      ]
    );
  };

  const handlePrintOrShare = async () => {
    triggerMediumImpact();
    if (!client) return;

    Alert.alert(
      `Fiche & Reçu : ${client.fullName}`,
      'Comment souhaitez-vous transmettre le document officiel à l\'adhérent ?',
      [
        {
          text: 'Envoyer par WhatsApp',
          onPress: () => {
            const digitsOnly = client.phoneNumber.replace(/[^0-9]/g, '');
            const message = `Bonjour ${client.fullName}, voici l'état certifié de votre compte SOL (${business?.name || 'SOL Mobile'}) :
- Total Cotisé : ${formatCurrency(client.totalPaidAmount || client.currentBalance)}
- Nombre de Mains : ${client.paidHandsCount || 0} main(s)
- Rang attribué : Main #${client.payoutRank || 1}
- Couvert jusqu'au : ${formatDate(client.paidUntilDate || new Date().toISOString())}
- Main reçue : ${client.hasReceivedHand || client.hasReceivedPayout ? 'OUI' : 'NON'}

Document sécurisé et certifié par SOL Mobile.`;
            const encoded = encodeURIComponent(message);
            const url = digitsOnly ? `https://wa.me/${digitsOnly}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
            Linking.openURL(url).catch(() => {
              Alert.alert('WhatsApp', 'Impossible d\'ouvrir WhatsApp.');
            });
          },
        },
        {
          text: 'Télécharger PDF',
          onPress: async () => {
            try {
              const latestTx = transactions.length > 0 ? transactions[0] : null;
              const unitVal = client.dailyAmount || business?.contributionAmount || 250;
              const hands = client.paidHandsCount || 1;
              const totalVal = client.totalPaidAmount || client.currentBalance;

              const pdfUri = await generateContributionReceiptPdf({
                transactionId: latestTx ? latestTx.id : 'LIVRET-INDIVIDUEL',
                businessName: business?.name || 'SOL Mobile',
                collectorName: activeCollector?.fullName || 'Agent SOL',
                collectorPhone: activeCollector?.phoneNumber || '+509 XX XX XXXX',
                collectorZone: activeCollector?.zone,
                clientName: client.fullName,
                clientPhone: client.phoneNumber,
                payoutRank: client.payoutRank || undefined,
                qrCodeToken: client.qrCodeToken,
                unitAmount: unitVal,
                handsCount: hands,
                totalAmount: totalVal,
                coverageStartDate: new Date().toISOString().split('T')[0],
                coverageEndDate: client.paidUntilDate || new Date().toISOString().split('T')[0],
                createdAt: latestTx ? latestTx.createdAtLocal : new Date().toISOString(),
              });

              await sharePdfFile(pdfUri, `Fiche_SOL_${client.fullName.replace(/\s+/g, '_')}.pdf`);
            } catch (err: any) {
              Alert.alert('Erreur', 'Impossible de générer le document PDF.');
            }
          },
        },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  const handleTransactionPress = (tx: Transaction) => {
    triggerLightImpact();
    setSelectedTx(tx);
    setIsDetailModalOpen(true);
  };

  const handleShareReceipt = async () => {
    if (!selectedTx || !client) return;
    try {
      const isPayout = selectedTx.type === 'SOL_PAYOUT' || selectedTx.type === 'HAND_PAYOUT' || selectedTx.type === 'WITHDRAWAL';
      let fileUri: string;
      if (isPayout) {
        fileUri = await generatePayoutReceiptPdf({
          transactionId: selectedTx.id,
          businessName: business?.name || 'SOL Mobile',
          collectorName: activeCollector?.fullName || 'Gestionnaire SOL',
          collectorPhone: activeCollector?.phoneNumber || '+509 XX XX XXXX',
          collectorZone: activeCollector?.zone,
          clientName: client.fullName,
          clientPhone: client.phoneNumber,
          payoutRank: client.payoutRank || undefined,
          totalPotAmount: selectedTx.amount,
          registeredChildrenCount: totalCycleHands,
          unitAmount: unitAmount,
          note: selectedTx.note,
          createdAt: selectedTx.createdAtLocal,
        });
      } else {
        const uAmount = unitAmount || Math.round(selectedTx.amount / (selectedTx.handsCovered || 1));
        fileUri = await generateContributionReceiptPdf({
          transactionId: selectedTx.id,
          businessName: business?.name || 'SOL Mobile',
          collectorName: activeCollector?.fullName || 'Gestionnaire SOL',
          collectorPhone: activeCollector?.phoneNumber || '+509 XX XX XXXX',
          collectorZone: activeCollector?.zone,
          clientName: client.fullName,
          clientPhone: client.phoneNumber,
          payoutRank: client.payoutRank || undefined,
          qrCodeToken: client.qrCodeToken || `SOL-${selectedTx.id.slice(0, 6)}`,
          unitAmount: uAmount,
          handsCount: selectedTx.handsCovered || 1,
          totalAmount: selectedTx.amount,
          coverageStartDate: selectedTx.createdAtLocal.split('T')[0],
          coverageEndDate: selectedTx.createdAtLocal.split('T')[0],
          createdAt: selectedTx.createdAtLocal,
        });
      }
      await sharePdfFile(fileUri, `recu_operation_${selectedTx.id.slice(0, 8)}.pdf`);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible de générer le reçu.');
    }
  };

  const handleWhatsAppShare = () => {
    if (!selectedTx || !client) return;
    const digitsOnly = normalizePhoneNumber(client.phoneNumber);
    const typeLabel = selectedTx.type === 'SABOTAY_DEPOSIT'
      ? 'Dépôt Sabotay'
      : selectedTx.type === 'SOL_CONTRIBUTION' || selectedTx.type === 'CONTRIBUTION'
      ? 'Cotisation Sol'
      : selectedTx.type === 'REVERSAL' || selectedTx.isReversed
      ? 'Annulation'
      : 'Décaissement Main ("Bay Men")';

    const message = `*SOL MOBILE - RÉCÉPISSÉ CERTIFIÉ*
Adhérent : ${client.fullName}
Opération : #${selectedTx.id.slice(0, 8)}
Type : ${typeLabel}
Montant : ${formatCurrency(selectedTx.amount)}
Date : ${formatDate(selectedTx.createdAtLocal)}

Reçu archivé avec succès sur SOL Mobile.`;
    const encoded = encodeURIComponent(message);
    const url = digitsOnly ? `https://wa.me/${digitsOnly}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('WhatsApp', "Impossible d'ouvrir WhatsApp.");
    });
  };

  const handleInitiateCancel = () => {
    if (!selectedTx) return;
    setIsDetailModalOpen(false);
    setSelectedTxForReversal(selectedTx);
    setReversalReason('');
    setIsReversalModalOpen(true);
  };

  const handleConfirmReversal = () => {
    if (!selectedTxForReversal) return;
    if (!reversalReason.trim()) {
      Alert.alert('Motif obligatoire', "Veuillez saisir la raison de l'annulation.");
      return;
    }
    setIsReversalModalOpen(false);

    requirePinForAction(
      'Annulation de Transaction',
      `Saisissez votre code PIN pour valider l'annulation de l'opération #${selectedTxForReversal.id.slice(0, 8)} (${formatCurrency(selectedTxForReversal.amount)}).`,
      async () => {
        try {
          await reverseTransaction({
            transactionId: selectedTxForReversal.id,
            reason: reversalReason.trim(),
            userRole: userRole || 'MANAGER',
            collectorId: activeCollector?.id,
          });
          triggerSuccessFeedback();
          Alert.alert('Opération Rectifiée', "L'opération a été annulée et le solde/échéance de l'adhérent a été recalculé.");
          loadClientData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert('Erreur', err?.message || "Échec de l'annulation.");
        } finally {
          setSelectedTxForReversal(null);
        }
      }
    );
  };

  if (!client) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.loadingText}>Chargement du dossier adhérent...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Identity Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(client.fullName)}</Text>
            </View>

            <View style={styles.profileInfo}>
              <Text style={styles.fullName}>{client.fullName}</Text>
              <Text style={styles.phoneNumber}>{client.phoneNumber}</Text>
              <View style={styles.badgesRow}>
                <Badge type={client.type} />
                {client.handsCount && client.handsCount > 1 ? (
                  <View style={styles.multiHandsBadgeHeader}>
                    <Icon name="crown" size={11} color="#D97706" style={{ marginRight: 4 }} />
                    <Text style={styles.multiHandsBadgeHeaderText}>{client.handsCount} MAINS</Text>
                  </View>
                ) : client.payoutRank ? (
                  <View style={styles.rankBadge}>
                    <Icon name="crown" size={11} color={SOL_COLORS.info} style={{ marginRight: 3 }} />
                    <Text style={styles.rankBadgeText}>Main #{client.payoutRank}</Text>
                  </View>
                ) : null}
                {isFullyReceived ? (
                  <View style={styles.handReceivedBadge}>
                    <Icon name="check" size={11} color={SOL_COLORS.successDark} style={{ marginRight: 4 }} />
                    <Text style={styles.handReceivedBadgeText}>
                      {memberHandsCount > 1 ? `TOUTES MAINS REÇUES (${memberHandsCount}/${memberHandsCount})` : 'MAIN REÇUE'}
                    </Text>
                  </View>
                ) : memberHandsCount > 1 && currentReceivedHands > 0 ? (
                  <View style={styles.handPartialBadgeHeader}>
                    <Icon name="check" size={11} color="#0369A1" style={{ marginRight: 4 }} />
                    <Text style={styles.handPartialBadgeHeaderText}>
                      {currentReceivedHands}/{memberHandsCount} MAINS PERÇUES
                    </Text>
                  </View>
                ) : (
                  <View style={styles.handPendingBadge}>
                    <Icon name="clock" size={11} color={SOL_COLORS.accent} style={{ marginRight: 4 }} />
                    <Text style={styles.handPendingBadgeText}>EN ATTENTE</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Timeline & Coverage details */}
          <View style={styles.coverageRow}>
            <View style={styles.coverageItem}>
              <Text style={styles.coverageLabel}>COUVERT JUSQU'AU</Text>
              <Text style={styles.coverageValue}>{formatDateShort(client.paidUntilDate || 'En attente')}</Text>
            </View>
            <View style={styles.coverageDivider} />
            <View style={styles.coverageItem}>
              <Text style={styles.coverageLabel}>TOTAL MAINS PAYÉES</Text>
              <Text style={styles.coverageValueGreen}>{client.paidHandsCount || 0} / {maxAllowedHands} main(s)</Text>
            </View>
          </View>

          {/* Cotisation Progress Bar */}
          <View style={styles.clientProgressBarSection}>
            <View style={styles.clientProgressBarLabelRow}>
              <Text style={styles.clientProgressBarLabel}>Progression des cotisations ({memberContributionProgressPct}%)</Text>
              <Text style={styles.clientProgressBarCount}>{client.paidHandsCount || 0}/{maxAllowedHands} dues</Text>
            </View>
            <View style={styles.clientProgressBarBg}>
              <View style={[styles.clientProgressBarFill, { width: `${memberContributionProgressPct}%` }]} />
            </View>
          </View>

          {/* Quick Metrics based on effective cycle hands count */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>TOTAL COTISÉ</Text>
              <Text style={styles.metricValue}>
                {formatCurrency(client.totalPaidAmount || client.currentBalance)}
              </Text>
              <Text style={styles.metricSubHint}>
                {client.paidHandsCount || 0} / {maxAllowedHands} main(s) dues
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>RESTE À VERSER</Text>
              <Text style={remainingHands === 0 ? styles.metricValueGreen : styles.metricValueOrange}>
                {remainingHands === 0 ? 'Complété' : formatCurrency(remainingAmount)}
              </Text>
              <Text style={styles.metricSubHint}>
                {remainingHands === 0 ? 'Toutes mains réglées' : `${remainingHands} main(s) restante(s)`}
              </Text>
            </View>
          </View>
        </View>

        {/* Multi-Hands Detailed Financial Specs Card */}
        <View style={styles.multiHandsSpecCard}>
          <View style={styles.multiHandsSpecHeader}>
            <Icon name="crown" size={15} color="#D97706" style={{ marginRight: 6 }} />
            <Text style={styles.multiHandsSpecTitle}>
              {memberHandsCount > 1
                ? `RÉCAPITULATIF FINANCIER (${memberHandsCount} MAINS SOUSCRITES)`
                : 'DÉTAILS DU CYCLE SOL'}
            </Text>
          </View>

          <View style={styles.multiHandsSpecGrid}>
            <View style={styles.multiHandsSpecRow}>
              <Text style={styles.multiHandsSpecLabel}>Effectif du SOL :</Text>
              <Text style={styles.multiHandsSpecValueBold}>
                {allClients.length} enfant{allClients.length > 1 ? 's' : ''} • {totalCycleHands} main{totalCycleHands > 1 ? 's' : ''} au total
              </Text>
            </View>
            <View style={styles.multiHandsSpecRow}>
              <Text style={styles.multiHandsSpecLabel}>Montant unitaire par main :</Text>
              <Text style={styles.multiHandsSpecValueBold}>
                {formatCurrency(unitAmount)}
              </Text>
            </View>
            <View style={styles.multiHandsSpecRow}>
              <Text style={styles.multiHandsSpecLabel}>Cagnotte d'un tirage :</Text>
              <Text style={styles.multiHandsSpecValueGreen}>
                {formatCurrency(totalPotAmount)} ({totalCycleHands} mains × {formatCurrency(unitAmount)})
              </Text>
            </View>
            <View style={styles.multiHandsSpecRow}>
              <Text style={styles.multiHandsSpecLabel}>Total à cotiser sur le cycle :</Text>
              <Text style={styles.multiHandsSpecValueBold}>
                {formatCurrency(limits.maxPotAmount)} ({limits.maxAllowedHands} cotisations de {formatCurrency(unitAmount)})
              </Text>
            </View>
            <View style={styles.multiHandsSpecRow}>
              <Text style={styles.multiHandsSpecLabel}>Total à recevoir en tirages :</Text>
              <Text style={styles.multiHandsSpecValueGreen}>
                {formatCurrency(totalPotAmount * memberHandsCount)} ({memberHandsCount} tirage{memberHandsCount > 1 ? 's' : ''} de {formatCurrency(totalPotAmount)})
              </Text>
            </View>
            <View style={styles.multiHandsSpecRow}>
              <Text style={styles.multiHandsSpecLabel}>Tirages déjà perçus :</Text>
              <Text style={isFullyReceived ? styles.multiHandsSpecValueGreen : styles.multiHandsSpecValuePrimary}>
                {currentReceivedHands} / {memberHandsCount} main{memberHandsCount > 1 ? 's' : ''} remise{memberHandsCount > 1 ? 's' : ''} ({memberPayoutProgressPct}%)
              </Text>
            </View>

            {/* Member Payout Progress Bar */}
            <View style={styles.specProgressBarContainer}>
              <View style={styles.specProgressBarBg}>
                <View
                  style={[
                    styles.specProgressBarFillAmber,
                    { width: `${memberPayoutProgressPct}%` },
                  ]}
                />
              </View>
            </View>

            <View style={[styles.multiHandsSpecRow, { marginTop: 10 }]}>
              <Text style={styles.multiHandsSpecLabel}>Mains données au total :</Text>
              <Text style={styles.multiHandsSpecValueBold}>
                {effectiveTotalHandsTouched} / {totalCycleHands} mains ({cycleProgressPct}%)
              </Text>
            </View>

            {/* Global Cycle Progress Bar */}
            <View style={styles.specProgressBarContainer}>
              <View style={styles.specProgressBarBg}>
                <View
                  style={[
                    styles.specProgressBarFillGreen,
                    { width: `${cycleProgressPct}%` },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Action Button: Bay Men */}
        {isFullyReceived ? (
          <View style={[styles.payoutButton, styles.payoutButtonDisabled]}>
            <View style={styles.payoutBtnLeft}>
              <View style={[styles.payoutIconCircle, styles.payoutIconCircleDisabled]}>
                <Icon name="check" size={18} color="#059669" />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.payoutBtnTitleDisabled}>
                  {memberHandsCount > 1 ? `Toutes les mains remises (${memberHandsCount}/${memberHandsCount})` : 'Main déjà remise'}
                </Text>
                <Text style={styles.payoutBtnSubDisabled}>
                  Cagnotte perçue {client.handReceivedDate ? `le ${formatDate(client.handReceivedDate)}` : 'pour ce cycle'} ({formatCurrency(totalPotAmount)})
                </Text>
              </View>
            </View>
            <View style={styles.completedBadgePill}>
              <Text style={styles.completedBadgePillText}>RÉGLÉ</Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleInitiatePayout}
            style={styles.payoutButton}
          >
            <View style={styles.payoutBtnLeft}>
              <View style={styles.payoutIconCircle}>
                <Icon name="crown" size={18} color="#FFFFFF" />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.payoutBtnTitle}>
                  {memberHandsCount > 1
                    ? `Donner la Main ("Bay Men") (${currentReceivedHands + 1}/${memberHandsCount})`
                    : 'Donner la Main ("Bay Men")'}
                </Text>
                <Text style={styles.payoutBtnSub}>
                  Cagnotte : {formatCurrency(totalPotAmount)} ({totalCycleHands} mains effectives au cycle)
                </Text>
              </View>
            </View>
            <Icon name="arrow-right" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {/* Primary Action Buttons Grid */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              triggerLightImpact();
              router.push({ pathname: '/(tabs)/collect', params: { clientId: client.id } });
            }}
            style={styles.actionBtnPrimary}
          >
            <Icon name="collect" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnPrimaryText}>Encaisser</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenEditModal}
            style={styles.actionBtnSecondary}
          >
            <Text style={styles.actionBtnSecondaryText}>Modifier</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePrintOrShare}
            style={styles.actionBtnSecondary}
          >
            <Icon name="print" size={15} color={SOL_COLORS.textPrimary} style={{ marginRight: 4 }} />
            <Text style={styles.actionBtnSecondaryText}>Reçu</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleDeleteClient}
            style={styles.actionBtnDanger}
          >
            <Icon name="close" size={14} color={SOL_COLORS.danger} />
          </TouchableOpacity>
        </View>

        {/* Individual Passbook Ledger */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            HISTORIQUE DES COTISATIONS ({transactions.length})
          </Text>
        </View>

        {transactions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="history" size={28} color={SOL_COLORS.textMuted} />
            <Text style={styles.emptyText}>Aucun versement enregistré pour cet adhérent.</Text>
          </View>
        ) : (
          transactions.map((tx) => {
            const isDeposit =
              tx.type === 'SABOTAY_DEPOSIT' || tx.type === 'SOL_CONTRIBUTION' || tx.type === 'CONTRIBUTION';
            const isReversal = tx.type === 'REVERSAL' || tx.isReversed;
            return (
              <TouchableOpacity
                key={tx.id}
                activeOpacity={0.75}
                onPress={() => handleTransactionPress(tx)}
                style={[styles.txRow, isReversal && styles.txRowReversed]}
              >
                <View style={styles.txLeft}>
                  <View
                    style={[
                      styles.txIcon,
                      isReversal ? styles.txIconReversal : isDeposit ? styles.txIconDeposit : styles.txIconWithdraw,
                    ]}
                  >
                    <Icon
                      name={isReversal ? 'arrow-left' : isDeposit ? 'arrow-right' : 'arrow-left'}
                      size={14}
                      color={isReversal ? SOL_COLORS.danger : isDeposit ? SOL_COLORS.successDark : SOL_COLORS.accent}
                    />
                  </View>
                  <View>
                    <Text style={styles.txTypeName}>
                      {isReversal
                        ? 'Annulation'
                        : tx.type === 'SABOTAY_DEPOSIT'
                        ? 'Dépôt Sabotay'
                        : tx.type === 'SOL_CONTRIBUTION' || tx.type === 'CONTRIBUTION'
                        ? 'Cotisation Sol'
                        : 'Décaissement Main ("Bay Men")'}
                    </Text>
                    <Text style={styles.txDate}>{formatDate(tx.createdAtLocal)}</Text>
                  </View>
                </View>

                <View style={styles.txRight}>
                  <Text
                    style={[
                      styles.txAmount,
                      isReversal ? styles.txAmountReversal : isDeposit ? styles.txAmountDeposit : styles.txAmountWithdraw,
                    ]}
                  >
                    {isReversal ? '-' : isDeposit ? '+' : '-'} {formatCurrency(tx.amount)}
                  </Text>
                  <Badge syncStatus={tx.syncStatus} style={{ marginTop: 2 }} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Transaction Detail Modal */}
      <Modal
        visible={isDetailModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDetailModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Détail de l'Opération</Text>
              <TouchableOpacity
                onPress={() => setIsDetailModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {selectedTx && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
                <View style={styles.detailBody}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Référence :</Text>
                    <Text style={styles.detailValue}>#{selectedTx.id.slice(0, 8)}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Adhérent :</Text>
                    <Text style={styles.detailValueBold}>{client.fullName}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Type :</Text>
                    <Text style={styles.detailValue}>
                      {selectedTx.type === 'SABOTAY_DEPOSIT'
                        ? 'Dépôt Sabotay'
                        : selectedTx.type === 'SOL_CONTRIBUTION' || selectedTx.type === 'CONTRIBUTION'
                        ? 'Cotisation Sol'
                        : selectedTx.type === 'REVERSAL' || selectedTx.isReversed
                        ? 'Annulation'
                        : 'Décaissement Main ("Bay Men")'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Montant :</Text>
                    <Text style={styles.detailValueAmount}>{formatCurrency(selectedTx.amount)}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Mains couvertes :</Text>
                    <Text style={styles.detailValue}>{selectedTx.handsCovered || 1} main(s)</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date & Heure :</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedTx.createdAtLocal)}</Text>
                  </View>

                  {selectedTx.note && (
                    <View style={styles.noteBox}>
                      <Text style={styles.noteBoxTitle}>NOTE D'ENREGISTREMENT :</Text>
                      <Text style={styles.noteBoxContent}>{selectedTx.note}</Text>
                    </View>
                  )}

                  <View style={styles.modalActionButtons}>
                    {/* Row 1: Share Actions */}
                    <View style={styles.shareRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleShareReceipt}
                        style={styles.shareBtn}
                      >
                        <Icon name="print" size={15} color="#1D4ED8" style={{ marginRight: 6 }} />
                        <Text style={styles.shareBtnText}>Reçu PDF</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleWhatsAppShare}
                        style={styles.whatsappActionBtn}
                      >
                        <Icon name="share" size={15} color="#059669" style={{ marginRight: 6 }} />
                        <Text style={styles.whatsappActionBtnText}>WhatsApp</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Row 2: Cancel / Reversal */}
                    {selectedTx.type !== 'REVERSAL' && !selectedTx.isReversed && !isReadOnly && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleInitiateCancel}
                        style={styles.cancelOpBtn}
                      >
                        <Icon name="alert" size={15} color="#DC2626" style={{ marginRight: 6 }} />
                        <Text style={styles.cancelOpBtnText}>Annuler cette opération</Text>
                      </TouchableOpacity>
                    )}

                    {/* Row 3: Admin Hotline */}
                    {!isAdmin && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={async () => {
                          const profile = await getAdminProfile();
                          const phone = profile.phoneNumber || '+50900000000';
                          const digits = phone.replace(/[^0-9+]/g, '');
                          Linking.openURL(`tel:${digits}`).catch(() => {
                            Alert.alert('Hotline Admin', `Numéro Hotline Administrateur : ${phone}`);
                          });
                        }}
                        style={styles.contactAdminBtn}
                      >
                        <Icon name="phone" size={14} color="#0284C7" style={{ marginRight: 6 }} />
                        <Text style={styles.contactAdminBtnText}>Besoin d'aide ? Contacter l'Admin</Text>
                      </TouchableOpacity>
                    )}

                    {isReadOnly && selectedTx.type !== 'REVERSAL' && !selectedTx.isReversed && (
                      <View style={styles.managerNoticeCard}>
                        <Icon name="shield" size={14} color="#64748B" style={{ marginRight: 6 }} />
                        <Text style={styles.managerNoticeText}>
                          Mode consultation seule. Contactez votre gestionnaire ou un Super-Admin pour régularisation.
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        visible={isEditModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Modifier l'Adhérent</Text>
              <TouchableOpacity
                onPress={() => setIsEditModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Mise à jour des informations de l'adhérent.</Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>NOM COMPLET</Text>
              <TextInput
                style={styles.formInput}
                value={editFullName}
                onChangeText={setEditFullName}
                placeholder="Ex: Marie Carmelle Jean"
                placeholderTextColor={SOL_COLORS.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>NUMÉRO DE TÉLÉPHONE</Text>
              <TextInput
                style={styles.formInput}
                value={editPhoneNumber}
                onChangeText={setEditPhoneNumber}
                placeholder="+509 XX XX XXXX"
                placeholderTextColor={SOL_COLORS.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>RANG DANS LE SOL (ORDRE DE MAIN)</Text>
              <TextInput
                style={styles.formInput}
                value={editRank}
                onChangeText={setEditRank}
                placeholder="Ex: 1, 2, 3..."
                placeholderTextColor={SOL_COLORS.textMuted}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={() => setIsEditModalOpen(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveEdit} style={styles.modalSaveBtn}>
                <Text style={styles.modalSaveBtnText}>Sauvegarder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payout ("Bay Men") Modal */}
      <Modal
        visible={isPayoutModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPayoutModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Remise de la Main ("Bay Men")</Text>
              <TouchableOpacity
                onPress={() => setIsPayoutModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Le gestionnaire peut donner la main à cet adhérent avec validation de sécurité.
            </Text>

            {isOutOfOrder && (
              <View style={styles.outOfOrderWarning}>
                <Icon name="alert" size={14} color={SOL_COLORS.accent} style={{ marginRight: 6 }} />
                <Text style={styles.outOfOrderWarningText}>
                  ⚠️ Cette remise ne correspond pas au rang normal prévu (#{expectedNextRank}).
                </Text>
              </View>
            )}

            <View style={styles.payoutDetailCard}>
              <Text style={styles.payoutDetailLabel}>BÉNÉFICIAIRE :</Text>
              <Text style={styles.payoutDetailName}>{client.fullName} ({client.phoneNumber})</Text>

              <Text style={[styles.payoutDetailLabel, { marginTop: 8 }]}>CAGNOTTE CALCULÉE :</Text>
              <Text style={styles.payoutDetailAmount}>{formatCurrency(totalPotAmount)}</Text>
              <Text style={styles.payoutDetailFormula}>
                {totalCycleHands} mains au total × {formatCurrency(unitAmount)}
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>MOTIF / JUSTIFICATION :</Text>
              <TextInput
                style={styles.formInput}
                value={payoutNote}
                onChangeText={setPayoutNote}
                placeholder="Ex: Remise normale du cycle #1"
                placeholderTextColor={SOL_COLORS.textMuted}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={() => setIsPayoutModalOpen(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleConfirmPayout} style={styles.modalPayoutConfirmBtn}>
                <Icon name="crown" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalPayoutConfirmBtnText}>Valider PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reversal Confirmation Modal */}
      <Modal
        visible={isReversalModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsReversalModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Annuler une Transaction</Text>
              <TouchableOpacity
                onPress={() => setIsReversalModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              L'annulation recalculera fidèlement le solde, les mains payées et la couverture de l'adhérent.
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>MOTIF OBLIGATOIRE DE L'ANNULATION :</Text>
              <TextInput
                style={styles.formInput}
                value={reversalReason}
                onChangeText={setReversalReason}
                placeholder="Ex: Erreur de saisie du montant"
                placeholderTextColor={SOL_COLORS.textMuted}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={() => setIsReversalModalOpen(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>Retour</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleConfirmReversal} style={styles.modalDangerBtn}>
                <Text style={styles.modalDangerBtnText}>Confirmer Annulation</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Universal Sensitive Action PIN Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        onCancel={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
        title={pendingActionTitle}
        subtitle={pendingActionSubtitle}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SOL_COLORS.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 14, color: SOL_COLORS.textSecondary },
  scrollContent: { padding: 16, paddingBottom: 40 },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    marginBottom: 14,
    ...SHADOWS.sm,
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: SOL_COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
  },
  avatarText: { fontSize: 20, fontWeight: '900', color: SOL_COLORS.primaryDark },
  profileInfo: { flex: 1 },
  fullName: { fontSize: 18, fontWeight: '900', color: SOL_COLORS.textPrimary },
  phoneNumber: { fontSize: 13, color: SOL_COLORS.textSecondary, fontWeight: '600', marginTop: 2 },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.infoLighter,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  rankBadgeText: { fontSize: 10, fontWeight: '800', color: SOL_COLORS.info },
  multiHandsBadgeHeader: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  multiHandsBadgeHeaderText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#D97706',
  },
  handReceivedBadge: { backgroundColor: SOL_COLORS.successLighter, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  handReceivedBadgeText: { fontSize: 9, fontWeight: '900', color: SOL_COLORS.successDark },
  handPartialBadgeHeader: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  handPartialBadgeHeaderText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0369A1',
  },
  handPendingBadge: { backgroundColor: SOL_COLORS.accentLighter, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  handPendingBadgeText: { fontSize: 9, fontWeight: '900', color: SOL_COLORS.accent },
  coverageRow: {
    flexDirection: 'row',
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    alignItems: 'center',
  },
  coverageDivider: {
    width: 1,
    height: 24,
    backgroundColor: SOL_COLORS.border,
  },
  coverageItem: { flex: 1, alignItems: 'center' },
  coverageLabel: { fontSize: 9, fontWeight: '900', color: SOL_COLORS.textMuted, letterSpacing: 0.3 },
  coverageValue: { fontSize: 14, fontWeight: '800', color: SOL_COLORS.textPrimary, marginTop: 2 },
  coverageValueGreen: { fontSize: 14, fontWeight: '900', color: SOL_COLORS.primaryDark, marginTop: 2 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricItem: { flex: 1, backgroundColor: SOL_COLORS.surfaceSubtle, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: SOL_COLORS.border, alignItems: 'center' },
  metricLabel: { fontSize: 9, fontWeight: '900', color: SOL_COLORS.textMuted, letterSpacing: 0.3 },
  metricValue: { fontSize: 15, fontWeight: '900', color: SOL_COLORS.textPrimary, marginTop: 2 },
  metricValueGreen: { fontSize: 15, fontWeight: '900', color: SOL_COLORS.successDark, marginTop: 2 },
  metricValueOrange: { fontSize: 15, fontWeight: '900', color: '#D97706', marginTop: 2 },
  metricSubHint: { fontSize: 10, color: SOL_COLORS.textSecondary, fontWeight: '700', marginTop: 2 },
  multiHandsSpecCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    ...SHADOWS.sm,
  },
  multiHandsSpecHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FEF3C7',
    paddingBottom: 8,
  },
  multiHandsSpecTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  multiHandsSpecGrid: {
    gap: 8,
  },
  multiHandsSpecRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  multiHandsSpecLabel: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
    flex: 1,
  },
  multiHandsSpecValueBold: {
    fontSize: 12,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  multiHandsSpecValueGreen: {
    fontSize: 12,
    fontWeight: '900',
    color: SOL_COLORS.successDark,
  },
  multiHandsSpecValuePrimary: {
    fontSize: 12,
    fontWeight: '800',
    color: SOL_COLORS.primary,
  },
  payoutButton: {
    backgroundColor: SOL_COLORS.secondary,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    ...SHADOWS.sm,
  },
  payoutButtonDisabled: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  payoutBtnLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  payoutIconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: SOL_COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  payoutIconCircleDisabled: {
    backgroundColor: '#DCFCE7',
  },
  payoutBtnTitle: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
  payoutBtnTitleDisabled: { fontSize: 15, fontWeight: '900', color: '#15803D' },
  payoutBtnSub: { fontSize: 11, color: '#94A3B8', marginTop: 2, fontWeight: '600' },
  payoutBtnSubDisabled: { fontSize: 11, color: '#166534', marginTop: 2, fontWeight: '600' },
  completedBadgePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  completedBadgePillText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#15803D',
  },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  actionBtnPrimary: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
    ...SHADOWS.sm,
  },
  actionBtnPrimaryText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  actionBtnSecondary: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  actionBtnSecondaryText: { fontSize: 12, fontWeight: '700', color: SOL_COLORS.textPrimary },
  actionBtnDanger: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.dangerLighter,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  sectionHeader: { marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: SOL_COLORS.textMuted, letterSpacing: 0.5 },
  emptyCard: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 18, alignItems: 'center', borderWidth: 1, borderColor: SOL_COLORS.border },
  emptyText: { fontSize: 12, color: SOL_COLORS.textMuted, marginTop: 8 },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  txRowReversed: { backgroundColor: SOL_COLORS.dangerLighter, borderColor: '#FECDD3' },
  txLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  txIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txIconDeposit: { backgroundColor: SOL_COLORS.successLighter },
  txIconWithdraw: { backgroundColor: SOL_COLORS.accentLighter },
  txIconReversal: { backgroundColor: SOL_COLORS.dangerLighter },
  txTypeName: { fontSize: 14, fontWeight: '800', color: SOL_COLORS.textPrimary },
  txDate: { fontSize: 11, color: SOL_COLORS.textMuted, marginTop: 2, fontWeight: '600' },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 14, fontWeight: '900' },
  txAmountDeposit: { color: SOL_COLORS.successDark },
  txAmountWithdraw: { color: SOL_COLORS.accent },
  txAmountReversal: { color: SOL_COLORS.dangerDark },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 22, ...SHADOWS.lg },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    width: '100%',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: SOL_COLORS.textPrimary },
  modalSub: { fontSize: 12, color: SOL_COLORS.textSecondary, marginBottom: 14, lineHeight: 16 },
  outOfOrderWarning: {
    flexDirection: 'row',
    backgroundColor: SOL_COLORS.accentLighter,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
    alignItems: 'center',
  },
  outOfOrderWarningText: { fontSize: 11, color: SOL_COLORS.accent, fontWeight: '700', flex: 1 },
  payoutDetailCard: { backgroundColor: SOL_COLORS.surfaceSubtle, padding: 14, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: SOL_COLORS.border },
  payoutDetailLabel: { fontSize: 9, fontWeight: '800', color: SOL_COLORS.textMuted },
  payoutDetailName: { fontSize: 14, fontWeight: '900', color: SOL_COLORS.textPrimary, marginTop: 2 },
  payoutDetailAmount: { fontSize: 22, fontWeight: '900', color: SOL_COLORS.primaryDark, marginTop: 2 },
  payoutDetailFormula: { fontSize: 11, color: SOL_COLORS.textSecondary, marginTop: 2 },
  formGroup: { marginBottom: 12 },
  formLabel: { fontSize: 10, fontWeight: '800', color: SOL_COLORS.textSecondary, marginBottom: 4 },
  formInput: {
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: SOL_COLORS.textPrimary,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: SOL_COLORS.surfaceSubtle, alignItems: 'center' },
  modalCancelBtnText: { fontSize: 13, fontWeight: '700', color: SOL_COLORS.textSecondary },
  modalSaveBtn: { flex: 1.5, paddingVertical: 12, borderRadius: 14, backgroundColor: SOL_COLORS.primary, alignItems: 'center' },
  modalSaveBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  modalPayoutConfirmBtn: { flex: 1.5, paddingVertical: 12, borderRadius: 14, backgroundColor: SOL_COLORS.primary, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  modalPayoutConfirmBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  modalDangerBtn: { flex: 1.5, paddingVertical: 12, borderRadius: 14, backgroundColor: SOL_COLORS.danger, alignItems: 'center' },
  modalDangerBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  detailBody: {
    paddingVertical: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  detailValueBold: {
    fontSize: 13,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  detailValueAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: SOL_COLORS.primary,
  },
  noteBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noteBoxTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 4,
  },
  noteBoxContent: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  modalActionButtons: {
    gap: 8,
    marginTop: 12,
    width: '100%',
  },
  shareRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  whatsappActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  whatsappActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  cancelOpBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  cancelOpBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  contactAdminBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    marginTop: 2,
  },
  contactAdminBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0284C7',
  },
  managerNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  managerNoticeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
  },
  clientProgressBarSection: {
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  clientProgressBarLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  clientProgressBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: SOL_COLORS.textSecondary,
  },
  clientProgressBarCount: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.primaryDark,
  },
  clientProgressBarBg: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  clientProgressBarFill: {
    height: '100%',
    backgroundColor: SOL_COLORS.primary,
    borderRadius: 3,
  },
  specProgressBarContainer: {
    marginTop: 4,
    marginBottom: 6,
  },
  specProgressBarBg: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  specProgressBarFillAmber: {
    height: '100%',
    backgroundColor: '#D97706',
    borderRadius: 3,
  },
  specProgressBarFillGreen: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
});
