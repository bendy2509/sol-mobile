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
import { BusinessConfig } from '@/types';
import { calculateCycleEndDate, getFrequencyLabel } from '@/lib/dateCalculations';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerSuccessFeedback, triggerErrorFeedback, triggerLightImpact } from '@/lib/haptics';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { SOL_COLORS } from '@/constants/Colors';

export default function NewClientScreen() {
  const router = useRouter();
  const { activeCollector } = useAuth();
  const { triggerSync } = useSync();

  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [nextRank, setNextRank] = useState<number>(1);
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+509');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const unitAmount = business?.contributionAmount || 250;

  useEffect(() => {
    async function loadContext() {
      const [activeBiz, members] = await Promise.all([
        getActiveBusinessConfig(),
        getMembersWithPaymentStatus(),
      ]);
      setBusiness(activeBiz);
      const computedNextRank = members.length + 1;
      setNextRank(computedNextRank);
    }
    loadContext();
  }, []);

  const handleSave = () => {
    if (!fullName.trim()) {
      triggerErrorFeedback();
      Alert.alert('Nom requis', "Veuillez saisir le nom complet de l'adhérent.");
      return;
    }

    if (phoneNumber.trim().length < 8) {
      triggerErrorFeedback();
      Alert.alert('Numéro invalide', 'Veuillez saisir un numéro de téléphone valide.');
      return;
    }

    triggerLightImpact();
    setIsPinModalOpen(true);
  };

  const executeSaveClient = async () => {
    setIsPinModalOpen(false);
    setIsSubmitting(true);
    try {
      const collectorId = activeCollector?.id || 'c011ec70-0000-0000-0000-000000000001';

      // 1. Create client locally using the carnet's fixed unit hand amount
      const client = await createClient({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        type: business?.type === 'SOL' ? 'SOL' : 'SABOTAY',
        dailyAmount: unitAmount,
        initialDeposit: 0,
        collectorId,
        businessId: business?.id,
        payoutRank: nextRank,
      });

      // 2. Adjust total cycle slots and recompute end date if needed
      if (business) {
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
      triggerSync().catch(() => {});

      Alert.alert(
        'Adhérent Enregistré !',
        `${fullName.trim()} a été ajouté avec succès avec la Main #${nextRank} (${formatCurrency(unitAmount)} / main).`,
        [
          {
            text: 'OK',
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Box */}
          <View style={styles.headerBox}>
            <View style={styles.iconCircle}>
              <Icon name="user" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.headerTitle}>Nouvel Adhérent ("Enfant")</Text>
            <Text style={styles.headerSubtitle}>
              Inscription directe dans le carnet actif de votre SOL.
            </Text>
          </View>

          {/* Assigned Hand Rank Banner */}
          <View style={styles.cycleInfoCard}>
            <View style={styles.cycleInfoTop}>
              <Icon name="crown" size={16} color="#1D4ED8" />
              <Text style={styles.cycleInfoTitle}>RANG & POSITION DE MAIN ATTRIBUÉE</Text>
            </View>
            <Text style={styles.cycleRankValue}>Main #{nextRank}</Text>
            {business && (
              <Text style={styles.cycleExplanation}>
                Carnet : <Text style={styles.boldText}>{business.name}</Text> • Fréquence : {getFrequencyLabel(business.frequency)}
              </Text>
            )}
          </View>

          {/* Fixed Carnet Amount Card (Informational / Read-Only) */}
          <View style={styles.amountFixedCard}>
            <View style={styles.amountFixedLeft}>
              <Icon name="cash" size={20} color="#059669" />
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.amountFixedLabel}>COTISATION PAR MAIN (DÉFINIE PAR LE CARNET)</Text>
                <Text style={styles.amountFixedValue}>{formatCurrency(unitAmount)} <Text style={styles.amountFixedSub}>/ échéance</Text></Text>
              </View>
            </View>
          </View>

          {/* Form Card */}
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
                autoCapitalize="words"
              />
            </View>

            {/* Phone Number */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>NUMÉRO DE TÉLÉPHONE (+509...) *</Text>
              <TextInput
                style={styles.input}
                placeholder="+509 3X XX XX XX"
                placeholderTextColor="#94A3B8"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSave}
              disabled={isSubmitting}
              style={styles.submitBtn}
            >
              <Icon name="check" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>
                {isSubmitting ? 'Enregistrement...' : "Enregistrer l'Adhérent"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 4-Digit PIN Security Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Validation de l'Inscription"
        subtitle={`Saisissez votre code PIN gestionnaire (4 chiffres) pour confirmer l'ajout de l'adhérent ${fullName} (Main #${nextRank}).`}
        onSuccess={executeSaveClient}
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
  headerBox: {
    alignItems: 'center',
    marginBottom: 14,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SOL_COLORS.primary,
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
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  cycleInfoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginBottom: 12,
  },
  cycleInfoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  cycleInfoTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  cycleRankValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1E3A8A',
    marginVertical: 2,
  },
  cycleExplanation: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    fontWeight: '600',
  },
  boldText: {
    fontWeight: '800',
    color: SOL_COLORS.primary,
  },
  amountFixedCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 14,
  },
  amountFixedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountFixedLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.5,
  },
  amountFixedValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#065F46',
    marginTop: 1,
  },
  amountFixedSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    height: 48,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    height: 52,
    borderRadius: 14,
    marginTop: 6,
    elevation: 2,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
