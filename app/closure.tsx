import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { createCashClosure, getCashClosures } from '@/db/cashClosureRepository';
import { getTodayStats } from '@/db/transactionRepository';
import { CashClosure, DashboardStats } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function CashClosureScreen() {
  const router = useRouter();

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
      await createCashClosure({
        totalCashDeclared: numDeclared,
        discrepancyReason: hasDiscrepancy ? discrepancyNote.trim() : undefined,
      });

      triggerSuccessFeedback();
      Alert.alert(
        'Clôture Enregistrée avec Succès !',
        `La journée a été clôturée avec un solde physique déclaré de ${formatCurrency(numDeclared)}.`
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
    <SafeAreaView style={styles.container}>
      <Header
        title="Clôture Journalière"
        subtitle="Arrêté de caisse & contrôle des espèces"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Theoretical Summary Box */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryCardHeader}>
              <Icon name="cash" size={16} color={SOL_COLORS.primary} />
              <Text style={styles.summaryTitle}>SITUATION THÉORIQUE DU JOUR</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Encaissements (Cotisations) :</Text>
              <Text style={styles.summaryValueIn}>
                +{formatCurrency(todayStats.sabotayDepositsToday)}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Décaissements (Mains remises) :</Text>
              <Text style={styles.summaryValueOut}>
                -{formatCurrency(todayStats.withdrawalsToday)}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabelBold}>Solde Théorique en Caisse :</Text>
              <Text style={styles.summaryTheoreticalBalance}>
                {formatCurrency(theoreticalBalance)}
              </Text>
            </View>
          </View>

          {/* Declared Cash Input */}
          <View style={styles.inputSection}>
            <Text style={styles.sectionLabel}>MONTANT RÉEL CONSTATÉ EN ESPÈCES (HTG)</Text>
            <View style={styles.inputBox}>
              <Icon name="cash" size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.textInput}
                placeholder="0"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={declaredCash}
                onChangeText={setDeclaredCash}
              />
            </View>
          </View>

          {/* Discrepancy Indicator Card */}
          <View
            style={[
              styles.discrepancyCard,
              hasDiscrepancy ? styles.discrepancyCardAlert : styles.discrepancyCardBalanced,
            ]}
          >
            <View style={styles.discrepancyHeader}>
              <Icon
                name={hasDiscrepancy ? 'alert' : 'check'}
                size={14}
                color={hasDiscrepancy ? '#DC2626' : '#059669'}
              />
              <Text
                style={[
                  styles.discrepancyTitle,
                  { color: hasDiscrepancy ? '#DC2626' : '#059669' },
                ]}
              >
                {hasDiscrepancy
                  ? `ÉCART DÉTECTÉ : ${formatCurrency(discrepancy)}`
                  : 'CAISSE ÉQUILIBRÉE (AUCUN ÉCART)'}
              </Text>
            </View>
            <Text style={styles.discrepancySub}>
              {hasDiscrepancy
                ? discrepancy > 0
                  ? 'Excédent constaté par rapport au calcul système.'
                  : 'Déficit constaté par rapport au calcul système.'
                : 'Le montant physique correspond parfaitement aux enregistrements.'}
            </Text>
          </View>

          {/* Mandatory Discrepancy Note */}
          {hasDiscrepancy && (
            <View style={styles.noteSection}>
              <Text style={styles.noteLabel}>JUSTIFICATION OBLIGATOIRE DE L'ÉCART</Text>
              <TextInput
                style={styles.noteInput}
                multiline
                numberOfLines={3}
                placeholder="Ex: Erreur de rendu de monnaie lors de la dernière tournée."
                placeholderTextColor="#94A3B8"
                value={discrepancyNote}
                onChangeText={setDiscrepancyNote}
              />
            </View>
          )}

          {/* Submit Closure Button */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenPinValidation}
            disabled={isSubmitting}
            style={styles.submitBtn}
          >
            <Icon name="shield" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.submitBtnText}>
              {isSubmitting ? 'Enregistrement...' : 'Valider la Clôture (Code PIN)'}
            </Text>
          </TouchableOpacity>

          {/* Recent Closures History */}
          <View style={styles.historySection}>
            <Text style={styles.historySectionTitle}>HISTORIQUE DES CLÔTURES RÉCENTES</Text>

            {closureHistory.length === 0 ? (
              <Text style={styles.emptyHistoryText}>Aucune clôture enregistrée.</Text>
            ) : (
              closureHistory.map((item) => (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyTopRow}>
                    <Text style={styles.historyDate}>
                      Clôture du {formatDateShort(item.closureDate)}
                    </Text>
                    <View style={styles.historyBadge}>
                      <Text style={styles.historyBadgeText}>{item.status}</Text>
                    </View>
                  </View>

                  <View style={styles.historyDetailRow}>
                    <Text style={styles.historyDetailLabel}>Déclaré :</Text>
                    <Text style={styles.historyDetailValue}>
                      {formatCurrency(item.totalCashDeclared)}
                    </Text>
                  </View>

                  <View style={styles.historyDetailRow}>
                    <Text style={styles.historyDetailLabel}>Théorique :</Text>
                    <Text style={styles.historyDetailValue}>
                      {formatCurrency(item.totalSystemCalculated)}
                    </Text>
                  </View>

                  {item.discrepancyReason && (
                    <Text style={styles.historyNoteText}>
                      Motif : {item.discrepancyReason}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 4-Digit PIN Verification Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Confirmation de la Clôture"
        subtitle={`Veuillez saisir votre code PIN pour verrouiller la journée et enregistrer le solde déclaré de ${formatCurrency(numDeclared)}.`}
        onSuccess={handlePinSuccessSubmit}
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 14,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  summaryLabelBold: {
    fontSize: 13,
    color: SOL_COLORS.textPrimary,
    fontWeight: '800',
  },
  summaryValueIn: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  summaryValueOut: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  summaryTheoreticalBalance: {
    fontSize: 16,
    fontWeight: '900',
    color: SOL_COLORS.primary,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },
  inputSection: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  discrepancyCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  discrepancyCardBalanced: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  discrepancyCardAlert: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  discrepancyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  discrepancyTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  discrepancySub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  noteSection: {
    marginBottom: 14,
  },
  noteLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#DC2626',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  noteInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    padding: 12,
    fontSize: 13,
    fontWeight: '600',
    color: SOL_COLORS.textPrimary,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    height: 52,
    borderRadius: 14,
    marginBottom: 20,
    elevation: 2,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  historySection: {
    marginTop: 6,
  },
  historySectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  emptyHistoryText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 8,
  },
  historyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyDate: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  historyBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  historyDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  historyDetailLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  historyDetailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  historyNoteText: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
