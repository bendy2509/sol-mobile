import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { Icon } from '@/components/Icon';
import { triggerLightImpact, triggerMediumImpact, triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithPin } = useAuth();

  const [activeField, setActiveField] = useState<'PHONE' | 'PIN'>('PHONE');
  const [phoneDigits, setPhoneDigits] = useState('37123456');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fullPhone = `+509${phoneDigits}`;

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
      setErrorMessage('Veuillez saisir votre numéro de téléphone (8 chiffres).');
      setActiveField('PHONE');
      return;
    }

    if (currentPin.length !== 4) {
      triggerErrorFeedback();
      setErrorMessage('Veuillez saisir les 4 chiffres de votre code PIN.');
      setActiveField('PIN');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await loginWithPin(phoneToUse, currentPin);
    setIsSubmitting(false);

    if (res.success) {
      triggerSuccessFeedback();
      if (res.role === 'ADMIN') {
        router.replace('/admin' as any);
      } else if (res.status === 'SUSPENDED') {
        router.replace('/suspended' as any);
      } else if (res.status === 'PENDING_APPROVAL') {
        router.replace('/pending-approval' as any);
      } else {
        const business = await getActiveBusinessConfig();
        if (!business) {
          router.replace('/setup-business' as any);
        } else {
          router.replace('/(tabs)' as any);
        }
      }
    } else {
      triggerErrorFeedback();
      setErrorMessage(res.error || 'Numéro de téléphone ou code PIN incorrect.');
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
      if (pin.length < 4) {
        const newPin = pin + digit;
        setPin(newPin);
        if (newPin.length === 4) {
          executeLogin(fullPhone, newPin);
        }
      }
    }
  };

  const handleBackspace = () => {
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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Brand Header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Icon name="shield" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.appName}>SOL MOBILE</Text>
          <Text style={styles.appTagline}>Tontine & Épargne Sécurisée en Haïti</Text>
        </View>

        {/* Inputs Card */}
        <View style={styles.inputCard}>
          {/* Phone Field */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              triggerLightImpact();
              setActiveField('PHONE');
            }}
            style={[
              styles.fieldContainer,
              activeField === 'PHONE' && styles.fieldContainerActive,
            ]}
          >
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldTitleRow}>
                <Icon
                  name="phone"
                  size={14}
                  color={activeField === 'PHONE' ? SOL_COLORS.primary : SOL_COLORS.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.fieldLabel,
                    activeField === 'PHONE' && styles.fieldLabelActive,
                  ]}
                >
                  NUMÉRO DE TÉLÉPHONE
                </Text>
              </View>
              {activeField === 'PHONE' && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ACTIF</Text>
                </View>
              )}
            </View>

            <View style={styles.phoneDisplayRow}>
              <View style={styles.countryCodeBadge}>
                <Text style={styles.countryPillFlagText}>HT</Text>
                <Text style={styles.countryCodeText}>+509</Text>
              </View>
              <View style={styles.phoneNumberBox}>
                <Text
                  style={[
                    styles.phoneNumberText,
                    !phoneDigits && styles.phoneNumberPlaceholder,
                  ]}
                >
                  {phoneDigits ? formatPhoneDisplay(phoneDigits) : '__ __ __ __'}
                </Text>
                {activeField === 'PHONE' && <View style={styles.cursorBlink} />}
              </View>
            </View>
          </TouchableOpacity>

          {/* PIN Field */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              triggerLightImpact();
              setActiveField('PIN');
            }}
            style={[
              styles.fieldContainer,
              activeField === 'PIN' && styles.fieldContainerActive,
              { marginTop: 10 },
            ]}
          >
            <View style={styles.fieldHeaderRow}>
              <View style={styles.fieldTitleRow}>
                <Icon
                  name="shield"
                  size={14}
                  color={activeField === 'PIN' ? SOL_COLORS.primary : SOL_COLORS.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.fieldLabel,
                    activeField === 'PIN' && styles.fieldLabelActive,
                  ]}
                >
                  CODE PIN PERSONNEL (4 CHIFFRES)
                </Text>
              </View>
              {activeField === 'PIN' && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ACTIF</Text>
                </View>
              )}
            </View>

            <View style={styles.pinDotsContainer}>
              {[0, 1, 2, 3].map((idx) => {
                const isFilled = idx < pin.length;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.pinDot,
                      isFilled && styles.pinDotFilled,
                      activeField === 'PIN' && idx === pin.length && styles.pinDotCurrent,
                      errorMessage ? styles.pinDotError : null,
                    ]}
                  />
                );
              })}
            </View>
          </TouchableOpacity>

          {/* Error Message */}
          {errorMessage && (
            <View style={styles.errorContainer}>
              <Icon name="alert" size={14} color={SOL_COLORS.danger} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}
        </View>

        {/* Numpad Section */}
        <View style={styles.keypadSection}>
          <View style={styles.keypadGrid}>
            {numpadKeys.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.keypadRow}>
                {row.map((k) => {
                  const isAction = k === 'C' || k === '⌫';
                  return (
                    <TouchableOpacity
                      key={k}
                      activeOpacity={0.6}
                      disabled={isSubmitting}
                      onPress={() => {
                        if (k === 'C') handleClear();
                        else if (k === '⌫') handleBackspace();
                        else handleDigit(k);
                      }}
                      style={[
                        styles.keyButton,
                        isAction && styles.actionKeyButton,
                      ]}
                    >
                      <Text style={[styles.keyText, isAction && styles.actionKeyText]}>
                        {k}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Submit / Advance Button */}
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isSubmitting}
            onPress={() => {
              if (activeField === 'PHONE') {
                if (phoneDigits.length >= 8) {
                  setActiveField('PIN');
                } else {
                  setErrorMessage('Veuillez saisir un numéro de 8 chiffres.');
                }
              } else {
                executeLogin(fullPhone, pin);
              }
            }}
            style={[
              styles.submitButton,
              isSubmitting && styles.submitButtonDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>
                {activeField === 'PHONE' ? 'Continuer vers le code PIN ➔' : 'Se Connecter'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push('/register' as any)}
            style={styles.registerLink}
          >
            <Text style={styles.registerLinkText}>
              Nouveau carnet ?{' '}
              <Text style={styles.registerLinkHighlight}>Inscrire un Gestionnaire</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  header: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    ...SHADOWS.sm,
  },
  appName: {
    fontSize: 22,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  fieldContainer: {
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: SOL_COLORS.border,
  },
  fieldContainerActive: {
    backgroundColor: '#F0FDFA',
    borderColor: SOL_COLORS.primary,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  fieldTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  fieldLabelActive: {
    color: SOL_COLORS.primaryDark,
  },
  activeBadge: {
    backgroundColor: SOL_COLORS.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: SOL_COLORS.primaryDark,
  },
  phoneDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  countryCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    marginRight: 8,
  },
  countryPillFlagText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginRight: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  countryCodeText: {
    fontSize: 14,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  phoneNumberBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneNumberText: {
    fontSize: 20,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    letterSpacing: 1.5,
  },
  phoneNumberPlaceholder: {
    color: SOL_COLORS.textMuted,
    letterSpacing: 2,
  },
  cursorBlink: {
    width: 2,
    height: 20,
    backgroundColor: SOL_COLORS.primary,
    marginLeft: 4,
  },
  pinDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 6,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: SOL_COLORS.borderStrong,
    backgroundColor: '#FFFFFF',
  },
  pinDotFilled: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primaryDark,
  },
  pinDotCurrent: {
    borderColor: SOL_COLORS.primary,
    backgroundColor: SOL_COLORS.primaryLight,
  },
  pinDotError: {
    borderColor: SOL_COLORS.danger,
    backgroundColor: SOL_COLORS.dangerLight,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.dangerLighter,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 10,
  },
  errorText: {
    color: SOL_COLORS.dangerDark,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  keypadSection: {
    marginTop: 10,
  },
  keypadGrid: {
    gap: 8,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  keyButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  actionKeyButton: {
    backgroundColor: SOL_COLORS.surfaceSubtle,
  },
  keyText: {
    fontSize: 20,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  actionKeyText: {
    fontSize: 16,
    color: SOL_COLORS.textSecondary,
    fontWeight: '700',
  },
  submitButton: {
    height: 52,
    backgroundColor: SOL_COLORS.primary,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    ...SHADOWS.sm,
  },
  submitButtonDisabled: {
    backgroundColor: SOL_COLORS.textMuted,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  footer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  registerLink: {
    paddingVertical: 6,
  },
  registerLinkText: {
    fontSize: 13,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
  },
  registerLinkHighlight: {
    color: SOL_COLORS.primaryDark,
    fontWeight: '800',
  },
});
