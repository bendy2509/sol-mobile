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
import { getTransactionsByClient } from '@/db/transactionRepository';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { payoutMemberHand } from '@/db/memberRepository';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { BusinessConfig, Client, Transaction } from '@/types';
import { formatCurrency, formatDate, formatDateShort, formatShortId, getInitials } from '@/lib/formatters';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { generateContributionReceiptPdf, generatePayoutReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function ClientDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeCollector } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [allClientsCount, setAllClientsCount] = useState<number>(0);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Edit Client Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editRank, setEditRank] = useState('');

  // Payout ("Bay Men") State
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [payoutNote, setPayoutNote] = useState('');

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
    setAllClientsCount(clientList.length);

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
  const registeredCount = allClientsCount > 0 ? allClientsCount : (business?.totalSlots || 10);
  const totalPotAmount = registeredCount * unitAmount;

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
    setPayoutNote(`Remise de la main #${client.payoutRank || 1} - ${client.fullName}`);
    setIsPayoutModalOpen(true);
  };

  const handleConfirmPayout = () => {
    if (!client) return;
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
- Position : Main #${client.payoutRank || 1}
- Solde Cotisé : ${formatCurrency(client.currentBalance)}
- Cagnotte de la main : ${formatCurrency(totalPotAmount)} (${registeredCount} enfants inscrits)
- Statut Main : ${client.hasReceivedPayout ? 'Main déjà perçue' : 'En attente de perception'}

Merci de votre fidélité sur SOL Mobile !`;

            const encoded = encodeURIComponent(message);
            const url = digitsOnly ? `https://wa.me/${digitsOnly}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
            Linking.openURL(url).catch(() => {
              Alert.alert('WhatsApp', 'Impossible d\'ouvrir WhatsApp.');
            });
          },
        },
        {
          text: 'Télécharger Fiche / Reçu PDF',
          onPress: async () => {
            try {
              const latestTx = transactions[0];
              const unitVal = unitAmount > 0 ? unitAmount : 250;
              const hands = latestTx ? (latestTx.handsCovered || 1) : 1;
              const totalVal = latestTx ? latestTx.amount : client.currentBalance;

              const pdfUri = await generateContributionReceiptPdf({
                transactionId: latestTx ? latestTx.id : client.id,
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
                coverageEndDate: new Date().toISOString().split('T')[0],
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

    Alert.alert(
      `Opération #${tx.id.slice(0, 8)}`,
      `Montant : ${formatCurrency(tx.amount)} (${tx.handsCovered || 1} main(s))\nDate : ${formatDate(tx.createdAtLocal)}`,
      [
        {
          text: 'Envoyer par WhatsApp',
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
        {
          text: 'Télécharger Reçu PDF',
          onPress: async () => {
            try {
              const isPayout = tx.type === 'SOL_PAYOUT' || tx.type === 'HAND_PAYOUT' || tx.type === 'WITHDRAWAL';
              let pdfUri: string;
              if (isPayout) {
                pdfUri = await generatePayoutReceiptPdf({
                  transactionId: tx.id,
                  businessName: business?.name || 'SOL Mobile',
                  collectorName: activeCollector?.fullName || 'Agent SOL',
                  collectorPhone: activeCollector?.phoneNumber || '+509 XX XX XXXX',
                  collectorZone: activeCollector?.zone,
                  clientName: client.fullName,
                  clientPhone: client.phoneNumber,
                  payoutRank: client.payoutRank || undefined,
                  totalPotAmount: tx.amount,
                  registeredChildrenCount: registeredCount,
                  unitAmount,
                  note: tx.note,
                  createdAt: tx.createdAtLocal,
                });
              } else {
                pdfUri = await generateContributionReceiptPdf({
                  transactionId: tx.id,
                  businessName: business?.name || 'SOL Mobile',
                  collectorName: activeCollector?.fullName || 'Agent SOL',
                  collectorPhone: activeCollector?.phoneNumber || '+509 XX XX XXXX',
                  collectorZone: activeCollector?.zone,
                  clientName: client.fullName,
                  clientPhone: client.phoneNumber,
                  payoutRank: client.payoutRank || undefined,
                  qrCodeToken: client.qrCodeToken,
                  unitAmount,
                  handsCount: tx.handsCovered || 1,
                  totalAmount: tx.amount,
                  coverageStartDate: tx.createdAtLocal.split('T')[0],
                  coverageEndDate: tx.createdAtLocal.split('T')[0],
                  createdAt: tx.createdAtLocal,
                });
              }
              await sharePdfFile(pdfUri, `Recu_SOL_${client.fullName.replace(/\s+/g, '_')}.pdf`);
            } catch {
              Alert.alert('Erreur', 'Impossible de générer le reçu PDF.');
            }
          },
        },
        { text: 'Fermer', style: 'cancel' },
      ]
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
                {client.hasReceivedPayout ? (
                  <View style={styles.paidOutBadge}>
                    <Icon name="check" size={11} color="#15803D" style={{ marginRight: 3 }} />
                    <Text style={styles.paidOutBadgeText}>Main Décaissée</Text>
                  </View>
                ) : (
                  <View style={styles.pendingPayoutBadge}>
                    <Text style={styles.pendingPayoutBadgeText}>Main en Attente</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* QR Code & ID Info Box */}
          <View style={styles.qrBox}>
            <View style={styles.qrLeft}>
              <Icon name="scan" size={24} color={SOL_COLORS.secondary} />
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.qrLabel}>KÒD ID ADHÉRENT</Text>
                <Text style={styles.qrToken}>{client.qrCodeToken}</Text>
              </View>
            </View>
            <Text style={styles.idSub}>ID: {formatShortId(client.id)}</Text>
          </View>
        </View>

        {/* Financial Summary */}
        <View style={styles.balanceSection}>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>SOLDE COTISÉ</Text>
            <Text style={styles.balanceAmount}>
              {formatCurrency(client.currentBalance)}
            </Text>
          </View>

          <View style={styles.dailyCard}>
            <Text style={styles.dailyLabel}>VALEUR DE LA MAIN ({registeredCount} enf.)</Text>
            <Text style={styles.dailyAmount}>
              {formatCurrency(totalPotAmount)}
            </Text>
          </View>
        </View>

        {/* Primary Action: Disburse Hand (Bay Men) & Collect */}
        <View style={styles.payoutActionBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.payoutBannerTitle}>
              {client.hasReceivedPayout ? 'Main déjà décaissée' : 'Décaisser la main ("Bay Men")'}
            </Text>
            <Text style={styles.payoutBannerSub}>
              Cagnotte : {formatCurrency(totalPotAmount)} ({registeredCount} enfants inscrits × {formatCurrency(unitAmount)})
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleInitiatePayout}
            style={[
              styles.payoutBannerBtn,
              client.hasReceivedPayout && styles.payoutBannerBtnCompleted,
            ]}
          >
            <Icon name="shield" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.payoutBannerBtnText}>
              {client.hasReceivedPayout ? 'Re-décaisser' : 'Bay Men'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Secondary Action Buttons Row */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              triggerLightImpact();
              router.push({
                pathname: '/(tabs)/collect',
                params: { clientId: client.id },
              } as any);
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
            return (
              <TouchableOpacity
                key={tx.id}
                activeOpacity={0.7}
                onPress={() => handleTransactionPress(tx)}
                style={styles.txRow}
              >
                <View style={styles.txLeft}>
                  <View
                    style={[
                      styles.txIcon,
                      isDeposit ? styles.txIconDeposit : styles.txIconWithdraw,
                    ]}
                  >
                    <Icon
                      name={isDeposit ? 'arrow-right' : 'arrow-left'}
                      size={14}
                      color={isDeposit ? '#059669' : '#DC2626'}
                    />
                  </View>
                  <View>
                    <Text style={styles.txTypeName}>
                      {tx.type === 'SABOTAY_DEPOSIT'
                        ? 'Dépôt Sabotay'
                        : tx.type === 'SOL_CONTRIBUTION' || tx.type === 'CONTRIBUTION'
                        ? 'Cotisation Sol'
                        : tx.type === 'SOL_PAYOUT' || tx.type === 'HAND_PAYOUT'
                        ? 'Décaissement Main ("Bay Men")'
                        : 'Retrait'}
                    </Text>
                    <Text style={styles.txDate}>{formatDate(tx.createdAtLocal)}</Text>
                  </View>
                </View>

                <View style={styles.txRight}>
                  <Text
                    style={[
                      styles.txAmount,
                      isDeposit ? styles.txAmountDeposit : styles.txAmountWithdraw,
                    ]}
                  >
                    {isDeposit ? '+' : '-'} {formatCurrency(tx.amount)}
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
              <Text style={styles.formLabel}>MOTIF / NOTE DU DÉCAISSEMENT</Text>
              <TextInput
                style={styles.formInput}
                value={payoutNote}
                onChangeText={setPayoutNote}
                placeholder="Ex: Main de Février remise en main propre"
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
            <Text style={styles.modalSub}>
              Ajustez le nom, le numéro de téléphone ou le numéro de main attribué.
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>NOM COMPLET DE L'ADHÉRENT</Text>
              <TextInput
                style={styles.formInput}
                value={editFullName}
                onChangeText={setEditFullName}
                placeholder="Nom complet"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>NUMÉRO DE TÉLÉPHONE (+509...)</Text>
              <TextInput
                style={styles.formInput}
                value={editPhoneNumber}
                onChangeText={setEditPhoneNumber}
                placeholder="+509 XX XX XXXX"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>POSITION / RANG DE MAIN</Text>
              <TextInput
                style={styles.formInput}
                value={editRank}
                onChangeText={setEditRank}
                placeholder="1"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setIsEditModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveEdit}
                style={styles.modalSaveBtn}
              >
                <Text style={styles.modalSaveBtnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Universal 4-Digit PIN Security Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title={pendingActionTitle || 'Validation Requise'}
        subtitle={pendingActionSubtitle || 'Veuillez saisir votre code PIN gestionnaire (4 chiffres) pour confirmer cette opération.'}
        onSuccess={handlePinSuccess}
        onCancel={() => {
          setIsPinModalOpen(false);
          setPendingActionCallback(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 12,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  fullName: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  phoneNumber: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
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
  rankBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  paidOutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  paidOutBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  pendingPayoutBadge: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingPayoutBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  qrBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qrLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  qrToken: {
    fontSize: 13,
    fontWeight: '900',
    color: SOL_COLORS.secondary,
  },
  idSub: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
  },
  balanceSection: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  balanceLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
    marginTop: 2,
  },
  dailyCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  dailyLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  dailyAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.primary,
    marginTop: 2,
  },
  payoutActionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 12,
  },
  payoutBannerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#065F46',
  },
  payoutBannerSub: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '600',
    marginTop: 2,
  },
  payoutBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  payoutBannerBtnCompleted: {
    backgroundColor: '#0D9488',
  },
  payoutBannerBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  actionBtnPrimary: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    height: 44,
    borderRadius: 12,
  },
  actionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  actionBtnSecondary: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  actionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  actionBtnDanger: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  sectionHeader: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  txIconDeposit: {
    backgroundColor: '#ECFDF5',
  },
  txIconWithdraw: {
    backgroundColor: '#FEF2F2',
  },
  txTypeName: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  txDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '900',
  },
  txAmountDeposit: {
    color: '#059669',
  },
  txAmountWithdraw: {
    color: '#DC2626',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 12,
  },
  payoutDetailCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 12,
  },
  payoutDetailLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  payoutDetailName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#065F46',
    marginTop: 1,
  },
  payoutDetailAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#059669',
    marginTop: 2,
  },
  payoutDetailFormula: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '600',
    marginTop: 2,
  },
  formGroup: {
    marginBottom: 10,
  },
  formLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    height: 42,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSaveBtn: {
    flex: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    backgroundColor: SOL_COLORS.primary,
  },
  modalSaveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalPayoutConfirmBtn: {
    flex: 1.8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  modalPayoutConfirmBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
