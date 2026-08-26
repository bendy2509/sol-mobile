import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { BusinessType, Frequency } from '@/types';
import { Icon } from '@/components/Icon';
import { SOL_COLORS } from '@/constants/Colors';
import { formatCurrency } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';

export default function RegisterScreen() {
  const router = useRouter();
  const { registerManager } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Manager Info & 4-digit PIN
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+509');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  // Step 2: Business / Sol Configuration
  const [businessName, setBusinessName] = useState('Sol Mache Klnik');
  const [businessType, setBusinessType] = useState<BusinessType>('SABOTAY');
  const [unitAmount, setUnitAmount] = useState('250');
  const [frequency, setFrequency] = useState<Frequency>('DAILY');
  const [totalSlots, setTotalSlots] = useState('10');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePinDigit = (digit: string) => {
    triggerLightImpact();
    if (pin.length < 4) {
      setPin(pin + digit);
    } else if (pinConfirm.length < 4) {
      setPinConfirm(pinConfirm + digit);
    }
  };

  const handlePinBackspace = () => {
    triggerLightImpact();
    if (pinConfirm.length > 0) {
      setPinConfirm(pinConfirm.slice(0, -1));
    } else if (pin.length > 0) {
      setPin(pin.slice(0, -1));
    }
  };

  const handleNextStep = () => {
    if (!fullName.trim()) {
      Alert.alert('Nom requis', 'Veuillez entrer votre nom complet.');
      return;
    }
    if (!phoneNumber.trim() || phoneNumber.trim().length < 8) {
      Alert.alert('Téléphone requis', 'Veuillez entrer un numéro de téléphone valide.');
      return;
    }
    if (pin.length !== 4) {
      Alert.alert('Code PIN requis', 'Veuillez définir un code PIN à 4 chiffres.');
      return;
    }
    if (pin !== pinConfirm) {
      Alert.alert('Confirmation incorrecte', 'Les deux codes PIN saisis ne correspondent pas.');
      setPinConfirm('');
      return;
    }

    triggerMediumImpact();
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!businessName.trim()) {
      Alert.alert('Nom du SOL requis', 'Veuillez entrer le nom de votre carnet ou groupe SOL.');
      return;
    }
    const numAmount = parseFloat(unitAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Montant invalide', "Veuillez saisir un montant unitaire supérieur à 0 HTG.");
      return;
    }
    const numSlots = parseInt(totalSlots, 10);
    if (isNaN(numSlots) || numSlots <= 0) {
      Alert.alert('Nombre de places invalide', "Veuillez définir un nombre d'enfants supérieur à 0.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await registerManager({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        pin,
        businessName: businessName.trim(),
        businessType,
        unitAmount: numAmount,
        frequency,
        totalSlots: numSlots,
      });

      if (result.success) {
        triggerSuccessFeedback();
        router.replace('/pending-approval' as any);
      } else {
        triggerErrorFeedback();
        Alert.alert("Échec de l'inscription", result.error || 'Une erreur est survenue.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', '⌫'],
  ];

  const totalPot = (parseFloat(unitAmount) || 0) * (parseInt(totalSlots, 10) || 0);

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
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Icon name="user" size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>Créer un Compte Gestionnaire</Text>
            <Text style={styles.subtitle}>
              Étape {step} sur 2 : {step === 1 ? 'Profil & Code PIN' : "Paramétrage de l'Activité"}
            </Text>
          </View>

          {/* Stepper Progress */}
          <View style={styles.stepperContainer}>
            <View style={[styles.stepBar, styles.stepBarActive]} />
            <View style={[styles.stepBar, step === 2 && styles.stepBarActive]} />
          </View>

          {step === 1 ? (
            /* STEP 1: Profile & 4-Digit PIN */
            <View style={styles.stepContent}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>NOM COMPLET DU GESTIONNAIRE</Text>
                <View style={styles.inputBox}>
                  <Icon name="user" size={16} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ex: Jean-Baptiste Pierre"
                    placeholderTextColor="#94A3B8"
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>NUMÉRO DE TÉLÉPHONE</Text>
                <View style={styles.inputBox}>
                  <Icon name="phone" size={16} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="+509 37 00 0000"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                  />
                </View>
              </View>

              {/* PIN Setup & Confirmation */}
              <View style={styles.pinSection}>
                <Text style={styles.label}>
                  {pin.length < 4
                    ? 'DÉFINISSEZ VOTRE CODE PIN (4 CHIFFRES)'
                    : 'CONFIRMEZ VOTRE CODE PIN (4 CHIFFRES)'}
                </Text>

                <View style={styles.pinDisplayRow}>
                  <View style={styles.pinDotsBox}>
                    <Text style={styles.pinDotsLabel}>PIN :</Text>
                    <View style={styles.dotsRow}>
                      {[0, 1, 2, 3].map((i) => (
                        <View
                          key={`pin-${i}`}
                          style={[styles.dot, i < pin.length && styles.dotFilled]}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.pinDotsBox}>
                    <Text style={styles.pinDotsLabel}>Confirmation :</Text>
                    <View style={styles.dotsRow}>
                      {[0, 1, 2, 3].map((i) => (
                        <View
                          key={`conf-${i}`}
                          style={[styles.dot, i < pinConfirm.length && styles.dotFilled]}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              </View>

              {/* Keypad for PIN */}
              <View style={styles.keypadGrid}>
                {numpadKeys.map((row, rIndex) => (
                  <View key={`r-${rIndex}`} style={styles.keypadRow}>
                    {row.map((k) => {
                      const isAction = k === 'C' || k === '⌫';
                      return (
                        <TouchableOpacity
                          key={k}
                          activeOpacity={0.6}
                          onPress={() => {
                            if (k === 'C') {
                              setPin('');
                              setPinConfirm('');
                            } else if (k === '⌫') {
                              handlePinBackspace();
                            } else {
                              handlePinDigit(k);
                            }
                          }}
                          style={[styles.keyBtn, isAction && styles.keyBtnAction]}
                        >
                          <Text style={[styles.keyText, isAction && styles.keyTextAction]}>
                            {k}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* Next Step Button */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleNextStep}
                style={[
                  styles.primaryBtn,
                  (!fullName.trim() || pin.length !== 4 || pinConfirm.length !== 4) &&
                    styles.primaryBtnDisabled,
                ]}
              >
                <Text style={styles.primaryBtnText}>Continuer vers l'Activité</Text>
                <Icon name="arrow-right" size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>
          ) : (
            /* STEP 2: Business Configuration */
            <View style={styles.stepContent}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>NOM DU SOL / CARNET</Text>
                <View style={styles.inputBox}>
                  <Icon name="sol" size={16} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ex: Sol Mache Klnik"
                    placeholderTextColor="#94A3B8"
                    value={businessName}
                    onChangeText={setBusinessName}
                  />
                </View>
              </View>

              {/* Business Type Switch */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>TYPE D'ACTIVITÉ</Text>
                <View style={styles.typeSwitchRow}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      triggerLightImpact();
                      setBusinessType('SABOTAY');
                    }}
                    style={[
                      styles.typeSwitchBtn,
                      businessType === 'SABOTAY' && styles.typeSwitchBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeSwitchText,
                        businessType === 'SABOTAY' && styles.typeSwitchTextActive,
                      ]}
                    >
                      Sabotay (Quotidien)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      triggerLightImpact();
                      setBusinessType('SOL');
                    }}
                    style={[
                      styles.typeSwitchBtn,
                      businessType === 'SOL' && styles.typeSwitchBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeSwitchText,
                        businessType === 'SOL' && styles.typeSwitchTextActive,
                      ]}
                    >
                      Sol (Rotatif)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Unit Amount of Hand */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>MONTANT UNITAIRE D'UNE MAIN (HTG)</Text>
                <View style={styles.inputBox}>
                  <Icon name="cash" size={16} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="250"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={unitAmount}
                    onChangeText={setUnitAmount}
                  />
                </View>
              </View>

              {/* Frequency */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>FRÉQUENCE DE VERSEMENT</Text>
                <View style={styles.freqGrid}>
                  {[
                    { key: 'DAILY' as Frequency, label: 'Quotidien (Tous les jours)' },
                    { key: '8_DAYS' as Frequency, label: 'Tous les 8 Jours' },
                    { key: '15_DAYS' as Frequency, label: 'Quinzaine (15 Jours)' },
                    { key: 'MONTHLY' as Frequency, label: 'Mensuel (Fin de mois)' },
                  ].map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      activeOpacity={0.7}
                      onPress={() => {
                        triggerLightImpact();
                        setFrequency(f.key);
                      }}
                      style={[
                        styles.freqChip,
                        frequency === f.key && styles.freqChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.freqChipText,
                          frequency === f.key && styles.freqChipTextActive,
                        ]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Total Slots / Children */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>NOMBRE TOTAL D'ENFANTS / SLOTS</Text>
                <View style={styles.inputBox}>
                  <Icon name="users" size={16} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="10"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={totalSlots}
                    onChangeText={setTotalSlots}
                  />
                </View>
              </View>

              {/* Synthesis Card */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>RÉSUMÉ DU CYCLE DE COLLECTE</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Valeur d'une main :</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(parseFloat(unitAmount) || 0)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Nombre d'adhérents :</Text>
                  <Text style={styles.summaryValue}>{totalSlots || '0'} enfants</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Cagnotte par ramassage :</Text>
                  <Text style={styles.summaryPot}>{formatCurrency(totalPot)}</Text>
                </View>
              </View>

              {/* Navigation Action Buttons */}
              <View style={styles.stepBtnRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setStep(1)}
                  style={styles.backBtn}
                >
                  <Text style={styles.backBtnText}>Retour</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={isSubmitting}
                  onPress={handleSubmit}
                  style={[styles.primaryBtn, { flex: 2 }]}
                >
                  <Text style={styles.primaryBtnText}>
                    {isSubmitting ? 'Création...' : 'Finaliser & Soumettre'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Login Redirection Link */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.replace('/login' as any)}
            style={styles.loginLink}
          >
            <Text style={styles.loginLinkText}>
              Vous avez déjà un compte ? <Text style={styles.loginLinkHighlight}>Se connecter</Text>
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
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
  },
  stepperContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  stepBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
  },
  stepBarActive: {
    backgroundColor: SOL_COLORS.primary,
  },
  stepContent: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  pinSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 12,
  },
  pinDisplayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  pinDotsBox: {
    alignItems: 'center',
  },
  pinDotsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
  },
  dotFilled: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primary,
    transform: [{ scale: 1.2 }],
  },
  keypadGrid: {
    width: '100%',
    marginVertical: 8,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  keyBtn: {
    flex: 1,
    height: 48,
    marginHorizontal: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  keyBtnAction: {
    backgroundColor: '#F1F5F9',
  },
  keyText: {
    fontSize: 20,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  keyTextAction: {
    fontSize: 16,
    color: '#64748B',
  },
  typeSwitchRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
  },
  typeSwitchBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeSwitchBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  typeSwitchText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  typeSwitchTextActive: {
    color: SOL_COLORS.primary,
    fontWeight: '800',
  },
  freqGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  freqChip: {
    flexBasis: '48%',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  freqChipActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primaryDark,
  },
  freqChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  freqChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginVertical: 12,
  },
  summaryTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
  },
  summaryPot: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    height: 52,
    borderRadius: 14,
    marginTop: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  stepBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  backBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginTop: 10,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  loginLinkText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  loginLinkHighlight: {
    color: SOL_COLORS.primary,
    fontWeight: '800',
  },
});
