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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getClientById } from '@/db/clientRepository';
import { getTransactionsByClient } from '@/db/transactionRepository';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { BusinessConfig, Client, Transaction } from '@/types';
import { formatCurrency, formatDate, formatDateShort, formatShortId, getInitials } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function ClientDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeCollector } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  useEffect(() => {
    async function loadClientData() {
      if (!id) return;
      const [data, txs, activeBiz] = await Promise.all([
        getClientById(id),
        getTransactionsByClient(id),
        getActiveBusinessConfig(),
      ]);
      setClient(data);
      setTransactions(txs);
      setBusiness(activeBiz);
    }
    loadClientData();
  }, [id]);

  const handlePrintOrShare = async () => {
    triggerMediumImpact();
    if (!client) return;

    const receiptText = `
========================================
       SOL - CARNET D'ÉPARGNE OFFICIEL
========================================
Activité : ${business?.name || 'Sabotay / Sol'}
Collecteur : ${activeCollector?.fullName || 'Agent SOL'} (${activeCollector?.zone || 'Marché'})

FICHE ADHÉRENT ("ENFANT") :
- Nom : ${client.fullName}
- Téléphone : ${client.phoneNumber}
- Numéro / Rang : ${client.payoutRank ? `Main #${client.payoutRank}` : 'Adhérent standard'}
- Code QR : ${client.qrCodeToken}
- Date d'adhésion : ${formatDateShort(client.createdAt)}

SITUATION FINANCIÈRE :
- Cotisation prévue : ${formatCurrency(client.dailyAmount)}
- Solde Total Cotisé : ${formatCurrency(client.currentBalance)}
- Statut de la main : ${client.hasReceivedPayout ? 'Main déjà perçue' : 'En attente de perception'}

HISTORIQUE DES VERSEMENTS (${transactions.length} opérations) :
${transactions
  .slice(0, 15)
  .map(
    (t, idx) =>
      `${idx + 1}. ${formatDateShort(t.createdAtLocal)} | ${t.type} | +${formatCurrency(t.amount)}`
  )
  .join('\n')}

========================================
Document généré le ${new Date().toLocaleDateString('fr-FR')} via SOL Mobile
========================================
    `.trim();

    try {
      await Share.share({
        message: receiptText,
        title: `Fiche d'adhérent - ${client.fullName}`,
      });
    } catch {
      Alert.alert('Impression', 'La fiche individuelle a été générée avec succès.');
    }
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
                {client.hasReceivedPayout && (
                  <View style={styles.paidOutBadge}>
                    <Icon name="check" size={11} color="#15803D" style={{ marginRight: 3 }} />
                    <Text style={styles.paidOutBadgeText}>Main Décaissée</Text>
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
            <Text style={styles.balanceLabel}>SOLDE DISPONIBLE</Text>
            <Text style={styles.balanceAmount}>
              {formatCurrency(client.currentBalance)}
            </Text>
          </View>

          <View style={styles.dailyCard}>
            <Text style={styles.dailyLabel}>COTISATION PAR TOUR</Text>
            <Text style={styles.dailyAmount}>
              {formatCurrency(client.dailyAmount || business?.contributionAmount || 250)}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
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
            <Text style={styles.actionBtnPrimaryText}>Faire un Encaissement</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setIsPrintModalOpen(true)}
            style={styles.actionBtnSecondary}
          >
            <Icon name="print" size={16} color={SOL_COLORS.textPrimary} style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnSecondaryText}>Imprimer Fiche</Text>
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
              tx.type === 'SABOTAY_DEPOSIT' || tx.type === 'SOL_CONTRIBUTION';
            return (
              <View key={tx.id} style={styles.txRow}>
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
                        : tx.type === 'SOL_CONTRIBUTION'
                        ? 'Cotisation Sol'
                        : tx.type === 'SOL_PAYOUT'
                        ? 'Décaissement Main'
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
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Printable / Shareable Passbook Sheet Modal */}
      <Modal
        visible={isPrintModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsPrintModalOpen(false)}
      >
        <SafeAreaView style={styles.printModalContainer}>
          <View style={styles.printModalHeader}>
            <Text style={styles.printModalTitle}>Fiche Individuelle d'Adhérent</Text>
            <TouchableOpacity
              onPress={() => setIsPrintModalOpen(false)}
              style={styles.closeBtn}
            >
              <Icon name="close" size={18} color={SOL_COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.printSlipContent}>
            {/* Passbook Slip Paper Card */}
            <View style={styles.slipPaper}>
              {/* Slip Header */}
              <View style={styles.slipHeader}>
                <Text style={styles.slipBrand}>SOL • CARNET D'ÉPARGNE</Text>
                <Text style={styles.slipGroup}>{business?.name || 'Sabotay Marché'}</Text>
                <Text style={styles.slipCollector}>
                  Collecteur : {activeCollector?.fullName} ({activeCollector?.zone || 'Zone Marché'})
                </Text>
              </View>

              {/* Slip Member Info */}
              <View style={styles.slipSection}>
                <View style={styles.slipRow}>
                  <Text style={styles.slipLabel}>Nom de l'adhérent :</Text>
                  <Text style={styles.slipValue}>{client.fullName}</Text>
                </View>
                <View style={styles.slipRow}>
                  <Text style={styles.slipLabel}>Téléphone :</Text>
                  <Text style={styles.slipValue}>{client.phoneNumber}</Text>
                </View>
                {client.payoutRank && (
                  <View style={styles.slipRow}>
                    <Text style={styles.slipLabel}>Rang de main :</Text>
                    <Text style={styles.slipValue}>Main #{client.payoutRank}</Text>
                  </View>
                )}
                <View style={styles.slipRow}>
                  <Text style={styles.slipLabel}>Code QR :</Text>
                  <Text style={styles.slipValue}>{client.qrCodeToken}</Text>
                </View>
                <View style={styles.slipRow}>
                  <Text style={styles.slipLabel}>Date d'adhésion :</Text>
                  <Text style={styles.slipValue}>{formatDateShort(client.createdAt)}</Text>
                </View>
              </View>

              {/* Slip Financial Total */}
              <View style={styles.slipTotalBox}>
                <Text style={styles.slipTotalLabel}>TOTAL COTISÉ AU CARNET</Text>
                <Text style={styles.slipTotalAmount}>
                  {formatCurrency(client.currentBalance)}
                </Text>
              </View>

              {/* Recent Transactions List on Slip */}
              <Text style={styles.slipTableTitle}>RELEVÉ DES COTISATIONS</Text>
              {transactions.slice(0, 10).map((t, idx) => (
                <View key={t.id} style={styles.slipTableRow}>
                  <Text style={styles.slipTableIndex}>#{idx + 1}</Text>
                  <Text style={styles.slipTableDate}>{formatDateShort(t.createdAtLocal)}</Text>
                  <Text style={styles.slipTableType}>
                    {t.type === 'SABOTAY_DEPOSIT' ? 'Dépôt' : 'Cotisation'}
                  </Text>
                  <Text style={styles.slipTableAmount}>+{formatCurrency(t.amount)}</Text>
                </View>
              ))}

              {/* Signature / Stamp line */}
              <View style={styles.slipSignatureRow}>
                <View style={styles.slipSignatureBlock}>
                  <View style={styles.signatureLine} />
                  <Text style={styles.signatureLabel}>Signature de l'adhérent</Text>
                </View>
                <View style={styles.slipSignatureBlock}>
                  <View style={styles.signatureLine} />
                  <Text style={styles.signatureLabel}>Cachet / Agent Collecteur</Text>
                </View>
              </View>
            </View>

            {/* Print / Export Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handlePrintOrShare}
              style={styles.printActionBtn}
            >
              <Icon name="print" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.printActionBtnText}>Imprimer / Partager le Relevé</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.background,
  },
  loadingText: {
    fontSize: 16,
    color: SOL_COLORS.textSecondary,
    fontWeight: '700',
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
    marginBottom: 16,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: SOL_COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
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
    color: SOL_COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
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
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  paidOutBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  qrBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qrLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  qrToken: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  idSub: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
  },
  balanceSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: SOL_COLORS.primary,
    borderRadius: 16,
    padding: 14,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D1FAE5',
    letterSpacing: 0.5,
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
  },
  dailyCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  dailyLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  dailyAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    marginTop: 4,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  actionBtnSecondaryText: {
    color: SOL_COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontSize: 13,
    color: SOL_COLORS.textSecondary,
    marginTop: 8,
  },
  txRow: {
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
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
    backgroundColor: '#DCFCE7',
  },
  txIconWithdraw: {
    backgroundColor: '#FEE2E2',
  },
  txTypeName: {
    fontSize: 14,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  txDate: {
    fontSize: 10,
    color: '#94A3B8',
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
  printModalContainer: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  printModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: '#E2E8F0',
  },
  printModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  closeBtn: {
    padding: 6,
  },
  printSlipContent: {
    padding: 16,
    paddingBottom: 40,
  },
  slipPaper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 20,
  },
  slipHeader: {
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#0F172A',
    paddingBottom: 12,
    marginBottom: 14,
  },
  slipBrand: {
    fontSize: 16,
    fontWeight: '900',
    color: SOL_COLORS.primary,
    letterSpacing: 1,
  },
  slipGroup: {
    fontSize: 15,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
    marginTop: 2,
  },
  slipCollector: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  slipSection: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 12,
    marginBottom: 12,
  },
  slipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  slipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  slipValue: {
    fontSize: 12,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  slipTotalBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    marginBottom: 14,
  },
  slipTotalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  slipTotalAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#15803D',
    marginTop: 2,
  },
  slipTableTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  slipTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  slipTableIndex: {
    fontSize: 11,
    color: '#94A3B8',
    width: 24,
    fontWeight: '700',
  },
  slipTableDate: {
    fontSize: 11,
    color: SOL_COLORS.textPrimary,
    flex: 1,
    fontWeight: '600',
  },
  slipTableType: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
  },
  slipTableAmount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  slipSignatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
    paddingTop: 10,
  },
  slipSignatureBlock: {
    width: '45%',
    alignItems: 'center',
  },
  signatureLine: {
    width: '100%',
    height: 1,
    backgroundColor: '#64748B',
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  printActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    paddingVertical: 16,
    borderRadius: 14,
  },
  printActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
