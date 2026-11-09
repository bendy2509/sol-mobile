import React, { useState, useCallback, useMemo } from 'react';
import { View, TextInput, SectionList, Pressable, StyleSheet, RefreshControl, Alert, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { PinVerificationModal } from '@/components/PinVerificationModal';
import { ClosedCycleNotice } from '@/components/ClosedCycleLockNotice';
import { AmountText, BottomSheet, Button, Card, EmptyState, Icon, ListItem, Screen, ScreenHeader, SegmentedControl, StatStrip, Text, TextField, UiIconName } from '@/components/ui';
import type { StatCell } from '@/components/ui';
import { getAllTransactions, getContributionCoverage, reverseTransaction } from '@/db/transactionRepository';
import { getActiveCollector } from '@/db/sqlite';
import { getActiveBusinessConfig, getCurrentCycleBoundary, getCycleHandsTotal } from '@/db/businessRepository';
import { getClientById } from '@/db/clientRepository';
import { generateContributionReceiptPdf, generatePayoutReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { useAuth } from '@/context/AuthContext';
import { Transaction, TransactionType } from '@/types';
import { formatCurrency, formatDate, formatRelativeDay } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { isTransactionFromClosedCycle, summarizeOperations } from '@/services/financialService';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';
import { localDateString, localDayOf } from '@/lib/dates';

/** Each filter covers its whole family, legacy names included. */
const FILTER_TYPES: Partial<Record<TransactionType | 'ALL', TransactionType[]>> = {
  SOL_CONTRIBUTION: ['SOL_CONTRIBUTION', 'CONTRIBUTION', 'SABOTAY_DEPOSIT'],
  SOL_PAYOUT: ['SOL_PAYOUT', 'HAND_PAYOUT', 'WITHDRAWAL'],
  REVERSAL: ['REVERSAL'],
};

const FILTERS: { value: TransactionType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tout' },
  { value: 'SOL_CONTRIBUTION', label: 'Entrées' },
  { value: 'SOL_PAYOUT', label: 'Remises' },
  { value: 'REVERSAL', label: 'Annulées' },
];

export default function HistoryScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { activeCollector } = useAuth();
  const { width, isSmallScreen, isTablet, horizontalPadding } = useResponsive();
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
      const typesParam = FILTER_TYPES[filterType];
      const list = await getAllTransactions({
        types: typesParam,
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

  // One section per local day, newest first: « Aujourd'hui », « Hier », then the date
  const sections = useMemo(() => {
    const today = localDateString();
    const byDay = new Map<string, Transaction[]>();
    for (const tx of filteredTransactions) {
      const day = localDayOf(tx.createdAtLocal);
      byDay.set(day, [...(byDay.get(day) || []), tx]);
    }
    return [...byDay.entries()].map(([day, data]) => ({
      day,
      title: formatRelativeDay(day, today, { today: t('Aujourd\'hui'), yesterday: t('Hier') }),
      data,
    }));
  }, [filteredTransactions]);

  // Totals of what the filter shows (financialService.summarizeOperations)
  const totals = useMemo(() => summarizeOperations(filteredTransactions), [filteredTransactions]);
  const totalCells: StatCell[] = [
    ...(filterType === 'ALL' || filterType === 'SOL_CONTRIBUTION'
      ? [{ label: t('Entrées'), value: `+${formatCurrency(totals.inAmount)}`, hint: t('{0} opération{1}', totals.inCount, totals.inCount > 1 ? 's' : ''), tone: 'success' as const }]
      : []),
    ...(filterType === 'ALL' || filterType === 'SOL_PAYOUT'
      ? [{ label: t('Remises'), value: `−${formatCurrency(totals.outAmount)}`, hint: t('{0} opération{1}', totals.outCount, totals.outCount > 1 ? 's' : '') }]
      : []),
    ...(filterType === 'ALL'
      ? [{ label: t('Annulées'), value: String(totals.reversedCount) }]
      : filterType === 'REVERSAL'
      ? [{ label: t('Annulations'), value: String(filteredTransactions.length) }]
      : []),
  ];

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
          collectorName: activeCollector?.fullName || 'Bendy SERVILUS',
          collectorPhone: activeCollector?.phoneNumber || '',
          collectorZone: activeCollector?.zone,
          clientName: selectedTx.clientName || client?.fullName || 'Adhérent',
          clientPhone: selectedTx.clientPhone || client?.phoneNumber || '',
          payoutRank: client?.payoutRank || undefined,
          totalPotAmount: selectedTx.amount,
          registeredChildrenCount: await getCycleHandsTotal(),
          unitAmount: business?.contributionAmount || selectedTx.amount,
          note: selectedTx.note,
          createdAt: selectedTx.createdAtLocal,
        });
      } else {
        const unitAmount = business?.contributionAmount || Math.round(selectedTx.amount / (selectedTx.handsCovered || 1));
        // Rounds this collection paid (cycle calendar), not the day it was recorded
        const coverage = await getContributionCoverage(selectedTx.id);
        pdfUri = await generateContributionReceiptPdf({
          transactionId: selectedTx.id,
          businessName: business?.name || 'SOL Mobile',
          collectorName: activeCollector?.fullName || 'Bendy SERVILUS',
          collectorPhone: activeCollector?.phoneNumber || '',
          collectorZone: activeCollector?.zone,
          clientName: selectedTx.clientName || client?.fullName || 'Adhérent',
          clientPhone: selectedTx.clientPhone || client?.phoneNumber || '',
          payoutRank: client?.payoutRank || undefined,
          qrCodeToken: client?.qrCodeToken || `SOL-${selectedTx.id.slice(0, 6)}`,
          unitAmount,
          handsCount: selectedTx.handsCovered || 1,
          totalAmount: selectedTx.amount,
          coverageStartDate: coverage.startDate || localDayOf(selectedTx.createdAtLocal),
          coverageEndDate: coverage.endDate || localDayOf(selectedTx.createdAtLocal),
          createdAt: selectedTx.createdAtLocal,
        });
      }

      await sharePdfFile(pdfUri, `Recu_SOL_${(selectedTx.clientName || 'Adherent').replace(/\s+/g, '_')}.pdf`);
    } catch (err: any) {
      Alert.alert(t('Erreur'), t('Impossible de générer le reçu PDF.'));
    }
  };

  const handleWhatsAppShare = () => {
    if (!selectedTx) return;
    triggerLightImpact();
    const phone = selectedTx.clientPhone || '';
    const digitsOnly = phone.replace(/[^0-9]/g, '');

    const message = t('Bonjour {0}, voici le reçu certifié de votre opération sur SOL :\n- Référence : #{1}\n- Type : {2}\n- Montant : {3} ({4} main(s))\n- Date : {5}\n\nReçu certifié et archivé avec succès. Merci !', selectedTx.clientName || '', selectedTx.id.slice(0, 8), selectedTx.type, formatCurrency(selectedTx.amount), selectedTx.handsCovered || 1, formatDate(selectedTx.createdAtLocal));

    const encoded = encodeURIComponent(message);
    const url = digitsOnly ? `https://wa.me/${digitsOnly}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(t('WhatsApp'), t('Impossible d\'ouvrir WhatsApp.'));
    });
  };

  const isSelectedTxFromClosedCycle = !!selectedTx && isTransactionFromClosedCycle(selectedTx.createdAtLocal, cycleBoundary);

  const handleInitiateCancel = () => {
    if (!selectedTx) return;
    if (selectedTx.type === 'REVERSAL') {
      Alert.alert(t('Action Impossible'), t('Une opération d’annulation ne peut pas être elle-même annulée.'));
      return;
    }
    setCancelReason('');
    setIsDetailModalOpen(false);
    setIsCancelPromptOpen(true);
  };

  const handleConfirmCancelReason = () => {
    if (!cancelReason.trim()) {
      Alert.alert(t('Motif obligatoire'), t('Veuillez saisir le motif obligatoire de l\'annulation.'));
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
        collectorId: activeCollector?.id,
      });
      triggerSuccessFeedback();
      Alert.alert(
        t('Opération annulée'),
        t('La transaction #{0} a été annulée. Une écriture d\'annulation certifiée a été inscrite à l\'audit et le solde de l\'adhérent a été recalculé.', selectedTx.id.slice(0, 8))
      );
      loadData();
    } catch (err: any) {
      Alert.alert(t('Erreur'), err?.message || t('Échec de l\'annulation.'));
    } finally {
      setSelectedTx(null);
    }
  };

  const getTransactionTypeLabel = (type: TransactionType) => {
    switch (type) {
      case 'SABOTAY_DEPOSIT':
        return t('Dépôt Sabotay');
      case 'SOL_CONTRIBUTION':
        return t('Cotisation Sol');
      case 'SOL_PAYOUT':
        return t('Décaissement Main');
      case 'WITHDRAWAL':
        return t('Retrait Épargne');
      case 'REVERSAL':
        return t('Annulation / Rectification');
      case 'CORRECTION':
        return t('Correction Solde');
      default:
        return type;
    }
  };

  const renderTransactionItem = useCallback(
    ({ item, index, section }: { item: Transaction; index: number; section: { data: Transaction[] } }) => {
      const isReversal = item.type === 'REVERSAL';
      const isPayout = item.type === 'SOL_PAYOUT' || item.type === 'HAND_PAYOUT' || item.type === 'WITHDRAWAL';
      // Entries green, payouts in the action color, cancellations quiet (never red: not an error)
      const isCancelled = isReversal || !!item.isReversed;
      const icon: UiIconName = isReversal ? 'close' : isPayout ? 'payout' : 'cash';
      const fg = isCancelled ? theme.colors.textMuted : isPayout ? theme.colors.primary : theme.colors.success;
      const bg = isCancelled ? theme.colors.surfaceAlt : isPayout ? theme.colors.primarySoft : theme.colors.successSoft;
      const isFirst = index === 0;
      const isLast = index === section.data.length - 1;

      return (
        <View style={[styles.ledgerRow, isFirst && styles.ledgerFirst, isLast && styles.ledgerLast]}>
          <ListItem
            onPress={() => handleOpenDetail(item)}
            divider={!isLast}
            accessibilityLabel={[item.clientName || t('Adhérent SOL'), getTransactionTypeLabel(item.type), formatCurrency(item.amount), item.isReversed ? t('Annulée') : '', formatDate(item.createdAtLocal)].filter(Boolean).join(', ')}
            leading={
              <View style={[styles.txIcon, { backgroundColor: bg }]}>
                <Icon name={icon} size={18} color={fg} />
              </View>
            }
            title={item.clientName || t('Adhérent SOL')}
            subtitle={getTransactionTypeLabel(item.type)}
            meta={
              item.isReversed ? (
                <Text variant="caption" tone="muted">{t('Annulée')}</Text>
              ) : item.syncStatus === 'FAILED' ? (
                <Text variant="caption" tone="danger">{t('Échec de synchronisation')}</Text>
              ) : undefined
            }
            trailing={
              isCancelled ? (
                <Text variant="amountSmall" tone="muted" style={styles.struck}>
                  {formatCurrency(item.amount)}
                </Text>
              ) : (
                <AmountText amount={item.amount} size="small" sign={isPayout ? 'debit' : 'credit'} tone={isPayout ? 'default' : 'success'} />
              )
            }
          />
        </View>
      );
    },
    [theme, styles]
  );

  return (
    <Screen
      scroll={false}
      padded={false}
      edges={['top', 'left', 'right']}
      header={
        <View style={styles.toolbar}>
          <ScreenHeader title={t('Historique')} subtitle={t('Versements, remises et annulations')} />
          <View style={styles.toolbarBody}>
            <View style={styles.searchBar}>
              <Icon name="search" size={18} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('Adhérent, téléphone ou référence')}
                placeholderTextColor={theme.colors.textPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                accessibilityLabel={t('Rechercher une opération')}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('Effacer la recherche')}>
                  <Icon name="close" size={18} color={theme.colors.textMuted} />
                </Pressable>
              )}
            </View>
            <SegmentedControl options={FILTERS.map((f) => ({ ...f, label: t(f.label) }))} value={filterType} onChange={handleFilter} accessibilityLabel={t('Type d\'opération')} />
          </View>
        </View>
      }
    >
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderTransactionItem}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text variant="subheading" style={styles.flexShrink}>{section.title}</Text>
            <Text variant="caption" tone="muted">{t('{0} opération{1}', section.data.length, section.data.length > 1 ? 's' : '')}</Text>
          </View>
        )}
        stickySectionHeadersEnabled={false}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listContent, isTablet && styles.listContentTablet]}
        ListHeaderComponent={filteredTransactions.length > 0 ? <StatStrip cells={totalCells} /> : null}
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={searchQuery ? 'search' : 'history'}
            title={searchQuery ? t('Aucun résultat') : t('Aucune opération')}
            message={searchQuery ? t('Vérifiez le nom, le téléphone ou la référence saisis.') : t('Les versements et remises apparaîtront ici.')}
          />
        }
      />

      {/* Transaction detail */}
      <BottomSheet
        visible={isDetailModalOpen && !!selectedTx}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedTx ? getTransactionTypeLabel(selectedTx.type) || t('Opération') : t('Détail de l\'opération')}
        subtitle={selectedTx ? [selectedTx.clientName, formatDate(selectedTx.createdAtLocal)].filter(Boolean).join(' · ') : undefined}
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

            {selectedTx.type !== 'REVERSAL' && isSelectedTxFromClosedCycle && <ClosedCycleNotice />}

            {selectedTx.type !== 'REVERSAL' && (
              <Button label={t('Annuler cette opération')} icon="alert" variant="danger" fullWidth onPress={handleInitiateCancel} />
            )}
          </>
        )}
      </BottomSheet>

      {/* Cancellation reason */}
      <BottomSheet
        visible={isCancelPromptOpen}
        onClose={() => setIsCancelPromptOpen(false)}
        title={t('Annuler l\'opération')}
        subtitle={t('Une écriture d\'annulation est archivée pour l\'audit. Motif et code PIN obligatoires.')}
        footer={<Button size="lg" fullWidth label={t('Continuer avec le PIN')} icon="lock" variant="danger" onPress={handleConfirmCancelReason} />}
      >
        <TextField
          label={t('Motif obligatoire')}
          multiline
          numberOfLines={3}
          placeholder={t('Ex : erreur de saisie du montant, doublon')}
          value={cancelReason}
          onChangeText={setCancelReason}
        />
      </BottomSheet>

      {/* 4-Digit PIN Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title={t('Confirmer l\'annulation')}
        subtitle={t('Votre code PIN valide l\'écriture d\'annulation.')}
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

    toolbar: {
      width: '100%',
      maxWidth: layout.maxContentWidth + layout.gutter * 2,
      alignSelf: 'center',
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
    listContent: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
    listContentTablet: { width: '100%', maxWidth: layout.maxContentWidth + layout.gutter * 2, alignSelf: 'center' },
    dayHeader: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.sm },
    struck: { textDecorationLine: 'line-through' },
    toolbarBody: { paddingHorizontal: layout.gutter, gap: spacing.md, paddingBottom: spacing.sm },
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
