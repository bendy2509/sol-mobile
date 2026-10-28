import React, { useState, useEffect, useMemo } from 'react';
import { View, Pressable, StyleSheet, Alert, Linking, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { getClientById, updateClientDetails, deleteClient, getAllClients } from '@/db/clientRepository';
import { getTransactionsByClient, reverseTransaction } from '@/db/transactionRepository';
import { getActiveBusinessConfig, getCurrentCycleBoundary, getCycleHandsTotal } from '@/db/businessRepository';
import { payoutMemberHand } from '@/db/memberRepository';
import { useAuth } from '@/context/AuthContext';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { ClosedCycleNotice } from '@/components/ClosedCycleLockNotice';
import { MemberScheduleCard } from '@/components/MemberScheduleCard';
import { buildCycleRounds } from '@/services/scheduleService';
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
import { t } from '@/i18n';
import { localDateString, localDayOf } from '@/lib/dates';

/** Display label of a ledger entry (presentation only). */
function getTxTypeLabel(tx: Transaction): string {
  if (tx.type === 'REVERSAL' || tx.isReversed) return t('Annulation');
  if (tx.type === 'SABOTAY_DEPOSIT') return t('Dépôt Sabotay');
  if (tx.type === 'SOL_CONTRIBUTION' || tx.type === 'CONTRIBUTION') return t('Cotisation Sol');
  return t('Remise de la main (bay men)');
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
    // Rounds in the cycle: same count as the dashboard, payouts and statuses (deleted members excluded)
    setDbTotalHands(Math.max(1, await getCycleHandsTotal()));

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

  const unitAmount = business?.contributionAmount || client?.dailyAmount || 250;
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
      Alert.alert(t('Accès Lecture Seule'), t('La modification est réservée aux gestionnaires.'));
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
      Alert.alert(t('Accès Lecture Seule'), t('La modification est réservée aux gestionnaires.'));
      return;
    }
    if (!client) return;
    if (!editFullName.trim()) {
      Alert.alert(t('Erreur'), t('Le nom de l\'adhérent ne peut pas être vide.'));
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
      t('Modifier l\'Adhérent'),
      t('Saisissez votre code PIN gestionnaire (4 chiffres) pour valider la mise à jour de {0} ({1} main(s)).', editFullName, validHands),
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
          Alert.alert(t('Succès'), t('L\'adhérent a été mis à jour avec {0} main(s) (Rangs: #{1}).', validHands, finalRanks));
          setIsEditModalOpen(false);
          await loadClientData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert(t('Erreur'), err?.message ? t(err.message) : t('Échec de la modification.'));
        }
      }
    );
  };

  const handleInitiatePayout = () => {
    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert(t('Accès Lecture Seule'), t('Le décaissement est réservé aux gestionnaires.'));
      return;
    }
    triggerMediumImpact();
    if (!client) return;
    if (client.hasReceivedHand || client.hasReceivedPayout) {
      Alert.alert(
        t('Main Déjà Remise'),
        t('{0} a déjà touché sa main pour ce cycle de SOL. Une deuxième remise nécessite une procédure exceptionnelle.', client.fullName)
      );
    }
    setPayoutNote(`Remise de la main #${client.payoutRank || 1} - ${client.fullName}`);
    setIsPayoutModalOpen(true);
  };

  const handleConfirmPayout = () => {
    if (!client) return;
    if (isOutOfOrder && !payoutNote.trim()) {
      Alert.alert(t('Justification requise'), t('Pour une remise hors ordre normal du SOL, veuillez obligatoirement saisir une justification.'));
      return;
    }
    setIsPayoutModalOpen(false);

    requirePinForAction(
      t('Validation du Décaissement'),
      t('Saisissez votre code PIN pour décaisser la cagnotte de {0} ({1} mains × {2}) à {3}.', formatCurrency(totalPotAmount), totalCycleHands, formatCurrency(unitAmount), client.fullName),
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
              reason: payoutNote.trim() || t('Remise au rang #{0} au lieu du rang attendu #{1}', client.payoutRank, expectedNextRank),
            });
          }

          triggerSuccessFeedback();
          Alert.alert(
            t('Main Remise avec Succès !'),
            t('La main de {0} a été décaissée pour {1}.\n\nCalculée sur la base des {2} mains effectives du cycle.', formatCurrency(totalPotAmount), client.fullName, totalCycleHands),
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
                },
              },
              { text: t('Fermer'), style: 'cancel' },
            ]
          );
          loadClientData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert(t('Erreur'), err?.message || t('Échec du décaissement de la main.'));
        }
      }
    );
  };

  const handleDeleteClient = () => {
    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert(t('Accès Lecture Seule'), t('La suppression est réservée aux gestionnaires.'));
      return;
    }
    if (!client) return;
    triggerMediumImpact();

    Alert.alert(
      t('Supprimer l\'Adhérent'),
      t('Êtes-vous sûr de vouloir supprimer définitivement le dossier de {0} ? Cette action est irréversible.', client.fullName),
      [
        { text: t('Annuler'), style: 'cancel' },
        {
          text: t('Supprimer'),
          style: 'destructive',
          onPress: () => {
            requirePinForAction(
              t('Confirmation de Suppression'),
              t('Saisissez votre code PIN pour supprimer définitivement le dossier de {0}.', client.fullName),
              async () => {
                try {
                  await deleteClient(client.id);
                  triggerSuccessFeedback();
                  Alert.alert(t('Supprimé'), t('Le dossier de l\'adhérent a été supprimé.'), [
                    {
                      text: t('OK'),
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
                  Alert.alert(t('Erreur'), err?.message ? t(err.message) : t('Échec de la suppression.'));
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
      t('Fiche & Reçu : {0}', client.fullName),
      t('Comment souhaitez-vous transmettre le document officiel à l\'adhérent ?'),
      [
        {
          text: t('Envoyer par WhatsApp'),
          onPress: () => {
            const digitsOnly = client.phoneNumber.replace(/[^0-9]/g, '');
            const message = t('Bonjour {0}, voici l\'état certifié de votre compte SOL ({1}) :\n- Total Cotisé : {2}\n- Nombre de Mains : {3} main(s)\n- Rang attribué : Main #{4}\n- Couvert jusqu\'au : {5}\n- Main reçue : {6}\n\nDocument sécurisé et certifié par SOL Mobile.', client.fullName, business?.name || 'SOL Mobile', formatCurrency(client.totalPaidAmount || client.currentBalance), client.paidHandsCount || 0, client.payoutRank || 1, formatDate(client.paidUntilDate || new Date().toISOString()), client.hasReceivedHand || client.hasReceivedPayout ? 'OUI' : 'NON');
            const encoded = encodeURIComponent(message);
            const url = digitsOnly ? `https://wa.me/${digitsOnly}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
            Linking.openURL(url).catch(() => {
              Alert.alert(t('WhatsApp'), t('Impossible d\'ouvrir WhatsApp.'));
            });
          },
        },
        {
          text: t('Télécharger PDF'),
          onPress: async () => {
            try {
              const latestTx = transactions.length > 0 ? transactions[0] : null;
              const unitVal = business?.contributionAmount || client.dailyAmount || 250;
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
                coverageStartDate: localDateString(),
                coverageEndDate: client.paidUntilDate || localDateString(),
                createdAt: latestTx ? latestTx.createdAtLocal : new Date().toISOString(),
              });

              await sharePdfFile(pdfUri, `Fiche_SOL_${client.fullName.replace(/\s+/g, '_')}.pdf`);
            } catch (err: any) {
              Alert.alert(t('Erreur'), t('Impossible de générer le document PDF.'));
            }
          },
        },
        { text: t('Annuler'), style: 'cancel' },
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
          coverageStartDate: localDayOf(selectedTx.createdAtLocal),
          coverageEndDate: localDayOf(selectedTx.createdAtLocal),
          createdAt: selectedTx.createdAtLocal,
        });
      }
      await sharePdfFile(fileUri, `recu_operation_${selectedTx.id.slice(0, 8)}.pdf`);
    } catch (err: any) {
      Alert.alert(t('Erreur'), err?.message || t('Impossible de générer le reçu.'));
    }
  };

  const handleWhatsAppShare = () => {
    if (!selectedTx || !client) return;
    const digitsOnly = normalizePhoneNumber(client.phoneNumber);
    const typeLabel = selectedTx.type === 'SABOTAY_DEPOSIT'
      ? t('Dépôt Sabotay')
      : selectedTx.type === 'SOL_CONTRIBUTION' || selectedTx.type === 'CONTRIBUTION'
      ? t('Cotisation Sol')
      : selectedTx.type === 'REVERSAL' || selectedTx.isReversed
      ? t('Annulation')
      : t('Décaissement Main ("Bay Men")');

    const message = t('*SOL MOBILE - RÉCÉPISSÉ CERTIFIÉ*\nAdhérent : {0}\nOpération : #{1}\nType : {2}\nMontant : {3}\nDate : {4}\n\nReçu archivé avec succès sur SOL Mobile.', client.fullName, selectedTx.id.slice(0, 8), typeLabel, formatCurrency(selectedTx.amount), formatDate(selectedTx.createdAtLocal));
    const encoded = encodeURIComponent(message);
    const url = digitsOnly ? `https://wa.me/${digitsOnly}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(t('WhatsApp'), t('Impossible d\'ouvrir WhatsApp.'));
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
      Alert.alert(t('Motif obligatoire'), t('Veuillez saisir la raison de l\'annulation.'));
      return;
    }
    setIsReversalModalOpen(false);

    requirePinForAction(
      t('Annulation de Transaction'),
      t('Saisissez votre code PIN pour valider l\'annulation de l\'opération #{0} ({1}).', selectedTxForReversal.id.slice(0, 8), formatCurrency(selectedTxForReversal.amount)),
      async () => {
        try {
          await reverseTransaction({
            transactionId: selectedTxForReversal.id,
            reason: reversalReason.trim(),
            userRole: userRole || 'MANAGER',
            collectorId: activeCollector?.id,
          });
          triggerSuccessFeedback();
          Alert.alert(t('Opération Rectifiée'), t('L\'opération a été annulée et le solde/échéance de l\'adhérent a été recalculé.'));
          loadClientData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert(t('Erreur'), err?.message || t('Échec de l\'annulation.'));
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
          <Text variant="bodyStrong">{t('Chargement du dossier adhérent…')}</Text>
        </View>
      </Screen>
    );
  }

  const isMulti = memberHandsCount > 1;
  const detailRows: { label: string; value: string; tone?: 'success' | 'primary' }[] = [
    { label: t('Montant par main'), value: formatCurrency(unitAmount) },
    { label: t('Cagnotte d\'un tirage'), value: formatCurrency(totalPotAmount) },
    { label: t('Total à cotiser sur le cycle'), value: t('{0} ({1} cotisations)', formatCurrency(limits.maxPotAmount), limits.maxAllowedHands) },
    {
      label: t('Total à recevoir'),
      value: t('{0} ({1} tirage{2})', formatCurrency(totalPotAmount * memberHandsCount), memberHandsCount, memberHandsCount > 1 ? 's' : ''),
    },
    { label: t('Tirages perçus'), value: `${currentReceivedHands} / ${memberHandsCount}` },
  ];

  return (
    <Screen
      footer={
        !isReadOnly ? (
          <Button
            size="lg"
            fullWidth
            icon="cash"
            label={t('Encaisser une cotisation')}
            onPress={() => {
              triggerLightImpact();
              router.navigate({ pathname: '/(tabs)/collect', params: { clientId: client.id } } as any);
            }}
          />
        ) : undefined
      }
    >
      <Stack.Screen
        options={{
          headerRight: () =>
            isReadOnly ? null : (
              <ActionMenu
                title={client.fullName}
                items={[
                  { label: t('Modifier l\'adhérent'), icon: 'edit', onPress: handleOpenEditModal },
                  { label: t('Fiche et reçu PDF'), icon: 'printer', onPress: handlePrintOrShare },
                  { label: t('Supprimer l\'adhérent'), icon: 'trash', destructive: true, onPress: handleDeleteClient },
                ]}
              />
            ),
        }}
      />
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
          {isMulti ? t('{0} mains · rangs {1}', memberHandsCount, client.payoutRanks || client.payoutRank) : t('Rang {0}', client.payoutRank || 1)} ·{' '}
          {client.type === 'SABOTAY' ? t('Sabotay') : client.type === 'SOL' ? t('Sol') : client.type}
        </Text>
        {isFullyReceived ? (
          <StatusBadge status="HAND_RECEIVED" appearance="inline" label={isMulti ? t('Toutes les mains reçues ({0}/{1})', memberHandsCount, memberHandsCount) : t('Main reçue')} />
        ) : isMulti && currentReceivedHands > 0 ? (
          <StatusBadge status="HAND_RECEIVED" appearance="inline" label={t('{0}/{1} mains reçues', currentReceivedHands, memberHandsCount)} />
        ) : null}
      </View>

      <StatStrip
        cells={[
          { label: t('Total cotisé'), children: <AmountText amount={client.totalPaidAmount || client.currentBalance} size="medium" /> },
          remainingHands === 0
            ? { label: t('Reste à verser'), value: t('Complété'), tone: 'success', hint: t('Toutes mains réglées') }
            : { label: t('Reste à verser'), tone: 'warning', hint: t('{0} main(s)', remainingHands), children: <AmountText amount={remainingAmount} size="medium" tone="warning" /> },
        ]}
      />

      <Card style={styles.cardGap}>
        <View style={styles.progressBlock}>
          <View style={styles.rowBetween}>
            <Text variant="label">{t('Cotisations :')}{' '}{client.paidHandsCount || 0} / {maxAllowedHands}{' '}{t('mains')}</Text>
            <Text variant="label" tone="muted">
              {memberContributionProgressPct} %
            </Text>
          </View>
          <ProgressBar value={memberContributionProgressPct / 100} accessibilityLabel={t('Progression des cotisations')} />
          <View style={styles.coverageRow}>
            <Icon name="calendar" size={16} color={theme.colors.textMuted} />
            <Text variant="caption" tone="muted">{t('Couvert jusqu\'au')}
            </Text>
            <Text variant="label">{client.paidUntilDate ? formatDateShort(client.paidUntilDate) : t('en attente')}</Text>
          </View>
        </View>
      </Card>

      {business && (
        <MemberScheduleCard
          rounds={buildCycleRounds(business.startDate, business.frequency, totalCycleHands)}
          memberHands={memberHandsCount}
          paidHands={client.paidHandsCount || 0}
          payoutRanks={(client.payoutRanks ? String(client.payoutRanks).split(/[,;\s]+/) : [String(client.payoutRank || '')])
            .map(Number)
            .filter((n) => n > 0)}
        />
      )}

      {/* Payout ("bay men") */}
      {isFullyReceived ? (
        <Card tone="success">
          <View style={styles.noticeRow}>
            <Icon name="check" size={22} color={theme.colors.success} strokeWidth={2.5} />
            <View style={styles.flexShrink}>
              <Text variant="subheading" tone="success">
                {isMulti ? t('Toutes les mains remises ({0}/{1})', memberHandsCount, memberHandsCount) : t('Main déjà remise')}
              </Text>
              <Text variant="body" tone="success">{t('Cagnotte perçue')}{' '}{client.handReceivedDate ? t('le {0}', formatDate(client.handReceivedDate)) : t('pour ce cycle')} ({formatCurrency(totalPotAmount)})
              </Text>
            </View>
          </View>
        </Card>
      ) : !isReadOnly ? (
        <Card style={styles.cardGap}>
          <View style={styles.rowBetween}>
            <Text variant="subheading">{t('Remise de la main')}</Text>
            <AmountText amount={totalPotAmount} size="small" />
          </View>
          <Text variant="caption" tone="muted">
            {t('{0} mains effectives au cycle × {1}', totalCycleHands, formatCurrency(unitAmount))}
          </Text>
          <Button
            icon="payout"
            fullWidth
            variant="secondary"
            label={isMulti ? t('Remettre la main ({0}/{1})', currentReceivedHands + 1, memberHandsCount) : t('Remettre la main')}
            onPress={handleInitiatePayout}
          />
        </Card>
      ) : null}

      {/* Cycle details */}
      <Card style={styles.cardGap}>
        <Text variant="subheading" accessibilityRole="header">
          {isMulti ? t('Cycle · {0} mains souscrites', memberHandsCount) : t('Cycle')}
        </Text>
        {detailRows.map((row) => (
          <View key={row.label} style={styles.detailRow}>
            <Text variant="caption" tone="muted" style={styles.detailLabel}>
              {row.label}
            </Text>
            <Text variant="label" style={styles.detailValue}>
              {row.value}
            </Text>
          </View>
        ))}
      </Card>

      {/* Passbook */}
      <SectionHeader title={t('Historique des opérations')} count={transactions.length} />
      {transactions.length === 0 ? (
        <Card padding="none">
          <EmptyState icon="history" title={t('Aucune opération')} message={t('Aucun versement enregistré pour cet adhérent.')} />
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

      {/* Transaction detail */}
      <BottomSheet
        visible={isDetailModalOpen && !!selectedTx}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedTx ? getTxTypeLabel(selectedTx) : t('Détail de l\'opération')}
        subtitle={selectedTx ? formatDate(selectedTx.createdAtLocal) : undefined}
      >
        {selectedTx && (
          <>
            <AmountText amount={selectedTx.amount} size="hero" />
            {[
              { label: t('Référence'), value: `#${selectedTx.id.slice(0, 8)}` },
              { label: t('Mains couvertes'), value: t('{0} main(s)', selectedTx.handsCovered || 1) },
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
                <Text variant="caption" tone="muted">{t('Note d\'enregistrement')}</Text>
                <Text variant="body" selectable>
                  {selectedTx.note}
                </Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              <Button label={t('Reçu PDF')} icon="printer" variant="secondary" onPress={handleShareReceipt} style={styles.flexGrow} />
              <Button label={t('WhatsApp')} icon="message" variant="secondary" onPress={handleWhatsAppShare} style={styles.flexGrow} />
            </View>

            {selectedTx.type !== 'REVERSAL' && !selectedTx.isReversed && !isReadOnly && isSelectedTxFromClosedCycle && <ClosedCycleNotice />}

            {selectedTx.type !== 'REVERSAL' && !selectedTx.isReversed && !isReadOnly && (
              <Button label={t('Annuler cette opération')} icon="alert" variant="danger" fullWidth onPress={handleInitiateCancel} />
            )}


            {isReadOnly && selectedTx.type !== 'REVERSAL' && !selectedTx.isReversed && (
              <Card tone="sunken">
                <View style={styles.noticeRow}>
                  <Icon name="shield" size={18} color={theme.colors.textMuted} />
                  <Text variant="caption" tone="muted" style={styles.flexShrink}>{t('Mode consultation seule : seul le gestionnaire du carnet peut annuler une opération.')}</Text>
                </View>
              </Card>
            )}
          </>
        )}
      </BottomSheet>

      {/* Edit member */}
      <BottomSheet
        visible={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={t('Modifier l\'adhérent')}
        subtitle={t('Mise à jour des informations de l\'adhérent.')}
        footer={
          <View style={styles.actionsRow}>
            <Button label={t('Annuler')} variant="secondary" onPress={() => setIsEditModalOpen(false)} style={styles.flexGrow} />
            <Button label={t('Enregistrer')} onPress={handleSaveEdit} style={styles.flexGrow} />
          </View>
        }
      >
        <TextField label={t('Nom complet')} value={editFullName} onChangeText={setEditFullName} placeholder={t('Ex : Bendy SERVILUS')} />
        <TextField
          label={t('Numéro de téléphone')}
          value={editPhoneNumber}
          onChangeText={setEditPhoneNumber}
          placeholder={t('+509 XX XX XXXX')}
          keyboardType="phone-pad"
        />

        <View style={styles.cardGap}>
          <View style={styles.rowBetween}>
            <Text variant="label">{t('Mains souscrites')}</Text>
            <Text variant="label" tone="primary">
              {t('{0} / tour', formatCurrency(editHandsCount * unitAmount))}</Text>
          </View>
          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => {
                const next = Math.max(1, editHandsCount - 1);
                setEditHandsCount(next);
                triggerLightImpact();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('Retirer une main')}
              style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
            >
              <Icon name="minus" size={22} color={theme.colors.text} />
            </Pressable>
            <View style={styles.stepperValue}>
              <Text variant="amountLarge" align="center">
                {editHandsCount}
              </Text>
              <Text variant="caption" tone="muted" align="center">{t('main{0}', editHandsCount > 1 ? 's' : '')}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                const next = editHandsCount + 1;
                setEditHandsCount(next);
                triggerLightImpact();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('Ajouter une main')}
              style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
            >
              <Icon name="plus" size={22} color={theme.colors.text} />
            </Pressable>
          </View>
          <Text variant="caption" tone="muted">{t('Ajouter une main à cet enfant augmente automatiquement la cagnotte du sol.')}</Text>
        </View>

        <TextField
          label={t('Rang(s) de tirage')}
          value={editMultiRanks}
          onChangeText={setEditMultiRanks}
          placeholder={t('Ex : 1 ou 1, 4, 7')}
          helper={t('Séparez les rangs par des virgules.')}
        />
      </BottomSheet>

      {/* Payout ("bay men") */}
      <BottomSheet
        visible={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        title={t('Remise de la main')}
        subtitle={t('Validation par code PIN gestionnaire.')}
        footer={
          <View style={styles.actionsRow}>
            <Button label={t('Annuler')} variant="secondary" onPress={() => setIsPayoutModalOpen(false)} style={styles.flexGrow} />
            <Button label={t('Valider avec PIN')} icon="lock" onPress={handleConfirmPayout} style={styles.flexGrow} />
          </View>
        }
      >
        {isOutOfOrder && (
          <Card tone="warning">
            <View style={styles.noticeRow}>
              <Icon name="alert" size={18} color={theme.colors.warning} />
              <Text variant="label" tone="warning" style={styles.flexShrink}>{t('Cette remise ne suit pas l\'ordre prévu (rang #{0} attendu). Justification obligatoire.', expectedNextRank)}</Text>
            </View>
          </Card>
        )}

        <Card tone="sunken" style={styles.cardGap}>
          <Text variant="caption" tone="muted">{t('Bénéficiaire')}</Text>
          <Text variant="bodyStrong">
            {client.fullName} · {client.phoneNumber}
          </Text>
          <Text variant="caption" tone="muted">{t('Cagnotte calculée')}</Text>
          <AmountText amount={totalPotAmount} size="large" />
          <Text variant="caption" tone="muted">
            {t('{0} mains au total × {1}', totalCycleHands, formatCurrency(unitAmount))}
          </Text>
        </Card>

        <TextField
          label={isOutOfOrder ? t('Justification (obligatoire)') : t('Motif / justification')}
          value={payoutNote}
          onChangeText={setPayoutNote}
          placeholder={t('Ex : remise normale du cycle 1')}
        />
      </BottomSheet>

      {/* Reversal */}
      <BottomSheet
        visible={isReversalModalOpen}
        onClose={() => setIsReversalModalOpen(false)}
        title={t('Annuler une opération')}
        subtitle={t('Le solde, les mains payées et la couverture de l\'adhérent seront recalculés.')}
        footer={
          <View style={styles.actionsRow}>
            <Button label={t('Retour')} variant="secondary" onPress={() => setIsReversalModalOpen(false)} style={styles.flexGrow} />
            <Button label={t('Confirmer l\'annulation')} variant="danger" onPress={handleConfirmReversal} style={styles.flexGrow} />
          </View>
        }
      >
        <TextField
          label={t('Motif obligatoire')}
          value={reversalReason}
          onChangeText={setReversalReason}
          placeholder={t('Ex : erreur de saisie du montant')}
        />
      </BottomSheet>

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
    detailLabel: { flex: 1.3 },
    detailValue: { flex: 1, textAlign: 'right' },

    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    ledger: { overflow: 'hidden' },
    txIcon: {
      width: spacing.xxl + spacing.sm,
      height: spacing.xxl + spacing.sm,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
