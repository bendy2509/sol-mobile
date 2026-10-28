import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';

import { Header } from '@/components/Header';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { AmountText, Button, Card, Dialog, EmptyState, Icon, Screen, SectionHeader, StatusBadge, Text, TextField } from '@/components/ui';
import { createCashClosure, getCashClosures, getClosureForDate, getUnpaidForDate } from '@/db/cashClosureRepository';
import { getTodayStats } from '@/db/transactionRepository';
import { CashClosure, DashboardStats, UnpaidMember } from '@/types';
import { localDateString } from '@/lib/dates';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { useAuth } from '@/context/AuthContext';
import { generateCashClosureReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

export default function CashClosureScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { activeCollector, activeBusiness } = useAuth();
  const { isTablet, horizontalPadding } = useResponsive();

  const [todayStats, setTodayStats] = useState<DashboardStats>({
    totalCollectedToday: 0,
    sabotayDepositsToday: 0,
    solContributionsToday: 0,
    withdrawalsToday: 0,
    activeClientsCount: 0,
    pendingTransactionsCount: 0,
  });

  const [declaredCash, setDeclaredCash] = useState('');
  const [discrepancyNote, setDiscrepancyNote] = useState('');
  const [closureHistory, setClosureHistory] = useState<CashClosure[]>([]);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  // Members not fully paid for today: the manager closes anyway or keeps the cash open
  const [unpaid, setUnpaid] = useState<UnpaidMember[]>([]);
  const [existingToday, setExistingToday] = useState<CashClosure | null>(null);
  const [isUnpaidDialogOpen, setIsUnpaidDialogOpen] = useState(false);
  const [closureNote, setClosureNote] = useState('');
  const todayStr = localDateString();

  const loadData = useCallback(async () => {
    try {
      const [stats, history, unpaidList, todayClosure] = await Promise.all([
        getTodayStats(),
        getCashClosures(),
        getUnpaidForDate(),
        getClosureForDate(),
      ]);
      setTodayStats(stats);
      setClosureHistory(history);
      setUnpaid(unpaidList);
      setExistingToday(todayClosure);
      setDeclaredCash(stats.totalCollectedToday.toString());
    } catch (err) {
      console.warn('Failed to load closure data:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const theoreticalBalance = todayStats.totalCollectedToday;
  const numDeclared = parseFloat(declaredCash) || 0;
  const discrepancy = numDeclared - theoreticalBalance;
  const hasDiscrepancy = Math.abs(discrepancy) > 0.01;
  const unpaidTotal = unpaid.reduce((sum, u) => sum + u.amount, 0);

  const handleShareClosurePdf = async (closure: CashClosure) => {
    setIsExportingPdf(true);
    try {
      const diff = closure.totalCashDeclared - closure.totalSystemCalculated;
      const pdfUri = await generateCashClosureReceiptPdf({
        closureId: closure.id,
        businessName: activeBusiness?.name,
        collectorName: activeCollector?.fullName || 'Bendy SERVILUS',
        collectorPhone: activeCollector?.phoneNumber || '',
        collectorZone: activeCollector?.zone,
        closureDate: closure.closureDate,
        totalCashDeclared: closure.totalCashDeclared,
        totalSystemCalculated: closure.totalSystemCalculated,
        discrepancy: diff,
        discrepancyReason: closure.discrepancyReason,
        status: closure.status,
        generatedAt: closure.createdAt || new Date().toISOString(),
        unpaidMembers: closure.unpaidMembers,
        closureNote: closure.closureNote,
      });
      await sharePdfFile(pdfUri, `Bordereau Clôture - ${closure.closureDate}`);
    } catch (err: any) {
      console.error('Failed to generate closure PDF:', err);
      Alert.alert(t('Erreur'), t('Impossible de générer le bordereau PDF.'));
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleOpenPinValidation = () => {
    if (isNaN(numDeclared) || numDeclared < 0) {
      Alert.alert(t('Montant invalide'), t('Veuillez saisir un montant réel constaté positif.'));
      return;
    }

    if (hasDiscrepancy && !discrepancyNote.trim()) {
      triggerErrorFeedback();
      Alert.alert(
        t('Justification Obligatoire'),
        t('Un écart de caisse de {0} a été constaté. Vous devez obligatoirement expliquer la cause de cet écart avant de clôturer.', formatCurrency(discrepancy))
      );
      return;
    }

    triggerMediumImpact();
    // Not everyone paid for today: list them, the manager decides (close anyway / keep open)
    if (unpaid.length > 0 || existingToday) {
      setIsUnpaidDialogOpen(true);
      return;
    }
    setIsPinModalOpen(true);
  };

  const handleCloseAnyway = () => {
    setIsUnpaidDialogOpen(false);
    setIsPinModalOpen(true);
  };

  const handleKeepOpen = () => {
    triggerLightImpact();
    setIsUnpaidDialogOpen(false);
  };

  const unpaidStateLabel = (u: UnpaidMember) =>
    u.state === 'LATE' ? t('En retard') : u.state === 'PARTIAL' ? t('Partiel') : t('Non payé');

  const handlePinSuccessSubmit = async () => {
    setIsPinModalOpen(false);
    setIsSubmitting(true);

    try {
      const createdClosure = await createCashClosure({
        totalCashDeclared: numDeclared,
        discrepancyReason: hasDiscrepancy ? discrepancyNote.trim() : undefined,
        unpaidMembers: unpaid,
        closureNote: closureNote.trim() || undefined,
      });

      triggerSuccessFeedback();
      Alert.alert(
        t('Clôture Enregistrée avec Succès !'),
        t('La journée a été clôturée avec un solde physique déclaré de {0}.', formatCurrency(numDeclared)),
        [
          { text: t('OK'), style: 'default' },
          {
            text: t('Bordereau PDF'),
            onPress: () => handleShareClosurePdf(createdClosure),
          },
        ]
      );
      setDiscrepancyNote('');
      setClosureNote('');
      loadData();
    } catch (err: any) {
      Alert.alert(t('Erreur'), err?.message || t('Échec de la clôture de caisse.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flexOne}>
      <Screen
        edges={['top', 'left', 'right', 'bottom']}
        header={
          <Header
            title={t('Clôture de caisse')}
            subtitle={t('Arrêté du jour')}
            showBack={true}
            showScanner={false}
            fallbackBackRoute="/(tabs)"
          />
        }
        footerSafeArea={false}
        footer={
          <Button
            size="lg"
            fullWidth
            icon="lock"
            label={isSubmitting ? t('Enregistrement…') : t('Valider la clôture')}
            loading={isSubmitting}
            onPress={handleOpenPinValidation}
          />
        }
      >
        {/* Theoretical summary */}
        <Card tone="hero" padding="lg" style={styles.cardGap}>
          <Text variant="caption" tone="muted">{t('Solde théorique en caisse aujourd\'hui')}</Text>
          <AmountText amount={theoreticalBalance} size="hero" />
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text variant="body" tone="muted" style={styles.flexShrink}>{t('Cotisations encaissées')}</Text>
            <AmountText amount={todayStats.sabotayDepositsToday} size="small" sign="credit" tone="success" />
          </View>
          <View style={styles.summaryRow}>
            <Text variant="body" tone="muted" style={styles.flexShrink}>{t('Mains remises')}</Text>
            <AmountText amount={todayStats.withdrawalsToday} size="small" sign="debit" tone="danger" />
          </View>
        </Card>

        {/* Who paid today */}
        {unpaid.length === 0 ? (
          <Card tone="success">
            <View style={styles.noticeRow}>
              <Icon name="check" size={22} color={theme.colors.success} strokeWidth={2.5} />
              <Text variant="body" tone="success" style={styles.flexShrink}>
                {t('Tous les adhérents ont payé pour le {0}.', formatDateShort(todayStr))}
              </Text>
            </View>
          </Card>
        ) : (
          <Card style={styles.cardGap}>
            <View style={styles.summaryRow}>
              <Text variant="subheading" style={styles.flexShrink}>{t('Non payés pour le {0}', formatDateShort(todayStr))}</Text>
              <AmountText amount={unpaidTotal} size="small" tone="warning" />
            </View>
            {unpaid.map((u) => (
              <View key={u.clientId} style={[styles.summaryRow, styles.unpaidRow]}>
                <View style={styles.flexShrink}>
                  <Text variant="bodyStrong" numberOfLines={1}>{u.fullName}</Text>
                  <Text variant="caption" tone="muted">{t('{0} main(s) · {1}', u.missingHands, formatCurrency(u.amount))}</Text>
                </View>
                <StatusBadge status={u.state === 'LATE' ? 'OVERDUE' : 'UNPAID_TODAY'} label={unpaidStateLabel(u)} appearance="inline" />
              </View>
            ))}
            <TextField
              label={t('Note de clôture (facultative)')}
              placeholder={t('Ex : SERVILUS paiera demain matin')}
              value={closureNote}
              onChangeText={setClosureNote}
            />
          </Card>
        )}

        {/* Declared cash */}
        <Card style={styles.cardGap}>
          <Text variant="label">{t('Montant constaté en caisse (HTG)')}</Text>
          <View style={styles.cashInputBox}>
            <Icon name="cash" size={24} color={theme.colors.textMuted} />
            <TextInput
              style={styles.cashInput}
              placeholder="0"
              placeholderTextColor={theme.colors.textPlaceholder}
              keyboardType="numeric"
              value={declaredCash}
              onChangeText={setDeclaredCash}
              accessibilityLabel={t('Montant réel constaté en espèces, en gourdes')}
              selectTextOnFocus
            />
            <Text variant="heading" tone="muted">{t('HTG')}</Text>
          </View>
        </Card>

        {/* Discrepancy */}
        <Card tone={hasDiscrepancy ? 'danger' : 'success'}>
          <View style={styles.noticeRow}>
            <Icon
              name={hasDiscrepancy ? 'alert' : 'check'}
              size={22}
              color={hasDiscrepancy ? theme.colors.danger : theme.colors.success}
              strokeWidth={2.5}
            />
            <View style={styles.flexShrink}>
              {hasDiscrepancy ? (
                <View style={styles.discrepancyTitle}>
                  <Text variant="subheading" tone="danger">{t('Écart')}</Text>
                  <AmountText amount={discrepancy} size="medium" tone="danger" sign={discrepancy > 0 ? 'credit' : 'debit'} />
                </View>
              ) : (
                <Text variant="subheading" tone="success">{t('Caisse équilibrée')}</Text>
              )}
              <Text variant="body" tone={hasDiscrepancy ? 'danger' : 'success'}>
                {hasDiscrepancy
                  ? discrepancy > 0
                    ? t('Excédent par rapport au calcul du système.')
                    : t('Déficit par rapport au calcul du système.')
                  : t('Le montant en caisse correspond aux enregistrements.')}
              </Text>
            </View>
          </View>
        </Card>

        {hasDiscrepancy && (
          <TextField
            label={t('Justification obligatoire de l\'écart')}
            multiline
            numberOfLines={3}
            placeholder={t('Ex : erreur de rendu de monnaie lors de la dernière tournée')}
            value={discrepancyNote}
            onChangeText={setDiscrepancyNote}
          />
        )}

        {/* Recent closures */}
        <SectionHeader title={t('Clôtures récentes')} count={closureHistory.length} />
        {closureHistory.length === 0 ? (
          <Card padding="none">
            <EmptyState icon="history" title={t('Aucune clôture enregistrée')} message={t('Vos arrêtés de caisse quotidiens apparaîtront ici.')} />
          </Card>
        ) : (
          closureHistory.map((item) => {
            const diff = item.totalCashDeclared - item.totalSystemCalculated;
            return (
              <Card key={item.id} style={styles.cardGap}>
                <View style={styles.summaryRow}>
                  <Text variant="bodyStrong" style={styles.flexShrink}>{t('Clôture du {0}', formatDateShort(item.closureDate))}
                  </Text>
                  <View style={styles.statusChip}>
                    <Text variant="label" tone="muted">
                      {item.status === 'APPROVED' ? t('Approuvée') : item.status === 'DRAFT' ? t('Brouillon') : t('Enregistrée')}
                    </Text>
                  </View>
                </View>
                <View style={styles.summaryRow}>
                  <Text variant="caption" tone="muted">{t('Déclaré')}</Text>
                  <AmountText amount={item.totalCashDeclared} size="small" />
                </View>
                <View style={styles.summaryRow}>
                  <Text variant="caption" tone="muted">{t('Théorique')}</Text>
                  <AmountText amount={item.totalSystemCalculated} size="small" />
                </View>
                {Math.abs(diff) > 0.01 && (
                  <View style={styles.summaryRow}>
                    <Text variant="caption" tone="danger">{t('Écart')}</Text>
                    <AmountText amount={diff} size="small" tone="danger" sign={diff > 0 ? 'credit' : 'debit'} />
                  </View>
                )}
                {item.discrepancyReason && (
                  <Text variant="caption" tone="muted">{t('Motif : {0}', item.discrepancyReason)}
                  </Text>
                )}
                {item.unpaidMembers && item.unpaidMembers.length > 0 && (
                  <Text variant="caption" tone="warning">
                    {t('Fermée avec {0} adhérent(s) non payé(s) : {1}', item.unpaidMembers.length, item.unpaidMembers.map((u) => u.fullName).join(', '))}
                  </Text>
                )}
                {item.closureNote && (
                  <Text variant="caption" tone="muted">{t('Note : {0}', item.closureNote)}</Text>
                )}
                <Button
                  label={t('Bordereau PDF')}
                  icon="printer"
                  variant="secondary"
                  fullWidth
                  loading={isExportingPdf}
                  onPress={() => handleShareClosurePdf(item)}
                />
              </Card>
            );
          })
        )}

        <Dialog
          visible={isUnpaidDialogOpen}
          onClose={handleKeepOpen}
          icon="alert"
          tone="danger"
          title={unpaid.length > 0 ? t('Tout le monde n\'a pas payé') : t('Caisse déjà clôturée aujourd\'hui')}
          actions={
            <View style={styles.dialogActions}>
              <Button label={t('Laisser la caisse ouverte')} variant="secondary" fullWidth onPress={handleKeepOpen} />
              <Button label={t('Fermer quand même')} icon="lock" fullWidth onPress={handleCloseAnyway} />
            </View>
          }
        >
          <View style={styles.cardGap}>
            {existingToday && (
              <Text variant="body">{t('Une clôture existe déjà pour le {0}. Une nouvelle clôture sera ajoutée.', formatDateShort(todayStr))}</Text>
            )}
            {unpaid.length > 0 && (
              <>
                <Text variant="body">
                  {t('{0} adhérent(s) n\'ont pas tout payé pour le {1} (total {2}) :', unpaid.length, formatDateShort(todayStr), formatCurrency(unpaidTotal))}
                </Text>
                {unpaid.map((u) => (
                  <Text key={u.clientId} variant="bodyStrong">
                    • {u.fullName} — {t('{0} main(s) · {1}', u.missingHands, formatCurrency(u.amount))} ({unpaidStateLabel(u)})
                  </Text>
                ))}
                <Text variant="caption" tone="muted">{t('La liste sera enregistrée avec la clôture et imprimée sur le bordereau.')}</Text>
              </>
            )}
          </View>
        </Dialog>

        {/* 4-Digit PIN Verification Modal */}
        <PinVerificationModal
          visible={isPinModalOpen}
          title={t('Confirmation de la Clôture')}
          subtitle={t('Veuillez saisir votre code PIN pour verrouiller la journée et enregistrer le solde déclaré de {0}.', formatCurrency(numDeclared))}
          onSuccess={handlePinSuccessSubmit}
          onCancel={() => setIsPinModalOpen(false)}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const createStyles = ({ colors, spacing, radius, layout, typography }: Theme) =>
  StyleSheet.create({
    flexOne: { flex: 1, backgroundColor: colors.background },
    flexShrink: { flex: 1, minWidth: 0 },
    cardGap: { gap: spacing.sm },
    summaryRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
    totalRow: { marginTop: spacing.xs, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },

    cashInputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: layout.actionHeight + spacing.lg,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    cashInput: { flex: 1, minWidth: 0, ...typography.amountLarge, color: colors.text, paddingVertical: spacing.sm },

    noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    discrepancyTitle: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
    unpaidRow: { alignItems: 'center', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
    dialogActions: { gap: spacing.sm, width: '100%' },
    statusChip: {
      minHeight: spacing.xxl,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
    },
  });
