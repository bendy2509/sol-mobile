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

import { createClient } from '@/db/clientRepository';
import { getActiveBusinessConfig, saveBusinessConfig } from '@/db/businessRepository';
import { getMembersWithPaymentStatus } from '@/db/memberRepository';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { BusinessConfig, ClientType } from '@/types';
import { calculateCycleEndDate, getFrequencyLabel } from '@/lib/dateCalculations';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerSuccessFeedback, triggerErrorFeedback, triggerLightImpact } from '@/lib/haptics';
import { Icon } from '@/components/Icon';
import { SOL_COLORS } from '@/constants/Colors';

export default function NewClientScreen() {
  const router = useRouter();
  const { activeCollector } = useAuth();
  const { triggerSync } = useSync();

  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [nextRank, setNextRank] = useState<number>(1);
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+509');
  const [clientType, setClientType] = useState<ClientType>('SABOTAY');
  const [dailyAmount, setDailyAmount] = useState('250');
  const [initialDeposit, setInitialDeposit] = useState('0');
  const [autoExtendCycle, setAutoExtendCycle] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadContext() {
      const [activeBiz, members] = await Promise.all([
        getActiveBusinessConfig(),
        getMembersWithPaymentStatus(),
      ]);
      setBusiness(activeBiz);
      const computedNextRank = members.length + 1;
      setNextRank(computedNextRank);

      if (activeBiz) {
        setClientType(activeBiz.type === 'SOL' ? 'SOL' : 'SABOTAY');
        setDailyAmount(activeBiz.contributionAmount.toString());
      }
    }
    loadContext();
  }, []);

  const handleTypeSelect = (type: ClientType) => {
    triggerLightImpact();
    setClientType(type);
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('Nom requis', "Veuillez saisir le nom complet de l'adhérent.");
      return;
    }

    if (phoneNumber.trim().length < 8) {
      Alert.alert('Numéro invalide', 'Veuillez saisir un numéro de téléphone valide.');
      return;
    }

    const numDaily = parseFloat(dailyAmount);
    if (isNaN(numDaily) || numDaily <= 0) {
      Alert.alert('Montant invalide', 'Veuillez entrer une cotisation supérieure à 0 HTG.');
      return;
    }

    const numInitial = parseFloat(initialDeposit) || 0;

    setIsSubmitting(true);
    try {
      const collectorId = activeCollector?.id || 'c0000000-0000-0000-0000-000000000001';

      // 1. Create client locally
      const client = await createClient({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        type: clientType,
        dailyAmount: numDaily,
        initialDeposit: numInitial,
        collectorId,
      });

      // 2. If autoExtendCycle is true and active business exists, extend slots and recompute end date
      if (autoExtendCycle && business) {
        const newTotalSlots = Math.max(business.totalSlots, nextRank);
        const newEndDate = calculateCycleEndDate(
          business.startDate,
          newTotalSlots,
          business.frequency
        );

        await saveBusinessConfig({
          id: business.id,
          collectorId: business.collectorId,
          name: business.name,
          type: business.type,
          contributionAmount: business.contributionAmount,
          frequency: business.frequency,
          totalSlots: newTotalSlots,
          startDate: business.startDate,
          endDate: newEndDate,
          status: business.status,
        });
      }

      triggerSuccessFeedback();
      triggerSync();

      Alert.alert(
        'Adhérent Enregistré !',
        `${fullName} a été inscrit avec succès.\nPosition attribuée : Main #${nextRank}`,
        [
          {
            text: 'Voir le Tableau de Bord',
            onPress: () => router.replace('/(tabs)' as any),
          },
        ]
      );
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert('Erreur', err?.message || "Échec de l'enregistrement de l'adhérent.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const simulatedExtendedEndDate = business
    ? calculateCycleEndDate(
        business.startDate,
        Math.max(business.totalSlots, nextRank),
        business.frequency
      )
    : '';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Card */}
          <View style={styles.headerBox}>
            <View style={styles.iconCircle}>
              <Icon name="user" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.headerTitle}>Nouvel Adhérent ("Enfant")</Text>
            <Text style={styles.headerSubtitle}>
              Inscription locale immédiate sans connexion internet requise.
            </Text>
          </View>

          {/* Rank & Cycle Info Banner */}
          <View style={styles.cycleInfoCard}>
            <View style={styles.cycleInfoTop}>
              <Icon name="crown" size={18} color="#1D4ED8" />
              <Text style={styles.cycleInfoTitle}>POSITION DE MAIN ATTRIBUÉE</Text>
            </View>
            <Text style={styles.cycleRankValue}>Main #{nextRank}</Text>
            {business && (
              <Text style={styles.cycleExplanation}>
                Intégré au groupe "{business.name}". Date de fin prévisionnelle :{' '}
                {formatDateShort(simulatedExtendedEndDate)}.
              </Text>
            )}
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            {/* Full Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>NOM COMPLET DE L'ADHÉRENT *</Text>
              <TextInput
                style={styles.input}
                placeholder="ex: Marie Carmel St-Fleur"
                placeholderTextColor="#94A3B8"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            {/* Phone Number */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>NUMÉRO DE TÉLÉPHONE (+509) *</Text>
              <TextInput
                style={styles.input}
                placeholder="+509 3X XX XX XX"
                placeholderTextColor="#94A3B8"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />
            </View>

            {/* Client / Account Type */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>TYPE DE CARNET *</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => handleTypeSelect('SABOTAY')}
                  style={[
                    styles.typeBtn,
                    clientType === 'SABOTAY' && styles.typeBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      clientType === 'SABOTAY' && styles.typeBtnTextActive,
                    ]}
                  >
                    Sabotay
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => handleTypeSelect('SOL')}
                  style={[
                    styles.typeBtn,
                    clientType === 'SOL' && styles.typeBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      clientType === 'SOL' && styles.typeBtnTextActive,
                    ]}
                  >
                    Sol (ROSCA)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => handleTypeSelect('HYBRID')}
                  style={[
                    styles.typeBtn,
                    clientType === 'HYBRID' && styles.typeBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      clientType === 'HYBRID' && styles.typeBtnTextActive,
                    ]}
                  >
                    Hybride
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Contribution Amount */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>COTISATION PAR VERSEMENT (HTG) *</Text>
              <TextInput
                style={styles.input}
                placeholder="250"
                placeholderTextColor="#94A3B8"
                value={dailyAmount}
                onChangeText={setDailyAmount}
                keyboardType="numeric"
              />
            </View>

            {/* Initial Deposit */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>PREMIER VERSEMENT IMMÉDIAT (HTG, OPTIONNEL)</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor="#94A3B8"
                value={initialDeposit}
                onChangeText={setInitialDeposit}
                keyboardType="numeric"
              />
            </View>

            {/* Auto extend cycle switch */}
            {business && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setAutoExtendCycle(!autoExtendCycle)}
                style={styles.checkboxRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    autoExtendCycle && styles.checkboxSelected,
                  ]}
                >
                  {autoExtendCycle && <Icon name="check" size={12} color="#FFFFFF" />}
                </View>
                <Text style={styles.checkboxLabel}>
                  Prolonger automatiquement la date de fin du cycle Sol ({getFrequencyLabel(business.frequency)})
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isSubmitting}
            onPress={handleSave}
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
          >
            <Text style={styles.submitBtnText}>
              {isSubmitting ? 'Enregistrement...' : "Inscrire l'Adhérent"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  headerBox: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SOL_COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  cycleInfoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginBottom: 16,
  },
  cycleInfoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cycleInfoTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  cycleRankValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1E3A8A',
    marginVertical: 2,
  },
  cycleExplanation: {
    fontSize: 11,
    color: '#3B82F6',
    fontWeight: '500',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  typeBtnActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primaryDark,
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  typeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxSelected: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  submitBtn: {
    backgroundColor: SOL_COLORS.primary,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
});
