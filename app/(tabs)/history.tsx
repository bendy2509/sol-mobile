import React, { useState, useCallback, useMemo } from 'react';
import { View, TextInput, FlatList, Pressable, StyleSheet, RefreshControl, Alert, Share, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { SyncBadge } from '@/components/SyncBadge';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { ClosedCycleNotice } from '@/components/ClosedCycleLockNotice';
import { AmountText, BottomSheet, Button, Card, EmptyState, Icon, ListItem, Screen, SegmentedControl, Text, TextField, UiIconName } from '@/components/ui';
import { getAllTransactions, reverseTransaction } from '@/db/transactionRepository';
import { getActiveCollector } from '@/db/sqlite';
import { getActiveBusinessConfig, getCurrentCycleBoundary } from '@/db/businessRepository';
import { getClientById } from '@/db/clientRepository';
import { generateContributionReceiptPdf, generatePayoutReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Transaction, TransactionType } from '@/types';
import { formatCurrency, formatDate, formatDayMonth } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { isTransactionFromClosedCycle } from '@/services/financialService';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

const FILTERS: { value: TransactionType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tout' },
  { value: 'SOL_CONTRIBUTION', label: 'Entrées' },
  { value: 'SOL_PAYOUT', label: 'Remises' },
  { value: 'REVERSAL', label: 'Annulées' },
];

export default function HistoryScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { userRole, activeCollector } = useAuth();
  const { triggerSync } = useSync();
  const { width, isSmallScreen, isTablet, horizontalPadding } = useResponsive();
  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';
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
  const [cycleBoundary, setCycleBoundary] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const typeParam = filterType === 'ALL' ? undefined : filterType;
      const list = await getAllTransactions({
        type: typeParam,
        limit: 150,
        collectorId: activeCollector?.id,
      });
      setTransactions(list);
      setCycleBoundary(await getCurrentCycleBoundary(activeCollector?.id));
    } catch (err) {
      console.warn('History load error:', err);
    }
  }, [filterType, activeCollector?.id]);

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

  const isSelectedTxFromClosedCycle = !!selectedTx && isTransactionFromClosedCycle(selectedTx.createdAtLocal, cycleBoundary);

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
    ({ item, index }: { item: Transaction; index: number }) => {
      const isReversal = item.type === 'REVERSAL';
      const isPayout = item.type === 'SOL_PAYOUT' || item.type === 'WITHDRAWAL';
      const icon: UiIconName = isReversal ? 'alert' : isPayout ? 'payout' : 'cash';
      const fg = isReversal ? theme.colors.danger : isPayout ? theme.colors.primary : theme.colors.success;
      const bg = isReversal ? theme.colors.dangerSoft : isPayout ? theme.colors.primarySoft : theme.colors.successSoft;

      const isFirst = index === 0;
      const isLast = index === filteredTransactions.length - 1;

      return (
        <View style={[styles.ledgerRow, isFirst && styles.ledgerFirst, isLast && styles.ledgerLast]}>
          <ListItem
            onPress={() => handleOpenDetail(item)}
            divider={index < filteredTransactions.length - 1}
            accessibilityLabel={[item.clientName || 'Adhérent SOL', getTransactionTypeLabel(item.type) || 'Opération', formatCurrency(item.amount), formatDate(item.createdAtLocal)].filter(Boolean).join(', ')}
            leading={
              <View style={[styles.txIcon, { backgroundColor: bg }]}>
                <Icon name={icon} size={18} color={fg} />
              </View>
            }
            title={item.clientName || 'Adhérent SOL'}
            subtitle={[getTransactionTypeLabel(item.type) || 'Opération', formatDayMonth(item.createdAtLocal)].filter(Boolean).join(' · ')}
            meta={
              item.isReversed ? (
                <Text variant="caption" tone="danger">
                  Annulée
                </Text>
              ) : item.syncStatus === 'FAILED' ? (
                <Text variant="caption" tone="danger">
                  Échec de synchronisation
                </Text>
              ) : undefined
            }
            trailing={
              <AmountText
                amount={item.amount}
                size="small"
                sign={isReversal || isPayout ? 'debit' : 'credit'}
                tone={isReversal ? 'danger' : isPayout ? 'default' : 'success'}
              />
            }
          />
        </View>
      );
    },
    [theme, styles, filteredTransactions.length]
  );

  return (
    <Screen
      scroll={false}
      padded={false}
      edges={['top', 'left', 'right']}
      header={
        <>
          <View style={styles.toolbar}>
            <View style={styles.titleRow}>
              <View style={styles.flexShrink}>
                <Text variant="title" accessibilityRole="header">
                  Historique
                </Text>
                <Text variant="caption" tone="muted">
                  Versements, remises et annulations
                </Text>
              </View>
              <SyncBadge onSyncComplete={handleRefresh} compact />
            </View>
            <View style={styles.searchBar}>
              <Icon name="search" size={18} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Adhérent, téléphone ou référence"
                placeholderTextColor={theme.colors.textPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                accessibilityLabel="Rechercher une opération"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
                  <Icon name="close" size={18} color={theme.colors.textMuted} />
                </Pressable>
              )}
            </View>
            <SegmentedControl options={FILTERS} value={filterType} onChange={handleFilter} accessibilityLabel="Type d'opération" />
          </View>
        </>
      }
    >
      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransactionItem}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={7}
        removeClippedSubviews={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listContent, isTablet && styles.listContentTablet]}
        ListHeaderComponent={
          filteredTransactions.length > 0 ? (
            <Text variant="label" tone="muted" style={styles.countLabel}>
              {filteredTransactions.length} opération{filteredTransactions.length > 1 ? 's' : ''}
            </Text>
          ) : null
        }
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={searchQuery ? 'search' : 'history'}
            title={searchQuery ? 'Aucun résultat' : 'Aucune opération'}
            message={searchQuery ? 'Vérifiez le nom, le téléphone ou la référence saisis.' : 'Les versements et remises apparaîtront ici.'}
          />
        }
      />

      {/* Transaction detail */}
      <BottomSheet
        visible={isDetailModalOpen && !!selectedTx}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedTx ? getTransactionTypeLabel(selectedTx.type) || 'Opération' : "Détail de l'opération"}
        subtitle={selectedTx ? [selectedTx.clientName, formatDate(selectedTx.createdAtLocal)].filter(Boolean).join(' · ') : undefined}
      >
        {selectedTx && (
          <>
            <AmountText amount={selectedTx.amount} size="hero" />
            {[
              { label: 'Référence', value: `#${selectedTx.id.slice(0, 8)}` },
              { label: 'Mains couvertes', value: `${selectedTx.handsCovered || 1} main(s)` },
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

            {selectedTx.type !== 'REVERSAL' && !isReadOnly && isSelectedTxFromClosedCycle && <ClosedCycleNotice />}

            {selectedTx.type !== 'REVERSAL' && !isReadOnly && (
              <Button label="Annuler cette opération" icon="alert" variant="danger" fullWidth onPress={handleInitiateCancel} />
            )}


            {isReadOnly && selectedTx.type !== 'REVERSAL' && (
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
      </BottomSheet>

      {/* Cancellation reason */}
      <BottomSheet
        visible={isCancelPromptOpen}
        onClose={() => setIsCancelPromptOpen(false)}
        title="Annuler l'opération"
        subtitle="Une écriture d'annulation est archivée pour l'audit. Motif et code PIN obligatoires."
        footer={<Button size="lg" fullWidth label="Continuer avec le PIN" icon="lock" variant="danger" onPress={handleConfirmCancelReason} />}
      >
        <TextField
          label="Motif obligatoire"
          multiline
          numberOfLines={3}
          placeholder="Ex : erreur de saisie du montant, doublon"
          value={cancelReason}
          onChangeText={setCancelReason}
        />
      </BottomSheet>

      {/* 4-Digit PIN Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Confirmer l'annulation"
        subtitle="Votre code PIN valide l'écriture d'annulation."
        onSuccess={handlePinSuccessCancel}
        onCancel={() => setIsPinModalOpen(false)}
      />
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout, typography }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    flexGrow: { flexGrow: 1, flexBasis: 0 },

    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    toolbar: {
      width: '100%',
      maxWidth: layout.maxContentWidth + layout.gutter * 2,
      alignSelf: 'center',
      paddingHorizontal: layout.gutter,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xs,
      gap: spacing.md,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: layout.touchTarget,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
    },
    searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: spacing.sm },

    list: { flex: 1 },
    listContent: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, paddingBottom: spacing.xxl },
    listContentTablet: { width: '100%', maxWidth: layout.maxContentWidth + layout.gutter * 2, alignSelf: 'center' },
    countLabel: { paddingBottom: spacing.sm },
    ledgerRow: {
      backgroundColor: colors.surface,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    ledgerFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
    ledgerLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
    txIcon: {
      width: spacing.xxl + spacing.sm,
      height: spacing.xxl + spacing.sm,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    syncRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

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
    noteBox: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  });
