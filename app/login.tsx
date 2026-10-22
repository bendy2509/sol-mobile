import React, { useState, useMemo, useEffect } from 'react';
import { View, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/context/AuthContext';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { Button, Card, Icon, PinDots, PinPad, Text } from '@/components/ui';
import { triggerLightImpact, triggerMediumImpact, triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

export default function LoginScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { loginWithPin, loginWithBiometrics, biometricAvailable, biometricPhone } = useAuth();
  const { isSmallScreen, isVerySmallScreen, horizontalPadding, height } = useResponsive();
  const isCompactHeight = height < 700;

  const [activeField, setActiveField] = useState<'PHONE' | 'PIN'>('PHONE');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fullPhone = `+509${phoneDigits}`;

  // Pre-fill the last phone number used on this device
  useEffect(() => {
    AsyncStorage.getItem('SOL_LAST_PHONE').then((last) => {
      const digits = (last || '').replace(/\D/g, '').replace(/^509/, '').slice(0, 8);
      if (digits.length === 8) {
        setPhoneDigits(digits);
        setActiveField('PIN');
      }
    });
  }, []);

  const goToCarnet = async () => {
    const business = await getActiveBusinessConfig();
    router.replace((business ? '/(tabs)' : '/setup-business') as any);
  };

  const handleBiometric = async () => {
    setErrorMessage(null);
    const res = await loginWithBiometrics();
    if (res.success) await goToCarnet();
    else if (res.error) setErrorMessage(res.error);
  };

  const formatPhoneDisplay = (digits: string) => {
    if (!digits) return '';
    const parts: string[] = [];
    for (let i = 0; i < digits.length; i += 2) {
      parts.push(digits.slice(i, i + 2));
    }
    return parts.join(' ');
  };

  const executeLogin = async (phoneToUse: string, currentPin: string) => {
    if (!phoneToUse || phoneToUse.length < 8) {
      triggerErrorFeedback();
      setErrorMessage(t('Veuillez saisir votre numéro de téléphone (8 chiffres).'));
      setActiveField('PHONE');
      return;
    }

    if (currentPin.length !== 4) {
      triggerErrorFeedback();
      setErrorMessage(t('Veuillez saisir les 4 chiffres de votre code PIN.'));
      setActiveField('PIN');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await loginWithPin(phoneToUse, currentPin);
    setIsSubmitting(false);

    if (res.success) {
      triggerSuccessFeedback();
      await goToCarnet();
    } else {
      triggerErrorFeedback();
      setErrorMessage(res.error || t('Numéro de téléphone ou code PIN incorrect.'));
      setPin('');
      setActiveField('PIN');
    }
  };

  const handleDigit = (digit: string) => {
    triggerLightImpact();
    setErrorMessage(null);

    if (activeField === 'PHONE') {
      if (phoneDigits.length < 8) {
        const newPhone = phoneDigits + digit;
        setPhoneDigits(newPhone);
        if (newPhone.length === 8) {
          triggerMediumImpact();
          setActiveField('PIN');
        }
      }
    } else {
      if (pin.length < 4 && !isSubmitting) {
        const newPin = pin + digit;
        setPin(newPin);
        if (newPin.length === 4) {
          setIsSubmitting(true);
          // Yield to JS event loop so the 4th dot turns active immediately and loader renders
          setTimeout(() => {
            executeLogin(fullPhone, newPin);
          }, 30);
        }
      }
    }
  };

  const handleBackspace = () => {
    if (isSubmitting) return;
    triggerLightImpact();
    setErrorMessage(null);

    if (activeField === 'PHONE') {
      if (phoneDigits.length > 0) {
        setPhoneDigits(phoneDigits.slice(0, -1));
      }
    } else {
      if (pin.length > 0) {
        setPin(pin.slice(0, -1));
      } else {
        setActiveField('PHONE');
      }
    }
  };

  const handleClear = () => {
    if (isSubmitting) return;
    triggerLightImpact();
    setErrorMessage(null);
    if (activeField === 'PHONE') {
      setPhoneDigits('');
    } else {
      setPin('');
    }
  };

  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', '⌫'],
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Brand */}
        <View style={styles.brand}>
          <View style={styles.logo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text variant="amountLarge" style={styles.logoLetter}>
              S
            </Text>
          </View>
          <View style={styles.flagRule} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.flagBlue} />
            <View style={styles.flagRed} />
          </View>
          <Text variant="title" accessibilityRole="header">{t('SOL Mobile')}</Text>
          <Text variant="body" tone="muted" align="center">{t('Tontine et épargne sécurisées en Haïti')}</Text>
        </View>

        {/* Fields */}
        <View style={styles.fieldsCard}>
          <Pressable
            onPress={() => {
              triggerLightImpact();
              setActiveField('PHONE');
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: activeField === 'PHONE' }}
            accessibilityLabel={t('Numéro de téléphone : {0}', phoneDigits ? formatPhoneDisplay(phoneDigits) : 'vide')}
            style={[styles.field, activeField === 'PHONE' && styles.fieldActive]}
          >
            <View style={styles.fieldLabelRow}>
              <Icon name="phone" size={16} color={activeField === 'PHONE' ? theme.colors.primary : theme.colors.textMuted} />
              <Text variant="label" tone={activeField === 'PHONE' ? 'primary' : 'muted'}>{t('Numéro de téléphone')}</Text>
            </View>
            <View style={styles.phoneRow}>
              <View style={styles.countryChip}>
                <Text variant="label">+509</Text>
              </View>
              <Text variant="amountLarge" tone={phoneDigits ? 'default' : 'muted'} numberOfLines={1}>
                {phoneDigits ? formatPhoneDisplay(phoneDigits) : '__ __ __ __'}
              </Text>
              {activeField === 'PHONE' && <View style={styles.cursor} />}
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerLightImpact();
              setActiveField('PIN');
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: activeField === 'PIN' }}
            accessibilityLabel={t('Code PIN personnel, 4 chiffres')}
            style={[styles.field, activeField === 'PIN' && styles.fieldActive]}
          >
            <View style={styles.fieldLabelRow}>
              <Icon name="lock" size={16} color={activeField === 'PIN' ? theme.colors.primary : theme.colors.textMuted} />
              <Text variant="label" tone={activeField === 'PIN' ? 'primary' : 'muted'}>{t('Code PIN personnel (4 chiffres)')}</Text>
            </View>
            <View style={styles.pinRow}>
              <PinDots filled={pin.length} active={activeField === 'PIN'} error={!!errorMessage} size="md" />
            </View>
            {isSubmitting && (
              <View style={styles.submittingRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text variant="label" tone="primary">{t('Vérification du code PIN…')}</Text>
              </View>
            )}
          </Pressable>

          {errorMessage && (
            <Card tone="danger" padding="sm">
              <View style={styles.errorRow}>
                <Icon name="alert" size={16} color={theme.colors.danger} />
                <Text variant="label" tone="danger" style={styles.flexShrink}>
                  {errorMessage}
                </Text>
              </View>
            </Card>
          )}
        </View>

        {/* Keypad + main action (thumb zone) */}
        <View style={styles.keypadBlock}>
          <PinPad onDigit={handleDigit} onBackspace={handleBackspace} onClear={handleClear} disabled={isSubmitting} compact={isCompactHeight} />
          <Button
            size="lg"
            fullWidth
            loading={isSubmitting}
            icon={activeField === 'PHONE' ? 'arrow-right' : 'lock'}
            iconPosition={activeField === 'PHONE' ? 'right' : 'left'}
            label={activeField === 'PHONE' ? t('Continuer') : t('Se connecter')}
            onPress={() => {
              if (activeField === 'PHONE') {
                if (phoneDigits.length >= 8) {
                  setActiveField('PIN');
                } else {
                  setErrorMessage(t('Veuillez saisir un numéro de 8 chiffres.'));
                }
              } else {
                executeLogin(fullPhone, pin);
              }
            }}
          />
        </View>

        {biometricAvailable && !!biometricPhone && (
          <Button variant="secondary" fullWidth icon="fingerprint" label={t('Déverrouiller avec la biométrie')} onPress={handleBiometric} />
        )}

        <View style={styles.helpLinks}>
          <Button
            variant="ghost"
            label={t('Code PIN oublié ?')}
            onPress={() => router.push({ pathname: '/recover-pin', params: { phone: phoneDigits } } as any)}
          />
          <Button variant="ghost" label={t('Restaurer une sauvegarde')} onPress={() => router.push('/restore-backup' as any)} />
        </View>

        {/* Register link */}
        <Pressable
          onPress={() => router.push('/register' as any)}
          accessibilityRole="link"
          accessibilityLabel={t('Nouveau carnet ? Inscrire un gestionnaire')}
          style={({ pressed }) => [styles.registerLink, pressed && styles.pressedLink]}
        >
          <Text variant="body" tone="muted" align="center">{t('Nouveau carnet ?')}{' '}
            <Text variant="bodyStrong" tone="primary">{t('Inscrire un gestionnaire')}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = ({ colors, spacing, radius, layout, brand }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
      flexGrow: 1,
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
      paddingVertical: spacing.xl,
    },
    flexShrink: { flex: 1, minWidth: 0 },

    brand: { alignItems: 'center', gap: spacing.xs },
    logo: {
      width: spacing.xxxl,
      height: spacing.xxxl,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: brand.haitiBlue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { color: brand.white },
    flagRule: { flexDirection: 'row', width: spacing.xxxl, height: spacing.xs, marginBottom: spacing.sm, marginTop: spacing.xs },
    flagBlue: { flex: 1, backgroundColor: brand.haitiBlue },
    flagRed: { flex: 1, backgroundColor: brand.haitiRed },

    fieldsCard: { gap: spacing.md },
    field: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.surfaceAlt,
      backgroundColor: colors.surfaceAlt,
    },
    fieldActive: { borderColor: colors.primary, backgroundColor: colors.surface },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    phoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    countryChip: {
      minHeight: spacing.xxl + spacing.xs,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
    },
    cursor: { width: 2, height: spacing.xl + spacing.xs, backgroundColor: colors.primary },
    pinRow: { paddingVertical: spacing.xs },
    submittingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

    keypadBlock: { gap: spacing.md },
    helpLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
    registerLink: { minHeight: layout.touchTarget, justifyContent: 'center', borderRadius: radius.md },
    pressedLink: { backgroundColor: colors.surfacePressed },
  });
