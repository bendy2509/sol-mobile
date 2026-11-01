import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { deleteClient, getAllClients, getClientById, updateClientDetails } from '@/db/clientRepository';
import { getContributionCoverage, getTransactionsByClient, reverseTransaction } from '@/db/transactionRepository';
import { getActiveBusinessConfig, getCurrentCycleBoundary, getCycleHandsTotal } from '@/db/businessRepository';
import { payoutMemberHand } from '@/db/memberRepository';
import { useAuth } from '@/context/AuthContext';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { MemberScheduleCard } from '@/components/MemberScheduleCard';
import { MemberIdentity } from '@/components/member/MemberIdentity';
import { MemberContribution } from '@/components/member/MemberContribution';
import { MemberPayoutCard } from '@/components/member/MemberPayoutCard';
import { MemberCycleDetails } from '@/components/member/MemberCycleDetails';
import { MemberLedger, ledgerEntryLabel } from '@/components/member/MemberLedger';
import { EditMemberSheet, MemberEditValues, PayoutSheet, ReversalSheet, TransactionDetailSheet } from '@/components/member/MemberSheets';
import { ActionMenu, Button, Screen, Text } from '@/components/ui';
import { BusinessConfig, Client, Transaction } from '@/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { triggerErrorFeedback, triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { localDateString, localDayOf } from '@/lib/dates';
import { generateContributionReceiptPdf, generateMemberStatementPdf, generatePayoutReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { recordAuditLog } from '@/services/auditService';
import { isTransactionFromClosedCycle } from '@/services/financialService';
import { buildMemberSheet, editableRanks, ledgerEntryKind, ranksToSave } from '@/services/memberSheet';
import { useTheme } from '@/theme';
import { t } from '@/i18n';

/**
 * Member sheet. Figures come from services/memberSheet.ts (one computation for the whole
 * screen); the sections are components/member/*. This screen loads, acts and composes.
 */
export default function ClientDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeCollector } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [cycleHands, setCycleHands] = useState(0);
  const [cycleBoundary, setCycleBoundary] = useState<string | null>(null);

  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [txToReverse, setTxToReverse] = useState<Transaction | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);

  // Every sensitive action goes through the PIN
  const [pinRequest, setPinRequest] = useState<{ title: string; subtitle: string; run: () => Promise<void> } | null>(null);
  const requirePin = (title: string, subtitle: string, run: () => Promise<void>) => setPinRequest({ title, subtitle, run });

  const loadClientData = async () => {
    if (!id) return;
    const [data, txs, activeBiz, clientList, boundary, hands] = await Promise.all([
      getClientById(id),
      getTransactionsByClient(id),
      getActiveBusinessConfig(),
      getAllClients(),
      getCurrentCycleBoundary(),
      getCycleHandsTotal(),
    ]);
    setClient(data);
    setTransactions(txs);
    setBusiness(activeBiz);
    setAllClients(clientList);
    setCycleBoundary(boundary);
    setCycleHands(hands);
  };

  useEffect(() => {
    loadClientData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sheet = useMemo(
    () =>
      client
        ? buildMemberSheet({ client, allClients, business, totalCycleHands: cycleHands, transactions, cycleBoundary, todayStr: localDateString() })
        : null,
    [client, allClients, business, cycleHands, transactions, cycleBoundary]
  );

  if (!client || !sheet) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="bodyStrong">{t('Chargement du dossier adhérent…')}</Text>
        </View>
      </Screen>
    );
  }

  const collectorName = activeCollector?.fullName || 'Bendy SERVILUS';
  const collectorPhone = activeCollector?.phoneNumber || '';

  // ---- Edit ----------------------------------------------------------------------------------
  const handleSaveEdit = (values: MemberEditValues) => {
    if (!values.fullName.trim()) {
      Alert.alert(t('Erreur'), t('Le nom de l\'adhérent ne peut pas être vide.'));
      return;
    }
    const hands = Math.max(1, values.handsCount);
    const ranks = ranksToSave(values.ranks, sheet.payoutRanks[0] || 1, hands);
    requirePin(
      t('Modifier l\'Adhérent'),
      t('Saisissez votre code PIN gestionnaire (4 chiffres) pour valider la mise à jour de {0} ({1} main(s)).', values.fullName, hands),
      async () => {
        try {
          await updateClientDetails(client.id, {
            fullName: values.fullName.trim(),
            phoneNumber: normalizePhoneNumber(values.phoneNumber),
            payoutRank: Number(ranks.split(/[,;\s]+/)[0]) || 1,
            payoutRanks: ranks,
            handsCount: hands,
          });
          triggerSuccessFeedback();
          Alert.alert(t('Succès'), t('L\'adhérent a été mis à jour avec {0} main(s) (Rangs: #{1}).', hands, ranks));
          setIsEditOpen(false);
          await loadClientData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert(t('Erreur'), err?.message ? t(err.message) : t('Échec de la modification.'));
        }
      }
    );
  };

  // ---- Payout --------------------------------------------------------------------------------
  const handleConfirmPayout = (note: string) => {
    if (sheet.isOutOfOrder && !note.trim()) {
      Alert.alert(t('Justification requise'), t('Pour une remise hors ordre normal du SOL, veuillez obligatoirement saisir une justification.'));
      return;
    }
    setIsPayoutOpen(false);
    requirePin(
      t('Validation du Décaissement'),
      t('Saisissez votre code PIN pour décaisser la cagnotte de {0} ({1} mains × {2}) à {3}.', formatCurrency(sheet.potAmount), sheet.totalCycleHands, formatCurrency(sheet.unitAmount), client.fullName),
      async () => {
        try {
          const tx = await payoutMemberHand(client.id, sheet.potAmount, note.trim() || `Remise de la main du SOL pour ${client.fullName}`, business?.id);
          if (sheet.isOutOfOrder) {
            await recordAuditLog({
              userId: activeCollector?.id || 'collector',
              userRole: 'MANAGER',
              action: 'PAYOUT_OUT_OF_ORDER',
              entityType: 'TRANSACTION',
              entityId: tx.id,
              reason: note.trim() || t('Remise au rang #{0} au lieu du rang attendu #{1}', sheet.payoutRanks[sheet.receivedHands], sheet.expectedNextRank),
            });
          }
          triggerSuccessFeedback();
          Alert.alert(
            t('Main Remise avec Succès !'),
            t('La main de {0} a été décaissée pour {1}.\n\nCalculée sur la base des {2} mains effectives du cycle.', formatCurrency(tx.amount), client.fullName, sheet.totalCycleHands),
            [
              {
                text: t('Télécharger Reçu PDF'),
                onPress: async () => {
                  try {
                    const pdfUri = await generatePayoutReceiptPdf({
                      transactionId: tx.id,
                      businessName: business?.name || 'SOL Mobile',
                      collectorName,
                      collectorPhone,
                      collectorZone: activeCollector?.zone,
                      clientName: client.fullName,
                      clientPhone: client.phoneNumber,
                      payoutRank: client.payoutRank || undefined,
                      totalPotAmount: tx.amount,
                      registeredChildrenCount: sheet.totalCycleHands,
                      unitAmount: sheet.unitAmount,
                      note: note.trim(),
                      createdAt: tx.createdAtLocal,
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

  // ---- Delete --------------------------------------------------------------------------------
  const handleDeleteClient = () => {
    triggerMediumImpact();
    Alert.alert(
      t('Supprimer l\'Adhérent'),
      t('Êtes-vous sûr de vouloir supprimer définitivement le dossier de {0} ? Cette action est irréversible.', client.fullName),
      [
        { text: t('Annuler'), style: 'cancel' },
        {
          text: t('Supprimer'),
          style: 'destructive',
          onPress: () =>
            requirePin(t('Confirmation de Suppression'), t('Saisissez votre code PIN pour supprimer définitivement le dossier de {0}.', client.fullName), async () => {
              try {
                await deleteClient(client.id);
                triggerSuccessFeedback();
                Alert.alert(t('Supprimé'), t('Le dossier de l\'adhérent a été supprimé.'), [
                  { text: t('OK'), onPress: () => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)) },
                ]);
              } catch (err: any) {
                triggerErrorFeedback();
                Alert.alert(t('Erreur'), err?.message ? t(err.message) : t('Échec de la suppression.'));
              }
            }),
        },
      ]
    );
  };

  // ---- Statement and receipts ----------------------------------------------------------------------
  const shareStatement = async () => {
    try {
      if (!business) throw new Error('no business');
      const pdfUri = await generateMemberStatementPdf({
        businessName: business.name,
        collectorName,
        collectorPhone,
        collectorZone: activeCollector?.zone,
        clientName: client.fullName,
        clientPhone: client.phoneNumber,
        qrCodeToken: client.qrCodeToken,
        payoutRanks: sheet.payoutRanks,
        handsCount: sheet.memberHands,
        unitAmount: sheet.unitAmount,
        cycleStartDate: business.startDate,
        cycleEndDate: sheet.rounds[sheet.rounds.length - 1] || business.endDate,
        rounds: sheet.schedule.rounds,
        paidUntilDate: sheet.schedule.paidUntilDate,
        nextDueDate: sheet.schedule.nextDueDate,
        totalPaid: client.totalPaidAmount || 0,
        totalDue: sheet.schedule.totalDueHands * sheet.unitAmount,
        lateHands: sheet.schedule.lateHands,
        payouts: sheet.payoutCalendar.map((r) => ({ round: r.round, date: r.date, receivedOn: r.receivedOn })),
        operations: sheet.cycleOperations
          .filter((tx) => tx.type !== 'REVERSAL')
          .map((tx) => {
            const payout = ledgerEntryKind({ ...tx, isReversed: false }) === 'PAYOUT';
            return {
              date: localDayOf(tx.createdAtLocal),
              label: payout ? 'Remise de la main' : 'Cotisation',
              amount: tx.amount,
              hands: payout ? 0 : tx.handsCovered || 0,
              ref: tx.id.slice(0, 8).toUpperCase(),
              reversed: Boolean(tx.isReversed),
            };
          }),
        generatedAt: new Date().toISOString(),
      });
      await sharePdfFile(pdfUri, `Releve_SOL_${client.fullName.replace(/\s+/g, '_')}.pdf`);
    } catch {
      Alert.alert(t('Erreur'), t('Impossible de générer le document PDF.'));
    }
  };

  const shareAccountOnWhatsApp = () => {
    const digitsOnly = client.phoneNumber.replace(/[^0-9]/g, '');
    const message = t(
      'Bonjour {0}, voici l\'état certifié de votre compte SOL ({1}) :\n- Total Cotisé : {2}\n- Nombre de Mains : {3} main(s)\n- Rang attribué : Main #{4}\n- Couvert jusqu\'au : {5}\n- Main reçue : {6}\n\nDocument sécurisé et certifié par SOL Mobile.',
      client.fullName,
      business?.name || 'SOL Mobile',
      formatCurrency(client.totalPaidAmount || 0),
      sheet.paidHands,
      sheet.payoutRanks[0] || 1,
      sheet.schedule.paidUntilDate ? formatDate(sheet.schedule.paidUntilDate) : '—',
      sheet.isFullyReceived ? 'OUI' : 'NON'
    );
    const encoded = encodeURIComponent(message);
    Linking.openURL(digitsOnly ? `https://wa.me/${digitsOnly}?text=${encoded}` : `https://wa.me/?text=${encoded}`).catch(() =>
      Alert.alert(t('WhatsApp'), t('Impossible d\'ouvrir WhatsApp.'))
    );
  };

  const handlePrintOrShare = () => {
    triggerMediumImpact();
    Alert.alert(t('Fiche & Reçu : {0}', client.fullName), t('Comment souhaitez-vous transmettre le document officiel à l\'adhérent ?'), [
      { text: t('Envoyer par WhatsApp'), onPress: shareAccountOnWhatsApp },
      { text: t('Télécharger PDF'), onPress: shareStatement },
      { text: t('Annuler'), style: 'cancel' },
    ]);
  };

  const handleShareReceipt = async () => {
    if (!selectedTx) return;
    try {
      const fileUri =
        ledgerEntryKind({ ...selectedTx, isReversed: false }) === 'PAYOUT'
          ? await generatePayoutReceiptPdf({
              transactionId: selectedTx.id,
              businessName: business?.name || 'SOL Mobile',
              collectorName,
              collectorPhone,
              collectorZone: activeCollector?.zone,
              clientName: client.fullName,
              clientPhone: client.phoneNumber,
              payoutRank: client.payoutRank || undefined,
              totalPotAmount: selectedTx.amount,
              registeredChildrenCount: sheet.totalCycleHands,
              unitAmount: sheet.unitAmount,
              note: selectedTx.note,
              createdAt: selectedTx.createdAtLocal,
            })
          : await (async () => {
              // Rounds this collection paid (cycle calendar), not the day it was recorded
              const coverage = await getContributionCoverage(selectedTx.id);
              return generateContributionReceiptPdf({
                transactionId: selectedTx.id,
                businessName: business?.name || 'SOL Mobile',
                collectorName,
                collectorPhone,
                collectorZone: activeCollector?.zone,
                clientName: client.fullName,
                clientPhone: client.phoneNumber,
                payoutRank: client.payoutRank || undefined,
                qrCodeToken: client.qrCodeToken || `SOL-${selectedTx.id.slice(0, 6)}`,
                unitAmount: sheet.unitAmount,
                handsCount: selectedTx.handsCovered || 1,
                totalAmount: selectedTx.amount,
                coverageStartDate: coverage.startDate || localDayOf(selectedTx.createdAtLocal),
                coverageEndDate: coverage.endDate || localDayOf(selectedTx.createdAtLocal),
                createdAt: selectedTx.createdAtLocal,
              });
            })();
      await sharePdfFile(fileUri, `recu_operation_${selectedTx.id.slice(0, 8)}.pdf`);
    } catch (err: any) {
      Alert.alert(t('Erreur'), err?.message || t('Impossible de générer le reçu.'));
    }
  };

  const handleWhatsAppReceipt = () => {
    if (!selectedTx) return;
    const digitsOnly = normalizePhoneNumber(client.phoneNumber);
    const message = t(
      '*SOL MOBILE - RÉCÉPISSÉ CERTIFIÉ*\nAdhérent : {0}\nOpération : #{1}\nType : {2}\nMontant : {3}\nDate : {4}\n\nReçu archivé avec succès sur SOL Mobile.',
      client.fullName,
      selectedTx.id.slice(0, 8),
      ledgerEntryLabel(selectedTx),
      formatCurrency(selectedTx.amount),
      formatDate(selectedTx.createdAtLocal)
    );
    const encoded = encodeURIComponent(message);
    Linking.openURL(digitsOnly ? `https://wa.me/${digitsOnly}?text=${encoded}` : `https://wa.me/?text=${encoded}`).catch(() =>
      Alert.alert(t('WhatsApp'), t('Impossible d\'ouvrir WhatsApp.'))
    );
  };

  // ---- Reversal ------------------------------------------------------------------------------
  const handleConfirmReversal = (reason: string) => {
    if (!txToReverse) return;
    if (!reason.trim()) {
      Alert.alert(t('Motif obligatoire'), t('Veuillez saisir la raison de l\'annulation.'));
      return;
    }
    const tx = txToReverse;
    setTxToReverse(null);
    requirePin(
      t('Annulation de Transaction'),
      t('Saisissez votre code PIN pour valider l\'annulation de l\'opération #{0} ({1}).', tx.id.slice(0, 8), formatCurrency(tx.amount)),
      async () => {
        try {
          await reverseTransaction({ transactionId: tx.id, reason: reason.trim(), collectorId: activeCollector?.id });
          triggerSuccessFeedback();
          Alert.alert(t('Opération annulée'), t('L\'opération a été annulée et le solde/échéance de l\'adhérent a été recalculé.'));
          loadClientData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert(t('Erreur'), err?.message || t('Échec de l\'annulation.'));
        }
      }
    );
  };

  return (
    <Screen
      footer={
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
      }
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <ActionMenu
              title={client.fullName}
              items={[
                { label: t('Modifier l\'adhérent'), icon: 'edit', onPress: () => setIsEditOpen(true) },
                { label: t('Fiche et reçu PDF'), icon: 'printer', onPress: handlePrintOrShare },
                { label: t('Supprimer l\'adhérent'), icon: 'trash', destructive: true, onPress: handleDeleteClient },
              ]}
            />
          ),
        }}
      />

      <MemberIdentity client={client} sheet={sheet} />
      <MemberContribution sheet={sheet} totalPaid={client.totalPaidAmount || 0} />
      {business && <MemberScheduleCard rounds={sheet.rounds} memberHands={sheet.memberHands} paidHands={sheet.paidHands} payoutRanks={sheet.payoutRanks} />}
      <MemberPayoutCard
        sheet={sheet}
        handReceivedDate={client.handReceivedDate}
        onPayout={() => {
          triggerMediumImpact();
          setIsPayoutOpen(true);
        }}
      />
      <MemberCycleDetails sheet={sheet} />
      <MemberLedger
        transactions={transactions}
        onPress={(tx) => {
          triggerLightImpact();
          setSelectedTx(tx);
        }}
      />

      <TransactionDetailSheet
        tx={selectedTx}
        isFromClosedCycle={!!selectedTx && isTransactionFromClosedCycle(selectedTx.createdAtLocal, cycleBoundary)}
        onClose={() => setSelectedTx(null)}
        onReceipt={handleShareReceipt}
        onWhatsApp={handleWhatsAppReceipt}
        onCancel={() => {
          setTxToReverse(selectedTx);
          setSelectedTx(null);
        }}
      />
      <EditMemberSheet
        visible={isEditOpen}
        initial={{ fullName: client.fullName, phoneNumber: client.phoneNumber, handsCount: sheet.memberHands, ranks: editableRanks(client) }}
        unitAmount={sheet.unitAmount}
        onClose={() => setIsEditOpen(false)}
        onSave={handleSaveEdit}
      />
      <PayoutSheet visible={isPayoutOpen} client={client} sheet={sheet} onClose={() => setIsPayoutOpen(false)} onConfirm={handleConfirmPayout} />
      <ReversalSheet visible={!!txToReverse} onClose={() => setTxToReverse(null)} onConfirm={handleConfirmReversal} />

      <PinVerificationModal
        visible={!!pinRequest}
        onCancel={() => setPinRequest(null)}
        onSuccess={async () => {
          const request = pinRequest;
          setPinRequest(null);
          if (request) await request.run();
        }}
        title={pinRequest?.title ?? ''}
        subtitle={pinRequest?.subtitle ?? ''}
      />
    </Screen>
  );
}
