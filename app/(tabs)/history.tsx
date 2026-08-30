import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Modal,
  Alert,
  Share,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { Header } from '@/components/Header';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { getAllTransactions, reverseTransaction } from '@/db/transactionRepository';
import { getActiveCollector } from '@/db/sqlite';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { getClientById } from '@/db/clientRepository';
import { generateContributionReceiptPdf, generatePayoutReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Transaction, TransactionType } from '@/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function HistoryScreen() {
  const { userRole, activeCollector, getAdminProfile } = useAuth();
  const { triggerSync } = useSync();
  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';
  const isAdmin = userRole === 'ADMIN';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filterType, setFilterType] = useState<TransactionType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Selected Transaction & Reversal Flow
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCancelPromptOpen, setIsCancelPromptOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const typeParam = filterType === 'ALL' ? undefined : filterType;
      const list = await getAllTransactions({
        type: typeParam,
        limit: 150,
        collectorId: isAdmin ? undefined : activeCollector?.id,
        allCollectors: isAdmin,
      });
      setTransactions(list);
    } catch (err) {
      console.warn('History load error:', err);
    }
  }, [filterType, isAdmin, activeCollector?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await triggerSync();
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleFilter = (type: TransactionType | 'ALL') => {
    triggerLightImpact();
    setFilterType(type);
  };

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter(
      (t) =>
        t.clientName?.toLowerCase().includes(q) ||
        t.clientPhone?.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.note?.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

  const handleOpenDetail = (tx: Transaction) => {
    triggerLightImpact();
    setSelectedTx(tx);
    setIsDetailModalOpen(true);
  };

  const handleShareReceipt = async () => {
    if (!selectedTx) return;
    triggerMediumImpact();
    try {
      const activeCollector = await getActiveCollector();
      const business = await getActiveBusinessConfig();
      const client = selectedTx.clientId ? await getClientById(selectedTx.clientId) : null;

      const isPayout = selectedTx.type === 'SOL_PAYOUT' || selectedTx.type === 'HAND_PAYOUT' || selectedTx.type === 'WITHDRAWAL';

      let pdfUri: string;
      if (isPayout) {
        pdfUri = await generatePayoutReceiptPdf({
          transactionId: selectedTx.id,
          businessName: business?.name || 'SOL Mobile',
          collectorName: activeCollector?.fullName || 'Gestionnaire SOL',
          collectorPhone: activeCollector?.phoneNumber || '+509 XX XX XXXX',
          collectorZone: activeCollector?.zone,
          clientName: selectedTx.clientName || client?.fullName || 'Adhérent',
          clientPhone: selectedTx.clientPhone || client?.phoneNumber || '+509 XX XX XXXX',
          payoutRank: client?.payoutRank || undefined,
          totalPotAmount: selectedTx.amount,
          registeredChildrenCount: business?.totalSlots || 10,
          unitAmount: business?.contributionAmount || selectedTx.amount,
          note: selectedTx.note,
          createdAt: selectedTx.createdAtLocal,
        });
      } else {
        const unitAmount = business?.contributionAmount || Math.round(selectedTx.amount / (selectedTx.handsCovered || 1));
        pdfUri = await generateContributionReceiptPdf({
          transactionId: selectedTx.id,
          businessName: business?.name || 'SOL Mobile',
          collectorName: activeCollector?.fullName || 'Gestionnaire SOL',
          collectorPhone: activeCollector?.phoneNumber || '+509 XX XX XXXX',
          collectorZone: activeCollector?.zone,
          clientName: selectedTx.clientName || client?.fullName || 'Adhérent',
          clientPhone: selectedTx.clientPhone || client?.phoneNumber || '+509 XX XX XXXX',
          payoutRank: client?.payoutRank || undefined,
          qrCodeToken: client?.qrCodeToken || `SOL-${selectedTx.id.slice(0, 6)}`,
          unitAmount,
          handsCount: selectedTx.handsCovered || 1,
          totalAmount: selectedTx.amount,
          coverageStartDate: selectedTx.createdAtLocal.split('T')[0],
          coverageEndDate: selectedTx.createdAtLocal.split('T')[0],
          createdAt: selectedTx.createdAtLocal,
        });
      }

      await sharePdfFile(pdfUri, `Recu_SOL_${(selectedTx.clientName || 'Adherent').replace(/\s+/g, '_')}.pdf`);
    } catch (err: any) {
      Alert.alert('Erreur', 'Impossible de générer le reçu PDF.');
    }
  };

  const handleWhatsAppShare = () => {
    if (!selectedTx) return;
    triggerLightImpact();
    const phone = selectedTx.clientPhone || '';
    const digitsOnly = phone.replace(/[^0-9]/g, '');

    const message = `Bonjour ${selectedTx.clientName || ''}, voici le reçu certifié de votre opération sur SOL :
- Référence : #${selectedTx.id.slice(0, 8)}
- Type : ${selectedTx.type}
- Montant : ${formatCurrency(selectedTx.amount)} (${selectedTx.handsCovered || 1} main(s))
- Date : ${formatDate(selectedTx.createdAtLocal)}

Reçu certifié et archivé avec succès. Merci !`;

    const encoded = encodeURIComponent(message);
    const url = digitsOnly ? `https://wa.me/${digitsOnly}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('WhatsApp', 'Impossible d\'ouvrir WhatsApp.');
    });
  };

  const handleInitiateCancel = () => {
    if (!selectedTx) return;
    if (selectedTx.type === 'REVERSAL') {
      Alert.alert('Action Impossible', 'Une opération d’annulation ne peut pas être elle-même annulée.');
      return;
    }
    setCancelReason('');
    setIsDetailModalOpen(false);
    setIsCancelPromptOpen(true);
  };

  const handleConfirmCancelReason = () => {
    if (!cancelReason.trim()) {
      Alert.alert('Motif requis', "Veuillez saisir le motif obligatoire de l'annulation.");
      return;
    }
    setIsCancelPromptOpen(false);
    setIsPinModalOpen(true);
  };

  const handlePinSuccessCancel = async () => {
    setIsPinModalOpen(false);
    if (!selectedTx) return;

    try {
      await reverseTransaction({
        transactionId: selectedTx.id,
        reason: cancelReason.trim(),
        userRole: userRole || 'MANAGER',
        collectorId: activeCollector?.id,
      });
      triggerSuccessFeedback();
      Alert.alert(
        'Opération Annulée avec Succès',
        `La transaction #${selectedTx.id.slice(0, 8)} a été annulée. Une écriture d'annulation certifiée a été inscrite à l'audit et le solde de l'adhérent a été recalculé.`
      );
      loadData();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || "Échec de l'annulation.");
    } finally {
      setSelectedTx(null);
    }
  };

  const getTransactionTypeLabel = (type: TransactionType) => {
    switch (type) {
      case 'SABOTAY_DEPOSIT':
        return 'Dépôt Sabotay';
      case 'SOL_CONTRIBUTION':
        return 'Cotisation Sol';
      case 'SOL_PAYOUT':
        return 'Décaissement Main';
      case 'WITHDRAWAL':
        return 'Retrait Épargne';
      case 'REVERSAL':
        return 'Annulation / Rectification';
      case 'CORRECTION':
        return 'Correction Solde';
      default:
        return type;
    }
  };

  const renderTransactionItem = useCallback(
    ({ item }: { item: Transaction }) => {
      const isReversal = item.type === 'REVERSAL';
      const isPayout = item.type === 'SOL_PAYOUT' || item.type === 'WITHDRAWAL';

      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handleOpenDetail(item)}
          style={[styles.txCard, isReversal && styles.txCardReversal]}
        >
          <View style={styles.txCardLeft}>
            <View
              style={[
                styles.iconCircle,
                isReversal
                  ? styles.iconCircleReversal
                  : isPayout
                  ? styles.iconCirclePayout
                  : styles.iconCircleDeposit,
              ]}
            >
              <Icon
                name={isReversal ? 'alert' : isPayout ? 'crown' : 'cash'}
                size={16}
                color={isReversal ? '#DC2626' : isPayout ? '#2563EB' : '#059669'}
              />
            </View>

            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.clientName}>{item.clientName || 'Adhérent SOL'}</Text>
              <Text style={styles.txTypeLabel}>{getTransactionTypeLabel(item.type)}</Text>
              <Text style={styles.txDate}>{formatDate(item.createdAtLocal)}</Text>
            </View>
          </View>

          <View style={styles.txCardRight}>
            <Text
              style={[
                styles.txAmount,
                isReversal
                  ? styles.txAmountReversal
                  : isPayout
                  ? styles.txAmountPayout
                  : styles.txAmountDeposit,
              ]}
            >
              {isReversal ? '-' : isPayout ? '-' : '+'}
              {formatCurrency(item.amount)}
            </Text>

            <View style={styles.syncStatusRow}>
              <View
                style={[
                  styles.syncDot,
                  item.syncStatus === 'SYNCED'
                    ? styles.syncDotSynced
                    : item.syncStatus === 'FAILED'
                    ? styles.syncDotFailed
                    : styles.syncDotPending,
                ]}
              />
              <Text style={styles.syncStatusText}>
                {item.syncStatus === 'SYNCED' ? 'Synchronisé' : 'En attente'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    []
  );

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Journal des Opérations"
        subtitle="Historique des versements & traçabilité"
        onRefresh={handleRefresh}
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par adhérent, téléphone, référence..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close" size={16} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      {/* Horizontal Scrollable Filter Chips */}
      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleFilter('ALL')}
            style={[styles.filterChip, filterType === 'ALL' && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filterType === 'ALL' && styles.filterTextActive]}>
              Toutes
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleFilter('SOL_CONTRIBUTION')}
            style={[
              styles.filterChip,
              filterType === 'SOL_CONTRIBUTION' && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filterType === 'SOL_CONTRIBUTION' && styles.filterTextActive,
              ]}
            >
              Cotisations Sol
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleFilter('SOL_PAYOUT')}
            style={[styles.filterChip, filterType === 'SOL_PAYOUT' && styles.filterChipActive]}
          >
            <Text
              style={[styles.filterText, filterType === 'SOL_PAYOUT' && styles.filterTextActive]}
            >
              Mains Remises
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleFilter('REVERSAL')}
            style={[styles.filterChip, filterType === 'REVERSAL' && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filterType === 'REVERSAL' && styles.filterTextActive]}>
              Annulations (Audit)
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Transactions List */}
      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransactionItem}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={7}
        removeClippedSubviews={true}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[SOL_COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="history" size={36} color="#94A3B8" />
            <Text style={styles.emptyTitle}>Aucune transaction trouvée</Text>
            <Text style={styles.emptySubtitle}>
              Les opérations et versements apparaîtront ici.
            </Text>
          </View>
        }
      />

      {/* Transaction Detail Modal */}
      <Modal
        visible={isDetailModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDetailModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Détail de l'Opération</Text>
              <TouchableOpacity onPress={() => setIsDetailModalOpen(false)}>
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
                    <Text style={styles.detailValueBold}>{selectedTx.clientName || 'Adhérent'}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Type :</Text>
                    <Text style={styles.detailValue}>{getTransactionTypeLabel(selectedTx.type)}</Text>
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
                    {selectedTx.type !== 'REVERSAL' && !isReadOnly && (
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

                    {isReadOnly && selectedTx.type !== 'REVERSAL' && (
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

      {/* Cancellation Reason Modal */}
      <Modal
        visible={isCancelPromptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCancelPromptOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Motif de l'Annulation</Text>
              <TouchableOpacity
                onPress={() => setIsCancelPromptOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubText}>
              Cette opération sera rectifiée dans le solde de l'adhérent et une écriture d'annulation sera archivée à des fins d'audit.
            </Text>

            <TextInput
              style={styles.reasonInput}
              multiline
              numberOfLines={3}
              placeholder="Ex: Erreur de saisie du montant / doublon..."
              placeholderTextColor="#94A3B8"
              value={cancelReason}
              onChangeText={setCancelReason}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setIsCancelPromptOpen(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Abandonner</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmCancelReason}
                style={styles.confirmCancelBtn}
              >
                <Text style={styles.confirmCancelBtnText}>Continuer (Code PIN)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4-Digit PIN Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Confirmation de l'Annulation"
        subtitle="Saisissez votre code PIN gestionnaire pour confirmer l'écriture d'annulation."
        onSuccess={handlePinSuccessCancel}
        onCancel={() => setIsPinModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  filterWrapper: {
    marginBottom: 8,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  filterChipActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primary,
  },
  filterText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  txCardReversal: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  txCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleDeposit: {
    backgroundColor: '#ECFDF5',
  },
  iconCirclePayout: {
    backgroundColor: '#EFF6FF',
  },
  iconCircleReversal: {
    backgroundColor: '#FEE2E2',
  },
  clientName: {
    fontSize: 14,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  txTypeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },
  txDate: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  txCardRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '900',
  },
  txAmountDeposit: {
    color: '#059669',
  },
  txAmountPayout: {
    color: '#2563EB',
  },
  txAmountReversal: {
    color: '#DC2626',
  },
  syncStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncDotSynced: {
    backgroundColor: '#059669',
  },
  syncDotPending: {
    backgroundColor: '#D97706',
  },
  syncDotFailed: {
    backgroundColor: '#DC2626',
  },
  syncStatusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  modalSubText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginVertical: 8,
  },
  detailBody: {
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
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
  reasonInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    padding: 12,
    fontSize: 13,
    fontWeight: '600',
    color: SOL_COLORS.textPrimary,
    minHeight: 70,
    textAlignVertical: 'top',
    marginVertical: 10,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  confirmCancelBtn: {
    flex: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    backgroundColor: '#DC2626',
  },
  confirmCancelBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  managerNoticeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
    lineHeight: 15,
  },
});
