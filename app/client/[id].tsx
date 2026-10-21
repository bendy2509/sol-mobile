import React, { useState, useEffect, useMemo } from 'react';
import { View, Pressable, StyleSheet, Alert, Linking, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getClientById, updateClientDetails, deleteClient, getAllClients } from '@/db/clientRepository';
import { getTransactionsByClient, reverseTransaction } from '@/db/transactionRepository';
import { getActiveBusinessConfig, getCurrentCycleBoundary } from '@/db/businessRepository';
import { getDatabase, getActiveCollectorId } from '@/db/sqlite';
import { payoutMemberHand } from '@/db/memberRepository';
import { useAuth } from '@/context/AuthContext';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { ClosedCycleNotice } from '@/components/ClosedCycleLockNotice';
import {
  AmountText,
  Avatar,
  Button,
  Card,
  Dialog,
  EmptyState,
  Icon,
  ListItem,
  MetricTile,
  ProgressBar,
  Screen,
  SectionHeader,
  StatusBadge,
  Text,
  TextField,
  UiIconName,
  StatStrip,
} from '@/components/ui';
import { BusinessConfig, Client, Transaction } from '@/types';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/formatters';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { generateContributionReceiptPdf, generatePayoutReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { recordAuditLog } from '@/services/auditService';
import {
  calculateCycleContributionLimits,
  calculateCycleTotalHands,
  isTransactionFromClosedCycle,
} from '@/services/financialService';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

/** Display label of a ledger entry (presentation only). */
function getTxTypeLabel(tx: Transaction): string {
  if (tx.type === 'REVERSAL' || tx.isReversed) return 'Annulation';
  if (tx.type === 'SABOTAY_DEPOSIT') return 'Dépôt Sabotay';
  if (tx.type === 'SOL_CONTRIBUTION' || tx.type === 'CONTRIBUTION') return 'Cotisation Sol';
  return 'Remise de la main (bay men)';
}

export default function ClientDetailScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeCollector, userRole } = useAuth();
  const { width, isSmallScreen, isVerySmallScreen, isTablet, horizontalPadding } = useResponsive();
  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';

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
  const [cycleBoundary, setCycleBoundary] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editRank, setEditRank] = useState('');
  const [editHandsCount, setEditHandsCount] = useState<number>(1);
  const [editMultiRanks, setEditMultiRanks] = useState<string>('');
  const [payoutNote, setPayoutNote] = useState('');

  // 4-Digit PIN Security State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingActionTitle, setPendingActionTitle] = useState('');
  const [pendingActionSubtitle, setPendingActionSubtitle] = useState('');
  const [pendingActionCallback, setPendingActionCallback] = useState<(() => Promise<void>) | null>(null);

  const loadClientData = async () => {
    if (!id) return;
    const [data, txs, activeBiz, clientList, boundary] = await Promise.all([
      getClientById(id),
      getTransactionsByClient(id),
      getActiveBusinessConfig(),
      getAllClients(),
      getCurrentCycleBoundary(),
    ]);
    setClient(data);
    setCycleBoundary(boundary);
    setTransactions(txs);
    setBusiness(activeBiz);
    setAllClients(clientList);

    // Direct SQL SUM of all active clients for guaranteed accuracy
    try {
      const db = await getDatabase();
      const collectorId = await getActiveCollectorId();
      const row = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(COALESCE(hands_count, 1)), 0) as total FROM clients WHERE collector_id = ? AND id NOT IN (SELECT id FROM deleted_clients)`,
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
      setEditHandsCount(Math.max(1, data.handsCount || 1));
      const ranksStr = Array.isArray(data.payoutRanks)
        ? data.payoutRanks.join(', ')
        : data.payoutRanks
        ? String(data.payoutRanks)
        : (data.payoutRank ? data.payoutRank.toString() : '1');
      setEditMultiRanks(ranksStr);
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
    setEditHandsCount(Math.max(1, client.handsCount || 1));
    const ranksStr = Array.isArray(client.payoutRanks)
      ? client.payoutRanks.join(', ')
      : client.payoutRanks
      ? String(client.payoutRanks)
      : (client.payoutRank ? client.payoutRank.toString() : '1');
    setEditMultiRanks(ranksStr);
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

    const validHands = Math.max(1, Number(editHandsCount) || 1);
    const parsedRank = parseInt(editRank, 10) || client.payoutRank || 1;
    let finalRanks = editMultiRanks.trim();
    if (!finalRanks) {
      const rList = [];
      for (let i = 0; i < validHands; i++) {
        rList.push(parsedRank + i);
      }
      finalRanks = rList.join(', ');
    }

    requirePinForAction(
      "Modifier l'Adhérent",
      `Saisissez votre code PIN gestionnaire (4 chiffres) pour valider la mise à jour de ${editFullName} (${validHands} main(s)).`,
      async () => {
        try {
          const normPhone = normalizePhoneNumber(editPhoneNumber);
          await updateClientDetails(client.id, {
            fullName: editFullName.trim(),
            phoneNumber: normPhone,
            payoutRank: parsedRank,
            payoutRanks: finalRanks,
            handsCount: validHands,
          });

          triggerSuccessFeedback();
          Alert.alert('Succès', `L'adhérent a été mis à jour avec ${validHands} main(s) (Rangs: #${finalRanks}).`);
          setIsEditModalOpen(false);
          await loadClientData();
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
                      onPress: () => {
                        if (router.canGoBack()) {
                          router.back();
                        } else {
                          router.replace('/(tabs)' as any);
                        }
                      },
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

  const isSelectedTxFromClosedCycle = !!selectedTx && isTransactionFromClosedCycle(selectedTx.createdAtLocal, cycleBoundary);

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
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="bodyStrong">Chargement du dossier adhérent…</Text>
        </View>
      </Screen>
    );
  }

  const isMulti = memberHandsCount > 1;
  const detailRows: { label: string; value: string; tone?: 'success' | 'primary' }[] = [
    { label: 'Effectif du sol', value: `${allClients.length} enfant${allClients.length > 1 ? 's' : ''} · ${totalCycleHands} main${totalCycleHands > 1 ? 's' : ''}` },
    { label: 'Montant par main', value: formatCurrency(unitAmount) },
    { label: "Cagnotte d'un tirage", value: `${formatCurrency(totalPotAmount)} (${totalCycleHands} × ${formatCurrency(unitAmount)})`, tone: 'success' },
    { label: 'Total à cotiser sur le cycle', value: `${formatCurrency(limits.maxPotAmount)} (${limits.maxAllowedHands} cotisations)` },
    {
      label: 'Total à recevoir',
      value: `${formatCurrency(totalPotAmount * memberHandsCount)} (${memberHandsCount} tirage${memberHandsCount > 1 ? 's' : ''})`,
      tone: 'success',
    },
  ];

  return (
    <Screen
      footer={
        !isReadOnly ? (
          <Button
            size="lg"
            fullWidth
            icon="cash"
            label="Encaisser une cotisation"
            onPress={() => {
              triggerLightImpact();
              router.navigate({ pathname: '/(tabs)/collect', params: { clientId: client.id } } as any);
            }}
          />
        ) : undefined
      }
    >
      {/* Identity, on the page itself (no card) */}
      <View style={styles.cardGap}>
        <View style={styles.identityRow}>
          <Avatar name={client.fullName} size="lg" />
          <View style={styles.flexShrink}>
            <Text variant="title" numberOfLines={2} selectable>
              {client.fullName}
            </Text>
            <Text variant="body" tone="muted" selectable>
              {client.phoneNumber}
            </Text>
          </View>
        </View>

        <Text variant="caption" tone="muted">
          {isMulti ? `${memberHandsCount} mains · rangs ${client.payoutRanks || client.payoutRank}` : `Main #${client.payoutRank || 1}`} ·{' '}
          {client.type === 'SABOTAY' ? 'Sabotay' : client.type === 'SOL' ? 'Sol' : client.type}
        </Text>
        {isFullyReceived ? (
          <StatusBadge status="HAND_RECEIVED" appearance="inline" label={isMulti ? `Toutes les mains reçues (${memberHandsCount}/${memberHandsCount})` : 'Main reçue'} />
        ) : isMulti && currentReceivedHands > 0 ? (
          <StatusBadge status="HAND_RECEIVED" appearance="inline" label={`${currentReceivedHands}/${memberHandsCount} mains reçues`} />
        ) : null}
      </View>

      <StatStrip
        cells={[
          { label: 'Total cotisé', children: <AmountText amount={client.totalPaidAmount || client.currentBalance} size="medium" /> },
          remainingHands === 0
            ? { label: 'Reste à verser', value: 'Complété', tone: 'success', hint: 'Toutes mains réglées' }
            : { label: 'Reste à verser', tone: 'warning', hint: `${remainingHands} main(s)`, children: <AmountText amount={remainingAmount} size="medium" tone="warning" /> },
        ]}
      />

      <Card style={styles.cardGap}>
        <View style={styles.progressBlock}>
          <View style={styles.rowBetween}>
            <Text variant="label">
              Cotisations : {client.paidHandsCount || 0} / {maxAllowedHands} mains
            </Text>
            <Text variant="label" tone="muted">
              {memberContributionProgressPct} %
            </Text>
          </View>
          <ProgressBar value={memberContributionProgressPct / 100} accessibilityLabel="Progression des cotisations" />
          <View style={styles.coverageRow}>
            <Icon name="calendar" size={16} color={theme.colors.textMuted} />
            <Text variant="caption" tone="muted">
              Couvert jusqu'au{' '}
            </Text>
            <Text variant="label">{client.paidUntilDate ? formatDateShort(client.paidUntilDate) : 'en attente'}</Text>
          </View>
        </View>
      </Card>

      {/* Payout ("bay men") */}
      {isFullyReceived ? (
        <Card tone="success">
          <View style={styles.noticeRow}>
            <Icon name="check" size={22} color={theme.colors.success} strokeWidth={2.5} />
            <View style={styles.flexShrink}>
              <Text variant="subheading" tone="success">
                {isMulti ? `Toutes les mains remises (${memberHandsCount}/${memberHandsCount})` : 'Main déjà remise'}
              </Text>
              <Text variant="body" tone="success">
                Cagnotte perçue {client.handReceivedDate ? `le ${formatDate(client.handReceivedDate)}` : 'pour ce cycle'} ({formatCurrency(totalPotAmount)})
              </Text>
            </View>
          </View>
        </Card>
      ) : !isReadOnly ? (
        <Card style={styles.cardGap}>
          <View style={styles.rowBetween}>
            <Text variant="subheading">Remise de la main</Text>
            <AmountText amount={totalPotAmount} size="small" />
          </View>
          <Text variant="caption" tone="muted">
            {totalCycleHands} mains effectives au cycle × {formatCurrency(unitAmount)}
          </Text>
          <Button
            icon="payout"
            fullWidth
            variant={isOutOfOrder ? 'secondary' : 'primary'}
            label={isMulti ? `Remettre la main (${currentReceivedHands + 1}/${memberHandsCount})` : 'Remettre la main'}
            onPress={handleInitiatePayout}
          />
        </Card>
      ) : null}

      {/* Cycle details */}
      <Card style={styles.cardGap}>
        <Text variant="subheading" accessibilityRole="header">
          {isMulti ? `Récapitulatif · ${memberHandsCount} mains souscrites` : 'Détails du cycle'}
        </Text>
        {detailRows.map((row) => (
          <View key={row.label} style={styles.detailRow}>
            <Text variant="caption" tone="muted" style={styles.detailLabel}>
              {row.label}
            </Text>
            <Text variant="label" tone={row.tone === 'success' ? 'success' : 'default'} style={styles.detailValue}>
              {row.value}
            </Text>
          </View>
        ))}
        <View style={styles.progressBlock}>
          <View style={styles.rowBetween}>
            <Text variant="caption" tone="muted">
              Tirages perçus
            </Text>
            <Text variant="label" tone={isFullyReceived ? 'success' : 'primary'}>
              {currentReceivedHands} / {memberHandsCount} ({memberPayoutProgressPct} %)
            </Text>
          </View>
          <ProgressBar value={memberPayoutProgressPct / 100} tone="success" accessibilityLabel="Tirages perçus" />
        </View>
        <View style={styles.progressBlock}>
          <View style={styles.rowBetween}>
            <Text variant="caption" tone="muted">
              Mains données dans le sol
            </Text>
            <Text variant="label">
              {effectiveTotalHandsTouched} / {totalCycleHands} ({cycleProgressPct} %)
            </Text>
          </View>
          <ProgressBar value={cycleProgressPct / 100} accessibilityLabel="Mains données dans le sol" />
        </View>
      </Card>

      {/* Secondary actions */}
      <View style={styles.actionsRow}>
        <Button label="Modifier" icon="edit" variant="secondary" onPress={handleOpenEditModal} style={styles.flexGrow} />
        <Button label="Fiche / reçu" icon="printer" variant="secondary" onPress={handlePrintOrShare} style={styles.flexGrow} />
      </View>

      {/* Passbook */}
      <SectionHeader title="Historique des opérations" count={transactions.length} />
      {transactions.length === 0 ? (
        <Card padding="none">
          <EmptyState icon="history" title="Aucune opération" message="Aucun versement enregistré pour cet adhérent." />
        </Card>
      ) : (
        <Card padding="none" style={styles.ledger}>
          {transactions.map((tx, i) => {
            const isDeposit = tx.type === 'SABOTAY_DEPOSIT' || tx.type === 'SOL_CONTRIBUTION' || tx.type === 'CONTRIBUTION';
            const isReversal = tx.type === 'REVERSAL' || tx.isReversed;
            const icon: UiIconName = isReversal ? 'alert' : isDeposit ? 'cash' : 'payout';
            const iconColor = isReversal ? theme.colors.danger : isDeposit ? theme.colors.success : theme.colors.primary;
            const iconBg = isReversal ? theme.colors.dangerSoft : isDeposit ? theme.colors.successSoft : theme.colors.primarySoft;
            return (
              <ListItem
                key={tx.id}
                divider={i < transactions.length - 1}
                onPress={() => handleTransactionPress(tx)}
                accessibilityLabel={`${getTxTypeLabel(tx)}, ${formatCurrency(tx.amount)}, ${formatDate(tx.createdAtLocal)}`}
                leading={
                  <View style={[styles.txIcon, { backgroundColor: iconBg }]}>
                    <Icon name={icon} size={18} color={iconColor} />
                  </View>
                }
                title={getTxTypeLabel(tx)}
                subtitle={formatDate(tx.createdAtLocal)}
                trailing={
                  <AmountText
                    amount={tx.amount}
                    size="small"
                    sign={isDeposit && !isReversal ? 'credit' : 'debit'}
                    tone={isReversal ? 'danger' : isDeposit ? 'success' : 'default'}
                  />
                }
              />
            );
          })}
        </Card>
      )}

      {!isReadOnly && (
        <Button label="Supprimer l'adhérent" icon="trash" variant="ghost" fullWidth onPress={handleDeleteClient} style={styles.deleteBtn} />
      )}

      {/* Transaction detail */}
      <Dialog visible={isDetailModalOpen && !!selectedTx} onClose={() => setIsDetailModalOpen(false)} title="Détail de l'opération">
        {selectedTx && (
          <>
            <AmountText amount={selectedTx.amount} size="large" />
            {[
              { label: 'Référence', value: `#${selectedTx.id.slice(0, 8)}` },
              { label: 'Adhérent', value: client.fullName },
              { label: 'Type', value: getTxTypeLabel(selectedTx) },
              { label: 'Mains couvertes', value: `${selectedTx.handsCovered || 1} main(s)` },
              { label: 'Date et heure', value: formatDate(selectedTx.createdAtLocal) },
            ].map((row) => (
              <View key={row.label} style={styles.detailRow}>
                <Text variant="caption" tone="muted" style={styles.detailLabel}>
                  {row.label}
                </Text>
                <Text variant="label" selectable style={styles.detailValue}>
                  {row.value}
                </Text>
              </View>
            ))}

            {selectedTx.note && (
              <View style={styles.noteBox}>
                <Text variant="caption" tone="muted">
                  Note d'enregistrement
                </Text>
                <Text variant="body" selectable>
                  {selectedTx.note}
                </Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              <Button label="Reçu PDF" icon="printer" variant="secondary" onPress={handleShareReceipt} style={styles.flexGrow} />
              <Button label="WhatsApp" icon="message" variant="secondary" onPress={handleWhatsAppShare} style={styles.flexGrow} />
            </View>

            {selectedTx.type !== 'REVERSAL' && !selectedTx.isReversed && !isReadOnly && isSelectedTxFromClosedCycle && <ClosedCycleNotice />}

            {selectedTx.type !== 'REVERSAL' && !selectedTx.isReversed && !isReadOnly && (
              <Button label="Annuler cette opération" icon="alert" variant="danger" fullWidth onPress={handleInitiateCancel} />
            )}


            {isReadOnly && selectedTx.type !== 'REVERSAL' && !selectedTx.isReversed && (
              <Card tone="sunken">
                <View style={styles.noticeRow}>
                  <Icon name="shield" size={18} color={theme.colors.textMuted} />
                  <Text variant="caption" tone="muted" style={styles.flexShrink}>
                    Mode consultation seule : seul le gestionnaire du carnet peut annuler une opération.
                  </Text>
                </View>
              </Card>
            )}
          </>
        )}
      </Dialog>

      {/* Edit member */}
      <Dialog
        visible={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Modifier l'adhérent"
        subtitle="Mise à jour des informations de l'adhérent."
        icon="edit"
        actions={
          <>
            <Button label="Annuler" variant="secondary" onPress={() => setIsEditModalOpen(false)} style={styles.flexGrow} />
            <Button label="Enregistrer" onPress={handleSaveEdit} style={styles.flexGrow} />
          </>
        }
      >
        <TextField label="Nom complet" value={editFullName} onChangeText={setEditFullName} placeholder="Ex : Marie Carmelle Jean" />
        <TextField
          label="Numéro de téléphone"
          value={editPhoneNumber}
          onChangeText={setEditPhoneNumber}
          placeholder="+509 XX XX XXXX"
          keyboardType="phone-pad"
        />

        <View style={styles.cardGap}>
          <View style={styles.rowBetween}>
            <Text variant="label">Mains souscrites</Text>
            <Text variant="label" tone="primary">
              {formatCurrency(editHandsCount * unitAmount)} / tour
            </Text>
          </View>
          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => {
                const next = Math.max(1, editHandsCount - 1);
                setEditHandsCount(next);
                triggerLightImpact();
              }}
              accessibilityRole="button"
              accessibilityLabel="Retirer une main"
              style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
            >
              <Icon name="minus" size={22} color={theme.colors.text} />
            </Pressable>
            <View style={styles.stepperValue}>
              <Text variant="amountLarge" align="center">
                {editHandsCount}
              </Text>
              <Text variant="caption" tone="muted" align="center">
                main{editHandsCount > 1 ? 's' : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                const next = editHandsCount + 1;
                setEditHandsCount(next);
                triggerLightImpact();
              }}
              accessibilityRole="button"
              accessibilityLabel="Ajouter une main"
              style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
            >
              <Icon name="plus" size={22} color={theme.colors.text} />
            </Pressable>
          </View>
          <Text variant="caption" tone="muted">
            Ajouter une main à cet enfant augmente automatiquement la cagnotte du sol.
          </Text>
        </View>

        <TextField
          label="Rang(s) de tirage"
          value={editMultiRanks}
          onChangeText={setEditMultiRanks}
          placeholder="Ex : 1 ou 1, 4, 7"
          helper="Séparez les rangs par des virgules."
        />
      </Dialog>

      {/* Payout ("bay men") */}
      <Dialog
        visible={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        title="Remise de la main"
        subtitle="Validation par code PIN gestionnaire."
        icon="payout"
        actions={
          <>
            <Button label="Annuler" variant="secondary" onPress={() => setIsPayoutModalOpen(false)} style={styles.flexGrow} />
            <Button label="Valider avec PIN" icon="lock" onPress={handleConfirmPayout} style={styles.flexGrow} />
          </>
        }
      >
        {isOutOfOrder && (
          <Card tone="warning">
            <View style={styles.noticeRow}>
              <Icon name="alert" size={18} color={theme.colors.warning} />
              <Text variant="label" tone="warning" style={styles.flexShrink}>
                Cette remise ne suit pas l'ordre prévu (rang #{expectedNextRank} attendu). Justification obligatoire.
              </Text>
            </View>
          </Card>
        )}

        <Card tone="sunken" style={styles.cardGap}>
          <Text variant="caption" tone="muted">
            Bénéficiaire
          </Text>
          <Text variant="bodyStrong">
            {client.fullName} · {client.phoneNumber}
          </Text>
          <Text variant="caption" tone="muted">
            Cagnotte calculée
          </Text>
          <AmountText amount={totalPotAmount} size="large" />
          <Text variant="caption" tone="muted">
            {totalCycleHands} mains au total × {formatCurrency(unitAmount)}
          </Text>
        </Card>

        <TextField
          label={isOutOfOrder ? 'Justification (obligatoire)' : 'Motif / justification'}
          value={payoutNote}
          onChangeText={setPayoutNote}
          placeholder="Ex : remise normale du cycle 1"
        />
      </Dialog>

      {/* Reversal */}
      <Dialog
        visible={isReversalModalOpen}
        onClose={() => setIsReversalModalOpen(false)}
        title="Annuler une opération"
        subtitle="Le solde, les mains payées et la couverture de l'adhérent seront recalculés."
        icon="alert"
        tone="danger"
        actions={
          <>
            <Button label="Retour" variant="secondary" onPress={() => setIsReversalModalOpen(false)} style={styles.flexGrow} />
            <Button label="Confirmer l'annulation" variant="danger" onPress={handleConfirmReversal} style={styles.flexGrow} />
          </>
        }
      >
        <TextField
          label="Motif obligatoire"
          value={reversalReason}
          onChangeText={setReversalReason}
          placeholder="Ex : erreur de saisie du montant"
        />
      </Dialog>

      {/* Universal Sensitive Action PIN Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        onCancel={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
        title={pendingActionTitle}
        subtitle={pendingActionSubtitle}
      />
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout }: Theme) =>
  StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    flexShrink: { flex: 1, minWidth: 0 },
    flexGrow: { flexGrow: 1, flexBasis: 0 },
    pressed: { backgroundColor: colors.surfacePressed },
    cardGap: { gap: spacing.sm },
    rowBetween: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },

    identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    infoChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: spacing.xxl,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
    },
    metricsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    progressBlock: { gap: spacing.sm, marginTop: spacing.xs },
    coverageRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
    noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },

    detailRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    detailLabel: { flex: 1 },
    detailValue: { flex: 1.4, textAlign: 'right' },

    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    ledger: { overflow: 'hidden' },
    txIcon: {
      width: spacing.xxl + spacing.sm,
      height: spacing.xxl + spacing.sm,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteBtn: { marginTop: spacing.lg },
    noteBox: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
    },

    stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
    stepperBtn: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    stepperValue: { minWidth: layout.actionHeight, alignItems: 'center' },
  });
