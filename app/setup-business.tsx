import React, { useState, useEffect } from 'react';
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

import { saveBusinessConfig } from '@/db/businessRepository';
import { BusinessType, PaymentFrequency } from '@/types';
import { calculateCycleEndDate, getFrequencyLabel, calculateCycleTotalDays, getFrequencyIntervalDays } from '@/lib/dateCalculations';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { Icon } from '@/components/Icon';
import { SOL_COLORS } from '@/constants/Colors';

export default function SetupBusinessScreen() {
  const router = useRouter();

  const todayStr = new Date().toISOString().split('T')[0];

  const [businessType, setBusinessType] = useState<BusinessType>('SABOTAY');
  const [name, setName] = useState('Sabotay Marché Cluny 2026');
  const [contributionAmount, setContributionAmount] = useState('250');
  const [frequency, setFrequency] = useState<PaymentFrequency>('DAILY');
  const [totalSlots, setTotalSlots] = useState('12');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Automatically recalculate end date when startDate, totalSlots or frequency change
  useEffect(() => {
    const slots = parseInt(totalSlots, 10) || 1;
    const computedEnd = calculateCycleEndDate(startDate, slots, frequency);
    setEndDate(computedEnd);
  }, [startDate, totalSlots, frequency]);

  const handleTypeChange = (type: BusinessType) => {
    triggerLightImpact();
    setBusinessType(type);
    if (type === 'SABOTAY') {
      setName('Sabotay Marché Cluny 2026');
      setContributionAmount('250');
      setFrequency('DAILY');
    } else {
      setName('Sol Marché Salomon #1');
      setContributionAmount('1000');
      setFrequency('WED_SAT');
    }
  };

  const frequencyOptions: { key: PaymentFrequency; label: string; desc: string }[] = [
    { key: 'DAILY', label: 'Quotidien', desc: 'Chaque jour ouvré' },
    { key: 'WED_SAT', label: 'Mercredi & Samedi', desc: 'Jours de grand marché' },
    { key: 'WEEKLY_WED', label: 'Chaque Mercredi', desc: 'Hebdomadaire (Mercredi)' },
    { key: 'WEEKLY_SAT', label: 'Chaque Samedi', desc: 'Hebdomadaire (Samedi)' },
    { key: '8J', label: 'Tous les 8 Jours', desc: 'Cycle traditionnel de 8 jours' },
    { key: '15J', label: 'Quinzaine (15 Jours)', desc: 'Bimensuel / Quinzaine' },
    { key: 'MONTHLY', label: 'Mensuel', desc: 'Chaque fin de mois' },
  ];

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Nom requis', "Veuillez entrer le nom de l'activité ou du groupe.");
      return;
    }

    const numAmount = Number(contributionAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Montant invalide', 'Le montant de la cotisation doit être supérieur à 0.');
      return;
    }

    const numSlots = parseInt(totalSlots, 10);
    if (isNaN(numSlots) || numSlots <= 0) {
      Alert.alert('Nombre de membres invalide', 'Le nombre de participants doit être supérieur à 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      await saveBusinessConfig({
        collectorId: '',
        name: name.trim(),
        type: businessType,
        contributionAmount: numAmount,
        frequency,
        totalSlots: numSlots,
        startDate: startDate || todayStr,
        endDate: endDate || todayStr,
        status: 'ACTIVE',
      });

      triggerSuccessFeedback();
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || "Impossible d'enregistrer la configuration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Icon name="target" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.headerTitle}>Configuration de l'Activité</Text>
            <Text style={styles.headerSub}>
              Paramétrez les règles de votre carnet Sabotay ou groupe Sol pour lancer le cycle.
            </Text>
          </View>

          {/* Activity Type Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. TYPE D'ACTIVITÉ</Text>
            <View style={styles.typeSelectorRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleTypeChange('SABOTAY')}
                style={[
                  styles.typeCard,
                  businessType === 'SABOTAY' && styles.typeCardSelected,
                ]}
              >
                <View style={styles.typeCardHeader}>
                  <Icon
                    name="cash"
                    size={20}
                    color={businessType === 'SABOTAY' ? SOL_COLORS.primaryDark : '#475569'}
                  />
                  <Text
                    style={[
                      styles.typeCardName,
                      businessType === 'SABOTAY' && styles.typeCardNameSelected,
                    ]}
                  >
                    Sabotay
                  </Text>
                </View>
                <Text style={styles.typeCardDesc}>
                  Collecte d'épargne quotidienne flexible sur le marché
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleTypeChange('SOL')}
                style={[
                  styles.typeCard,
                  businessType === 'SOL' && styles.typeCardSelected,
                ]}
              >
                <View style={styles.typeCardHeader}>
                  <Icon
                    name="sol"
                    size={20}
                    color={businessType === 'SOL' ? SOL_COLORS.primaryDark : '#475569'}
                  />
                  <Text
                    style={[
                      styles.typeCardName,
                      businessType === 'SOL' && styles.typeCardNameSelected,
                    ]}
                  >
                    Sol (ROSCA)
                  </Text>
                </View>
                <Text style={styles.typeCardDesc}>
                  Épargne rotative périodique avec tirage et passage de mains
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Basic Parameters */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. PARAMÈTRES DU GROUPE / CARNET</Text>

            {/* Group Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NOM DU GROUPE OU DU CARNET *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="ex: Sabotay Marché Cluny 2026"
                placeholderTextColor="#94A3B8"
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Contribution Amount */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                MONTANT DE LA COTISATION PAR MAIN (HTG) *
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="ex: 250"
                placeholderTextColor="#94A3B8"
                value={contributionAmount}
                onChangeText={setContributionAmount}
                keyboardType="numeric"
              />
            </View>

            {/* Frequency Options */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>FRÉQUENCE DES VERSEMENTS *</Text>
              <View style={styles.frequencyList}>
                {frequencyOptions.map((opt) => {
                  const isSelected = frequency === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      activeOpacity={0.7}
                      onPress={() => {
                        triggerLightImpact();
                        setFrequency(opt.key);
                      }}
                      style={[
                        styles.frequencyItem,
                        isSelected && styles.frequencyItemSelected,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.frequencyLabel,
                            isSelected && styles.frequencyLabelSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        <Text style={styles.frequencyDesc}>{opt.desc}</Text>
                      </View>
                      {isSelected && (
                        <Icon name="check" size={16} color={SOL_COLORS.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Total Members (Enfants) */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                NOMBRE TOTAL D'ADHÉRENTS / PARTICIPANTS ("ENFANTS") *
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="ex: 12"
                placeholderTextColor="#94A3B8"
                value={totalSlots}
                onChangeText={setTotalSlots}
                keyboardType="number-pad"
              />
            </View>

            {/* Start Date */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>DATE DE DÉBUT DU CYCLE (AAAA-MM-JJ) *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor="#94A3B8"
                value={startDate}
                onChangeText={setStartDate}
              />
            </View>

            {/* Computed End Date & Cycle Duration Banner */}
            <View style={styles.computedBanner}>
              <View style={styles.computedBannerHeader}>
                <Icon name="calendar" size={16} color="#1D4ED8" />
                <Text style={styles.computedBannerTitle}>
                  DURÉE DU CYCLE & DATE DE FIN
                </Text>
              </View>
              <Text style={styles.computedEndDateValue}>
                {calculateCycleTotalDays(parseInt(totalSlots, 10) || 1, frequency)} jours de cycle
              </Text>
              <Text style={styles.computedExplanation}>
                Formule : {totalSlots} enfants × {getFrequencyIntervalDays(frequency)} jour(s) = {calculateCycleTotalDays(parseInt(totalSlots, 10) || 1, frequency)} jours.
              </Text>
              <Text style={[styles.computedExplanation, { marginTop: 4, fontWeight: '700', color: '#1D4ED8' }]}>
                Date de fin calculée : {formatDateShort(endDate)} ({endDate})
              </Text>
            </View>

            {/* Summary Box */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Valeur totale de la cagnotte (Po) :</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(
                    (Number(contributionAmount) || 0) * (parseInt(totalSlots, 10) || 0)
                  )}
                </Text>
              </View>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isSubmitting}
            onPress={handleSubmit}
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Enregistrement...' : "Valider et Lancer l'Activité"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 50,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: SOL_COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: 13,
    color: SOL_COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 10,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  typeCardSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: SOL_COLORS.primary,
  },
  typeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  typeCardName: {
    fontSize: 15,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  typeCardNameSelected: {
    color: SOL_COLORS.primaryDark,
  },
  typeCardDesc: {
    fontSize: 11,
    color: SOL_COLORS.textSecondary,
    lineHeight: 15,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  frequencyList: {
    gap: 6,
  },
  frequencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  frequencyItemSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: SOL_COLORS.primary,
  },
  frequencyLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  frequencyLabelSelected: {
    color: SOL_COLORS.primaryDark,
  },
  frequencyDesc: {
    fontSize: 11,
    color: SOL_COLORS.textSecondary,
    marginTop: 1,
  },
  computedBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginBottom: 14,
  },
  computedBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  computedBannerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  computedEndDateValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1E3A8A',
    marginBottom: 2,
  },
  computedExplanation: {
    fontSize: 12,
    color: '#3B82F6',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '900',
    color: SOL_COLORS.primary,
  },
  submitButton: {
    backgroundColor: SOL_COLORS.primary,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
});
