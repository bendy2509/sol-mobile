import React, { useState, useMemo } from 'react';
import { View, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { BusinessType, Frequency } from '@/types';
import { AmountText, Button, Card, Chip, Icon, PinDots, PinPad, Text, TextField } from '@/components/ui';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const { registerManager } = useAuth();
  const { horizontalPadding } = useResponsive();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Intro + stepper */}
          <View style={styles.intro}>
            <Text variant="label" tone="primary">
              Étape {step} sur 2
            </Text>
            <Text variant="title" accessibilityRole="header">
              Créer un compte gestionnaire
            </Text>
            <Text variant="body" tone="muted">
              {step === 1
                ? 'Votre profil et le code PIN qui protège chaque opération.'
                : 'Les règles de votre carnet : montant, fréquence et nombre de places.'}
            </Text>
          </View>

          <View style={styles.stepper} accessible accessibilityLabel={`Étape ${step} sur 2`}>
            {[
              { n: 1, label: 'Profil & code PIN' },
              { n: 2, label: 'Activité' },
            ].map((s) => {
              const isDone = step > s.n;
              const isCurrent = step === s.n;
              return (
                <View key={s.n} style={styles.stepItem}>
                  <View style={[styles.stepBar, (isDone || isCurrent) && styles.stepBarActive]} />
                  <View style={styles.stepLabelRow}>
                    {isDone ? (
                      <Icon name="check" size={14} color={theme.colors.primary} />
                    ) : (
                      <Text variant="label" tone={isCurrent ? 'primary' : 'muted'}>
                        {s.n}.
                      </Text>
                    )}
                    <Text variant="label" tone={isCurrent || isDone ? 'primary' : 'muted'} numberOfLines={1} style={styles.flexShrink}>
                      {s.label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {step === 1 ? (
            /* STEP 1: Profile & 4-Digit PIN */
            <View style={styles.stepContent}>
              <Card style={styles.fieldsCard}>
                <TextField
                  label="Nom complet du gestionnaire"
                  placeholder="Ex : Jean-Baptiste Pierre"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
                <TextField
                  label="Numéro de téléphone"
                  placeholder="+509 37 00 0000"
                  keyboardType="phone-pad"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                />
              </Card>

              {/* PIN Setup & Confirmation */}
              <Card style={styles.pinCard}>
                <View style={styles.fieldLabelRow}>
                  <Icon name="lock" size={16} color={theme.colors.primary} />
                  <Text variant="label" tone="primary" style={styles.flexShrink}>
                    {pin.length < 4 ? 'Définissez votre code PIN (4 chiffres)' : 'Confirmez votre code PIN (4 chiffres)'}
                  </Text>
                </View>

                <View style={styles.pinRows}>
                  <View style={[styles.pinRow, pin.length < 4 && styles.pinRowActive]}>
                    <Text variant="label" tone={pin.length < 4 ? 'default' : 'muted'}>
                      Code PIN
                    </Text>
                    <PinDots filled={pin.length} active={pin.length < 4} size="md" />
                  </View>
                  <View style={[styles.pinRow, pin.length === 4 && styles.pinRowActive]}>
                    <Text variant="label" tone={pin.length === 4 ? 'default' : 'muted'}>
                      Confirmation
                    </Text>
                    <PinDots filled={pinConfirm.length} active={pin.length === 4 && pinConfirm.length < 4} size="md" />
                  </View>
                </View>
              </Card>

              <PinPad
                onDigit={handlePinDigit}
                onBackspace={handlePinBackspace}
                onClear={() => {
                  setPin('');
                  setPinConfirm('');
                }}
                compact
              />

              {/* Next Step Button */}
              <Button
                size="lg"
                fullWidth
                icon="arrow-right"
                iconPosition="right"
                label="Continuer vers l'activité"
                onPress={handleNextStep}
              />
            </View>
          ) : (
            /* STEP 2: Business Configuration */
            <View style={styles.stepContent}>
              <Card style={styles.fieldsCard}>
                <TextField
                  label="Nom du SOL / carnet"
                  placeholder="Ex : Sol Mache Klnik"
                  value={businessName}
                  onChangeText={setBusinessName}
                />

                {/* Business Type Switch */}
                <View style={styles.group}>
                  <Text variant="label">Type d'activité</Text>
                  <View style={styles.chipRow}>
                    <Chip
                      label="Sabotay (quotidien)"
                      selected={businessType === 'SABOTAY'}
                      onPress={() => {
                        triggerLightImpact();
                        setBusinessType('SABOTAY');
                      }}
                    />
                    <Chip
                      label="Sol (rotatif)"
                      selected={businessType === 'SOL'}
                      onPress={() => {
                        triggerLightImpact();
                        setBusinessType('SOL');
                      }}
                    />
                  </View>
                </View>

                {/* Unit Amount of Hand */}
                <TextField
                  label="Montant d'une main (HTG)"
                  placeholder="250"
                  keyboardType="numeric"
                  value={unitAmount}
                  onChangeText={setUnitAmount}
                />

                {/* Frequency */}
                <View style={styles.group}>
                  <Text variant="label">Fréquence de versement</Text>
                  <View style={styles.chipRow}>
                    {[
                      { key: 'DAILY' as Frequency, label: 'Quotidien' },
                      { key: '8_DAYS' as Frequency, label: 'Tous les 8 jours' },
                      { key: '15_DAYS' as Frequency, label: 'Quinzaine (15 jours)' },
                      { key: 'MONTHLY' as Frequency, label: 'Mensuel' },
                    ].map((f) => (
                      <Chip
                        key={f.key}
                        label={f.label}
                        selected={frequency === f.key}
                        onPress={() => {
                          triggerLightImpact();
                          setFrequency(f.key);
                        }}
                      />
                    ))}
                  </View>
                </View>

                {/* Total Slots / Children */}
                <TextField
                  label="Nombre total d'enfants (places)"
                  placeholder="10"
                  keyboardType="numeric"
                  value={totalSlots}
                  onChangeText={setTotalSlots}
                />
              </Card>

              {/* Synthesis Card */}
              <Card tone="sunken" style={styles.summaryCard}>
                <Text variant="subheading">Résumé du cycle de collecte</Text>
                <View style={styles.summaryRow}>
                  <Text variant="body" tone="muted" style={styles.flexShrink}>
                    Valeur d'une main
                  </Text>
                  <AmountText amount={parseFloat(unitAmount) || 0} size="small" />
                </View>
                <View style={styles.summaryRow}>
                  <Text variant="body" tone="muted" style={styles.flexShrink}>
                    Nombre d'adhérents
                  </Text>
                  <Text variant="amountSmall">{totalSlots || '0'} enfants</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text variant="bodyStrong" style={styles.flexShrink}>
                    Cagnotte par ramassage
                  </Text>
                  <AmountText amount={totalPot} size="medium" tone="primary" />
                </View>
              </Card>

              {/* Navigation Action Buttons */}
              <View style={styles.stepBtnRow}>
                <Button variant="secondary" size="lg" label="Retour" onPress={() => setStep(1)} style={styles.backBtn} />
                <Button
                  size="lg"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                  icon="check"
                  label={isSubmitting ? 'Création…' : 'Finaliser'}
                  accessibilityLabel="Finaliser et soumettre l'inscription"
                  onPress={handleSubmit}
                  style={styles.submitBtn}
                />
              </View>
            </View>
          )}

          {/* Login Redirection Link */}
          <Pressable
            onPress={() => router.replace('/login' as any)}
            accessibilityRole="link"
            accessibilityLabel="Vous avez déjà un compte ? Se connecter"
            style={({ pressed }) => [styles.loginLink, pressed && styles.pressedLink]}
          >
            <Text variant="body" tone="muted" align="center">
              Vous avez déjà un compte ?{' '}
              <Text variant="bodyStrong" tone="primary">
                Se connecter
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = ({ colors, spacing, radius, layout }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    flexShrink: { flex: 1, minWidth: 0 },
    scrollContent: {
      width: '100%',
      maxWidth: 540,
      alignSelf: 'center',
      gap: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
    },

    intro: { gap: spacing.xs },
    stepper: { flexDirection: 'row', gap: spacing.sm },
    stepItem: { flex: 1, gap: spacing.xs },
    stepBar: { height: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.border },
    stepBarActive: { backgroundColor: colors.primary },
    stepLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

    stepContent: { gap: spacing.md },
    fieldsCard: { gap: spacing.lg },
    group: { gap: spacing.sm },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

    pinCard: { gap: spacing.md },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    pinRows: { gap: spacing.sm },
    pinRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      minHeight: layout.touchTarget,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    pinRowActive: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surface },

    summaryCard: { gap: spacing.sm },
    summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    divider: { height: 1, backgroundColor: colors.border },

    stepBtnRow: { flexDirection: 'row', gap: spacing.sm },
    backBtn: { flex: 1 },
    submitBtn: { flex: 2 },

    loginLink: { minHeight: layout.touchTarget, justifyContent: 'center', borderRadius: radius.md },
    pressedLink: { backgroundColor: colors.surfacePressed },
  });
