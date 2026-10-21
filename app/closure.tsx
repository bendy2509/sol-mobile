import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';

import { Header } from '@/components/Header';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { AmountText, Button, Card, EmptyState, Icon, Screen, SectionHeader, Text, TextField } from '@/components/ui';
import { createCashClosure, getCashClosures } from '@/db/cashClosureRepository';
import { getTodayStats } from '@/db/transactionRepository';
import { CashClosure, DashboardStats } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { useAuth } from '@/context/AuthContext';
import { generateCashClosureReceiptPdf, sharePdfFile } from '@/services/pdfService';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

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

  const loadData = useCallback(async () => {
    try {
      const [stats, history] = await Promise.all([
        getTodayStats(),
        getCashClosures(),
      ]);
      setTodayStats(stats);
      setClosureHistory(history);
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

  const handleShareClosurePdf = async (closure: CashClosure) => {
    setIsExportingPdf(true);
    try {
      const diff = closure.totalCashDeclared - closure.totalSystemCalculated;
      const pdfUri = await generateCashClosureReceiptPdf({
        closureId: closure.id,
        businessName: activeBusiness?.name,
        collectorName: activeCollector?.fullName || 'Gestionnaire Caisse',
        collectorPhone: activeCollector?.phoneNumber || '',
        collectorZone: activeCollector?.zone,
        closureDate: closure.closureDate,
        totalCashDeclared: closure.totalCashDeclared,
        totalSystemCalculated: closure.totalSystemCalculated,
        discrepancy: diff,
        discrepancyReason: closure.discrepancyReason,
        status: closure.status,
        generatedAt: closure.createdAt || new Date().toISOString(),
      });
      await sharePdfFile(pdfUri, `Bordereau Clôture - ${closure.closureDate}`);
    } catch (err: any) {
      console.error('Failed to generate closure PDF:', err);
      Alert.alert('Erreur', 'Impossible de générer le bordereau PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleOpenPinValidation = () => {
    if (isNaN(numDeclared) || numDeclared < 0) {
      Alert.alert('Montant invalide', 'Veuillez saisir un montant réel constaté positif.');
      return;
    }

    if (hasDiscrepancy && !discrepancyNote.trim()) {
      triggerErrorFeedback();
      Alert.alert(
        'Justification Obligatoire',
        `Un écart de caisse de ${formatCurrency(discrepancy)} a été constaté. Vous devez obligatoirement expliquer la cause de cet écart avant de clôturer.`
      );
      return;
    }

    triggerMediumImpact();
    setIsPinModalOpen(true);
  };

  const handlePinSuccessSubmit = async () => {
    setIsPinModalOpen(false);
    setIsSubmitting(true);

    try {
      const createdClosure = await createCashClosure({
        totalCashDeclared: numDeclared,
        discrepancyReason: hasDiscrepancy ? discrepancyNote.trim() : undefined,
      });

      triggerSuccessFeedback();
      Alert.alert(
        'Clôture Enregistrée avec Succès !',
        `La journée a été clôturée avec un solde physique déclaré de ${formatCurrency(numDeclared)}.`,
        [
          { text: 'OK', style: 'default' },
          {
            text: '📄 Bordereau PDF',
            onPress: () => handleShareClosurePdf(createdClosure),
          },
        ]
      );
      setDiscrepancyNote('');
      loadData();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Échec de la clôture de caisse.');
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
            title="Clôture de caisse"
            subtitle="Arrêté du jour et contrôle des espèces"
            showBack={true}
            showProfile={false}
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
            label={isSubmitting ? 'Enregistrement…' : 'Valider la clôture (PIN)'}
            loading={isSubmitting}
            onPress={handleOpenPinValidation}
          />
        }
      >
        {/* Theoretical summary */}
        <Card style={styles.cardGap}>
          <Text variant="subheading" accessibilityRole="header">
            Situation théorique du jour
          </Text>
          <View style={styles.summaryRow}>
            <Text variant="body" tone="muted" style={styles.flexShrink}>
              Encaissements (cotisations)
            </Text>
            <AmountText amount={todayStats.sabotayDepositsToday} size="small" sign="credit" tone="success" />
          </View>
          <View style={styles.summaryRow}>
            <Text variant="body" tone="muted" style={styles.flexShrink}>
              Décaissements (mains remises)
            </Text>
            <AmountText amount={todayStats.withdrawalsToday} size="small" sign="debit" tone="danger" />
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text variant="bodyStrong" style={styles.flexShrink}>
              Solde théorique en caisse
            </Text>
            <AmountText amount={theoreticalBalance} size="large" tone="primary" />
          </View>
        </Card>

        {/* Declared cash */}
        <Card style={styles.cardGap}>
          <Text variant="label">Montant constaté en caisse (HTG)</Text>
          <View style={styles.cashInputBox}>
            <Icon name="cash" size={24} color={theme.colors.textMuted} />
            <TextInput
              style={styles.cashInput}
              placeholder="0"
              placeholderTextColor={theme.colors.textPlaceholder}
              keyboardType="numeric"
              value={declaredCash}
              onChangeText={setDeclaredCash}
              accessibilityLabel="Montant réel constaté en espèces, en gourdes"
              selectTextOnFocus
            />
            <Text variant="heading" tone="muted">
              HTG
            </Text>
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
                  <Text variant="subheading" tone="danger">
                    Écart
                  </Text>
                  <AmountText amount={discrepancy} size="medium" tone="danger" sign={discrepancy > 0 ? 'credit' : 'debit'} />
                </View>
              ) : (
                <Text variant="subheading" tone="success">
                  Caisse équilibrée
                </Text>
              )}
              <Text variant="body" tone={hasDiscrepancy ? 'danger' : 'success'}>
                {hasDiscrepancy
                  ? discrepancy > 0
                    ? 'Excédent par rapport au calcul du système.'
                    : 'Déficit par rapport au calcul du système.'
                  : 'Le montant en caisse correspond aux enregistrements.'}
              </Text>
            </View>
          </View>
        </Card>

        {hasDiscrepancy && (
          <TextField
            label="Justification obligatoire de l'écart"
            multiline
            numberOfLines={3}
            placeholder="Ex : erreur de rendu de monnaie lors de la dernière tournée"
            value={discrepancyNote}
            onChangeText={setDiscrepancyNote}
          />
        )}

        {/* Recent closures */}
        <SectionHeader title="Clôtures récentes" count={closureHistory.length} />
        {closureHistory.length === 0 ? (
          <Card padding="none">
            <EmptyState icon="history" title="Aucune clôture enregistrée" message="Vos arrêtés de caisse quotidiens apparaîtront ici." />
          </Card>
        ) : (
          closureHistory.map((item) => {
            const diff = item.totalCashDeclared - item.totalSystemCalculated;
            return (
              <Card key={item.id} style={styles.cardGap}>
                <View style={styles.summaryRow}>
                  <Text variant="bodyStrong" style={styles.flexShrink}>
                    Clôture du {formatDateShort(item.closureDate)}
                  </Text>
                  <View style={styles.statusChip}>
                    <Text variant="label" tone="muted">
                      {item.status}
                    </Text>
                  </View>
                </View>
                <View style={styles.summaryRow}>
                  <Text variant="caption" tone="muted">
                    Déclaré
                  </Text>
                  <AmountText amount={item.totalCashDeclared} size="small" />
                </View>
                <View style={styles.summaryRow}>
                  <Text variant="caption" tone="muted">
                    Théorique
                  </Text>
                  <AmountText amount={item.totalSystemCalculated} size="small" />
                </View>
                {Math.abs(diff) > 0.01 && (
                  <View style={styles.summaryRow}>
                    <Text variant="caption" tone="danger">
                      Écart
                    </Text>
                    <AmountText amount={diff} size="small" tone="danger" sign={diff > 0 ? 'credit' : 'debit'} />
                  </View>
                )}
                {item.discrepancyReason && (
                  <Text variant="caption" tone="muted">
                    Motif : {item.discrepancyReason}
                  </Text>
                )}
                <Button
                  label="Bordereau PDF"
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

        {/* 4-Digit PIN Verification Modal */}
        <PinVerificationModal
          visible={isPinModalOpen}
          title="Confirmation de la Clôture"
          subtitle={`Veuillez saisir votre code PIN pour verrouiller la journée et enregistrer le solde déclaré de ${formatCurrency(numDeclared)}.`}
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
    statusChip: {
      minHeight: spacing.xxl,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
    },
  });
