import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Share,
  TextInput,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getClientById, updateClientDetails, deleteClient, getAllClients } from '@/db/clientRepository';
import { getTransactionsByClient, reverseTransaction } from '@/db/transactionRepository';
import { getActiveBusinessConfig } from '@/db/businessRepository';
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
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function ClientDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeCollector } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);

  // Edit Client Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editRank, setEditRank] = useState('');

  // Payout ("Bay Men") State
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [payoutNote, setPayoutNote] = useState('');

  // Reversal Modal State
  const [isReversalModalOpen, setIsReversalModalOpen] = useState(false);
  const [selectedTxForReversal, setSelectedTxForReversal] = useState<Transaction | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Sensitive PIN Action State
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

  // Exact pot calculation: exactly registered children * unit amount
  const unitAmount = client?.dailyAmount || business?.contributionAmount || 250;
  const registeredCount = allClients.length > 0 ? allClients.length : (business?.totalSlots || 10);
  const totalPotAmount = registeredCount * unitAmount;

  // Determine expected next rank
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
    triggerLightImpact();
    if (!client) return;
    setEditFullName(client.fullName);
    setEditPhoneNumber(client.phoneNumber);
    setEditRank(client.payoutRank ? client.payoutRank.toString() : '1');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
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
      `Saisissez votre code PIN pour décaisser la cagnotte de ${formatCurrency(totalPotAmount)} (${registeredCount} enfants × ${formatCurrency(unitAmount)}) à ${client.fullName}.`,
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
            `La main de ${formatCurrency(totalPotAmount)} a été décaissée pour ${client.fullName}.\n\nCalculée sur la base des ${registeredCount} enfants actuellement inscrits.`,
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
                      registeredChildrenCount: registeredCount,
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
- Main reçue : ${client.hasReceivedHand || client.hasReceivedPayout ? 'OUI ✅' : 'NON ⏳'}

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
    if (!client) return;

    const isReversal = tx.type === 'REVERSAL' || tx.isReversed;

    Alert.alert(
      `Opération #${tx.id.slice(0, 8)}`,
      `Montant : ${formatCurrency(tx.amount)} (${tx.handsCovered || 1} main(s))\nDate : ${formatDate(tx.createdAtLocal)}\nStatut : ${isReversal ? 'ANNULÉE' : 'ACTIVE'}`,
      [
        {
          text: 'Envoyer Reçu WhatsApp',
          onPress: () => {
            const digitsOnly = client.phoneNumber.replace(/[^0-9]/g, '');
            const message = `Bonjour ${client.fullName}, voici votre reçu SOL :
- Opération : #${tx.id.slice(0, 8)}
- Type : ${tx.type}
- Montant : ${formatCurrency(tx.amount)}
- Date : ${formatDate(tx.createdAtLocal)}

Reçu archivé avec succès sur SOL Mobile.`;
            const encoded = encodeURIComponent(message);
            const url = digitsOnly ? `https://wa.me/${digitsOnly}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
            Linking.openURL(url).catch(() => {
              Alert.alert('WhatsApp', 'Impossible d\'ouvrir WhatsApp.');
            });
          },
        },
        !isReversal
          ? {
              text: 'Annuler cette opération',
              style: 'destructive',
              onPress: () => {
                setSelectedTxForReversal(tx);
                setReversalReason('');
                setIsReversalModalOpen(true);
              },
            }
          : { text: 'Fermer', style: 'cancel' },
        { text: 'Fermer', style: 'cancel' },
      ]
    );
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
      `Saisissez votre code PIN pour annuler la transaction #${selectedTxForReversal.id.slice(0, 8)} (${formatCurrency(selectedTxForReversal.amount)}).`,
      async () => {
        try {
          await reverseTransaction({
            transactionId: selectedTxForReversal.id,
            reason: reversalReason.trim(),
          });
          triggerSuccessFeedback();
          Alert.alert('Annulation Réussie', "L'opération a été annulée et le solde/échéance de l'adhérent a été recalculé.");
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
        {/* Profile Card */}
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
                {client.payoutRank && (
                  <View style={styles.rankBadge}>
                    <Icon name="crown" size={11} color="#1D4ED8" style={{ marginRight: 3 }} />
                    <Text style={styles.rankBadgeText}>Main #{client.payoutRank}</Text>
                  </View>
                )}
                {client.hasReceivedPayout || client.hasReceivedHand ? (
                  <View style={styles.handReceivedBadge}>
                    <Text style={styles.handReceivedBadgeText}>MAIN TOUCHÉE ✅</Text>
                  </View>
                ) : (
                  <View style={styles.handPendingBadge}>
                    <Text style={styles.handPendingBadgeText}>MAIN EN ATTENTE ⏳</Text>
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
            <View style={styles.coverageItem}>
              <Text style={styles.coverageLabel}>TOTAL MAINS PAYÉES</Text>
              <Text style={styles.coverageValueGreen}>{client.paidHandsCount || 0} main(s)</Text>
            </View>
          </View>

          {/* Quick Metrics */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>COTISÉ AU TOTAL</Text>
              <Text style={styles.metricValue}>
                {formatCurrency(client.totalPaidAmount || client.currentBalance)}
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>VALEUR D'UNE MAIN</Text>
              <Text style={styles.metricValue}>{formatCurrency(unitAmount)}</Text>
            </View>
          </View>
        </View>

        {/* Action Button: Bay Men */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleInitiatePayout}
          style={styles.payoutButton}
        >
          <View style={styles.payoutBtnLeft}>
            <View style={styles.payoutIconCircle}>
              <Icon name="crown" size={18} color="#FFFFFF" />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.payoutBtnTitle}>Donner la Main ("Bay Men")</Text>
              <Text style={styles.payoutBtnSub}>
                Cagnotte : {formatCurrency(totalPotAmount)} ({registeredCount} enfants inscrits)
              </Text>
            </View>
          </View>
          <Icon name="arrow-right" size={16} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Primary Action Buttons */}
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
            <Icon name="print" size={16} color={SOL_COLORS.textPrimary} style={{ marginRight: 4 }} />
            <Text style={styles.actionBtnSecondaryText}>Fiche</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleDeleteClient}
            style={styles.actionBtnDanger}
          >
            <Icon name="close" size={14} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {/* Individual Passbook Ledger */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            HISTORIQUE DES VERSEMENTS ({transactions.length})
          </Text>
        </View>

        {transactions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="history" size={28} color="#94A3B8" />
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
                activeOpacity={0.7}
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
                      color={isReversal ? '#DC2626' : isDeposit ? '#059669' : '#D97706'}
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

      {/* Payout ("Bay Men") Modal */}
      <Modal
        visible={isPayoutModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPayoutModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Remise de la Main ("Bay Men")</Text>
            <Text style={styles.modalSub}>
              Le gestionnaire peut donner la main à tout moment à cet adhérent.
            </Text>

            {isOutOfOrder && (
              <View style={styles.outOfOrderWarning}>
                <Icon name="shield" size={14} color="#D97706" style={{ marginRight: 6 }} />
                <Text style={styles.outOfOrderWarningText}>
                  ⚠️ ATTENTION : Cette remise ne correspond pas à l'ordre normal prévu du SOL (Rang attendu : #{expectedNextRank}). Une justification est obligatoire.
                </Text>
              </View>
            )}

            <View style={styles.payoutDetailCard}>
              <Text style={styles.payoutDetailLabel}>BÉNÉFICIAIRE :</Text>
              <Text style={styles.payoutDetailName}>{client.fullName} ({client.phoneNumber})</Text>

              <Text style={[styles.payoutDetailLabel, { marginTop: 8 }]}>MONTANT TOTAL CALCULÉ :</Text>
              <Text style={styles.payoutDetailAmount}>{formatCurrency(totalPotAmount)}</Text>
              <Text style={styles.payoutDetailFormula}>
                Basé sur {registeredCount} enfants inscrits × {formatCurrency(unitAmount)}
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>MOTIF / JUSTIFICATION OBLIGATOIRE</Text>
              <TextInput
                style={styles.formInput}
                value={payoutNote}
                onChangeText={setPayoutNote}
                placeholder="Ex: Urgence médicale / Accord exceptionnel"
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setIsPayoutModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmPayout}
                style={styles.modalPayoutConfirmBtn}
              >
                <Icon name="shield" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalPayoutConfirmBtnText}>Valider PIN (Bay Men)</Text>
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
            <Text style={styles.modalTitle}>Annuler une Transaction</Text>
            <Text style={styles.modalSub}>
              L'annulation ajustera le solde, diminuera le nombre de mains payées et recalculera la date de couverture de l'adhérent.
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>MOTIF OBLIGATOIRE DE L'ANNULATION</Text>
              <TextInput
                style={styles.formInput}
                value={reversalReason}
                onChangeText={setReversalReason}
                placeholder="Ex: Erreur de saisie / Doublon"
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setIsReversalModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Fermer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmReversal}
                style={styles.modalDangerBtn}
              >
                <Text style={styles.modalDangerBtnText}>Confirmer avec PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Client Modal */}
      <Modal
        visible={isEditModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Modifier l'Adhérent</Text>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>NOM COMPLET DE L'ADHÉRENT</Text>
              <TextInput style={styles.formInput} value={editFullName} onChangeText={setEditFullName} placeholder="Nom complet" />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>NUMÉRO DE TÉLÉPHONE (+509...)</Text>
              <TextInput style={styles.formInput} value={editPhoneNumber} onChangeText={setEditPhoneNumber} keyboardType="phone-pad" />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>POSITION / RANG DE MAIN</Text>
              <TextInput style={styles.formInput} value={editRank} onChangeText={setEditRank} keyboardType="numeric" />
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={() => setIsEditModalOpen(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveEdit} style={styles.modalPayoutConfirmBtn}>
                <Text style={styles.modalPayoutConfirmBtnText}>Valider avec PIN</Text>
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 14, color: '#64748B' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 14,
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
  },
  avatarText: { fontSize: 20, fontWeight: '900', color: SOL_COLORS.primary },
  profileInfo: { flex: 1 },
  fullName: { fontSize: 18, fontWeight: '900', color: SOL_COLORS.textPrimary },
  phoneNumber: { fontSize: 13, color: '#64748B', fontWeight: '600', marginTop: 1 },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  rankBadgeText: { fontSize: 10, fontWeight: '800', color: '#1D4ED8' },
  handReceivedBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  handReceivedBadgeText: { fontSize: 9, fontWeight: '900', color: '#059669' },
  handPendingBadge: { backgroundColor: '#FFFBEB', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  handPendingBadgeText: { fontSize: 9, fontWeight: '900', color: '#D97706' },
  coverageRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  coverageItem: { flex: 1, alignItems: 'center' },
  coverageLabel: { fontSize: 8, fontWeight: '900', color: '#64748B', letterSpacing: 0.5 },
  coverageValue: { fontSize: 13, fontWeight: '800', color: SOL_COLORS.textPrimary, marginTop: 2 },
  coverageValueGreen: { fontSize: 13, fontWeight: '900', color: '#059669', marginTop: 2 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricItem: { flex: 1, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  metricLabel: { fontSize: 8, fontWeight: '900', color: '#64748B' },
  metricValue: { fontSize: 14, fontWeight: '900', color: SOL_COLORS.textPrimary, marginTop: 2 },
  payoutButton: {
    backgroundColor: SOL_COLORS.primary,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  payoutBtnLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  payoutIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  payoutBtnTitle: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
  payoutBtnSub: { fontSize: 11, color: '#E0E7FF', marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  actionBtnPrimary: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionBtnPrimaryText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  actionBtnSecondary: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  actionBtnSecondaryText: { fontSize: 12, fontWeight: '700', color: SOL_COLORS.textPrimary },
  actionBtnDanger: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  sectionHeader: { marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: '#64748B', letterSpacing: 0.5 },
  emptyCard: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptyText: { fontSize: 12, color: '#94A3B8', marginTop: 8 },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  txRowReversed: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  txLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  txIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  txIconDeposit: { backgroundColor: '#ECFDF5' },
  txIconWithdraw: { backgroundColor: '#FFFBEB' },
  txIconReversal: { backgroundColor: '#FEF2F2' },
  txTypeName: { fontSize: 13, fontWeight: '800', color: SOL_COLORS.textPrimary },
  txDate: { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 13, fontWeight: '900' },
  txAmountDeposit: { color: '#059669' },
  txAmountWithdraw: { color: '#D97706' },
  txAmountReversal: { color: '#DC2626' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: SOL_COLORS.textPrimary, marginBottom: 4 },
  modalSub: { fontSize: 12, color: '#64748B', marginBottom: 14 },
  outOfOrderWarning: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
    alignItems: 'center',
  },
  outOfOrderWarningText: { fontSize: 11, color: '#B45309', fontWeight: '700', flex: 1 },
  payoutDetailCard: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  payoutDetailLabel: { fontSize: 9, fontWeight: '800', color: '#64748B' },
  payoutDetailName: { fontSize: 14, fontWeight: '900', color: SOL_COLORS.textPrimary, marginTop: 1 },
  payoutDetailAmount: { fontSize: 20, fontWeight: '900', color: SOL_COLORS.primary, marginTop: 2 },
  payoutDetailFormula: { fontSize: 10, color: '#64748B', marginTop: 2 },
  formGroup: { marginBottom: 12 },
  formLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', marginBottom: 4 },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
    color: SOL_COLORS.textPrimary,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' },
  modalCancelBtnText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  modalPayoutConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: SOL_COLORS.primary, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  modalPayoutConfirmBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  modalDangerBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center' },
  modalDangerBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
});
