import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { Icon } from '@/components/Icon';
import { triggerLightImpact, triggerMediumImpact, triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';
import { normalizePhoneNumber } from '@/lib/phoneUtils';

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithPin } = useAuth();

  // Active focus target: either typing phone number or security PIN
  const [activeField, setActiveField] = useState<'PHONE' | 'PIN'>('PHONE');

  // Digits state (managed exclusively via our custom in-app keypad)
  const [phoneDigits, setPhoneDigits] = useState('37123456'); // Default demo phone digits
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Full normalized phone string
  const fullPhone = `+509${phoneDigits}`;

  // Formatter for Haitian 8-digit numbers: XX XX XX XX
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
      setErrorMessage(res.error || 'Identifiants invalides.');
      setPin('');
      setActiveField('PIN');
    }
  };

  // Tactile Numpad Handlers (100% in-app custom keyboard)
  const handleDigit = (digit: string) => {
    triggerLightImpact();
    setErrorMessage(null);

    if (activeField === 'PHONE') {
      if (phoneDigits.length < 8) {
        const newPhone = phoneDigits + digit;
        setPhoneDigits(newPhone);
        if (newPhone.length === 8) {
          // Automatically advance to PIN entry once 8 phone digits are entered
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
        // If PIN is empty, pressing backspace returns focus to phone
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
            <Icon name="shield" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.appName}>SOL MOBILE</Text>
          <Text style={styles.appTagline}>Plateforme d'Épargne & Tontine Sécurisée</Text>
        </View>

        {/* Unified Input Card with Active Field Selection */}
        <View style={styles.inputCard}>
          {/* 1. Phone Number Field (Tactile Selectable) */}
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon
                  name="phone"
                  size={14}
                  color={activeField === 'PHONE' ? SOL_COLORS.primary : '#64748B'}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.fieldLabel,
                    activeField === 'PHONE' && styles.fieldLabelActive,
                  ]}
                >
                  1. NUMÉRO DE TÉLÉPHONE
                </Text>
              </View>
              {activeField === 'PHONE' && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>SAISIE ACTIVE</Text>
                </View>
              )}
            </View>

            <View style={styles.phoneDisplayRow}>
              <View style={styles.countryCodeBadge}>
                <Text style={styles.countryCodeText}>🇭🇹 +509</Text>
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

          {/* 2. Security PIN Field (Tactile Selectable) */}
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon
                  name="shield"
                  size={14}
                  color={activeField === 'PIN' ? SOL_COLORS.primary : '#64748B'}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.fieldLabel,
                    activeField === 'PIN' && styles.fieldLabelActive,
                  ]}
                >
                  2. CODE PIN (4 CHIFFRES)
                </Text>
              </View>
              {activeField === 'PIN' && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>SAISIE ACTIVE</Text>
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

          {/* Error Message Feedback */}
          {errorMessage && (
            <View style={styles.errorContainer}>
              <Icon name="alert" size={14} color="#DC2626" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}
        </View>

        {/* Dedicated Tactile In-App Security Keypad */}
        <View style={styles.keypadSection}>
          <View style={styles.keypadGrid}>
            {numpadKeys.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.keypadRow}>
                {row.map((k) => {
                  const isAction = k === 'C' || k === '⌫';
                  return (
                    <TouchableOpacity
                      key={k}
                      activeOpacity={0.5}
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

          {/* Action Trigger Button */}
          <TouchableOpacity
            activeOpacity={0.85}
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
                {activeField === 'PHONE' ? 'Suivant : Saisir PIN ➔' : 'Se Connecter'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer Link */}
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
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  header: {
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  appName: {
    fontSize: 22,
    fontWeight: '900',
    color: SOL_COLORS.primary,
    letterSpacing: 0.5,
  },
  appTagline: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '600',
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  fieldContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  fieldContainerActive: {
    backgroundColor: '#EFF6FF',
    borderColor: SOL_COLORS.primary,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  fieldLabelActive: {
    color: SOL_COLORS.primary,
  },
  activeBadge: {
    backgroundColor: SOL_COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  phoneDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCodeBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  countryCodeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1E293B',
  },
  phoneNumberBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneNumberText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1.5,
  },
  phoneNumberPlaceholder: {
    color: '#94A3B8',
  },
  cursorBlink: {
    width: 2,
    height: 18,
    backgroundColor: SOL_COLORS.primary,
    marginLeft: 4,
  },
  pinDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 6,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
  },
  pinDotFilled: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primary,
    transform: [{ scale: 1.25 }],
  },
  pinDotCurrent: {
    borderColor: SOL_COLORS.primary,
    backgroundColor: '#DBEAFE',
  },
  pinDotError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    backgroundColor: '#FEF2F2',
    padding: 6,
    borderRadius: 8,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '800',
  },
  keypadSection: {
    width: '100%',
    marginTop: 6,
  },
  keypadGrid: {
    width: '100%',
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  keyButton: {
    flex: 1,
    height: 48,
    marginHorizontal: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    elevation: 1,
  },
  actionKeyButton: {
    backgroundColor: '#F1F5F9',
    borderColor: '#94A3B8',
  },
  keyText: {
    fontSize: 20,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  actionKeyText: {
    fontSize: 16,
    color: '#475569',
  },
  submitButton: {
    backgroundColor: SOL_COLORS.primary,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    elevation: 2,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
    marginTop: 4,
  },
  registerLink: {
    paddingVertical: 6,
  },
  registerLinkText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  registerLinkHighlight: {
    color: SOL_COLORS.primary,
    fontWeight: '900',
  },
});
