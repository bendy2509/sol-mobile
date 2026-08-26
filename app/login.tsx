import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { Icon } from '@/components/Icon';
import { triggerLightImpact, triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithPin } = useAuth();

  const [phone, setPhone] = useState('+509');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const executeLogin = async (currentPin: string) => {
    if (!phone.trim() || phone.trim().length < 4) {
      triggerErrorFeedback();
      setErrorMessage('Veuillez saisir votre numéro de téléphone.');
      return;
    }

    if (currentPin.length !== 4) {
      triggerErrorFeedback();
      setErrorMessage('Veuillez saisir les 4 chiffres de votre code PIN.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await loginWithPin(phone, currentPin);
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
    }
  };

  const handleDigit = (digit: string) => {
    triggerLightImpact();
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setErrorMessage(null);

      if (newPin.length === 4) {
        executeLogin(newPin);
      }
    }
  };

  const handleBackspace = () => {
    triggerLightImpact();
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setErrorMessage(null);
    }
  };

  const handleClear = () => {
    triggerLightImpact();
    setPin('');
    setErrorMessage(null);
  };

  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', '⌫'],
  ];

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
          {/* Brand Header */}
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Icon name="shield" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.appName}>SOL</Text>
            <Text style={styles.appTagline}>Plateforme d'Épargne & Collecte Mobile</Text>
          </View>

          {/* Unified Phone Input Card */}
          <View style={styles.loginCard}>
            <Text style={styles.fieldLabel}>NUMÉRO DE TÉLÉPHONE</Text>
            <View style={styles.phoneInputContainer}>
              <Icon name="phone" size={18} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={(text) => {
                  setPhone(text);
                  setErrorMessage(null);
                }}
                placeholder="+509 XX XX XXXX"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                autoCapitalize="none"
              />
            </View>

            {/* PIN Code Section */}
            <View style={styles.pinSection}>
              <Text style={styles.pinLabel}>CODE PIN DE SÉCURITÉ (4 CHIFFRES)</Text>

              <View style={styles.pinDotsRow}>
                {[0, 1, 2, 3].map((index) => {
                  const isFilled = index < pin.length;
                  return (
                    <View
                      key={index}
                      style={[
                        styles.pinDot,
                        isFilled && styles.pinDotFilled,
                        errorMessage ? styles.pinDotError : null,
                      ]}
                    />
                  );
                })}
              </View>

              {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
            </View>
          </View>

          {/* Tactile Keypad */}
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
                      style={[styles.keyButton, isAction && styles.actionKeyButton]}
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

          {/* Registration Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/register' as any)}
              style={styles.registerLink}
            >
              <Text style={styles.registerLinkText}>
                Nouveau responsable ?{' '}
                <Text style={styles.registerLinkHighlight}>Créer un carnet SOL</Text>
              </Text>
            </TouchableOpacity>
          </View>
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
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  header: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  appName: {
    fontSize: 26,
    fontWeight: '900',
    color: SOL_COLORS.primary,
    letterSpacing: 1,
  },
  appTagline: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  loginCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 14,
  },
  phoneInput: {
    flex: 1,
    color: SOL_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  pinSection: {
    alignItems: 'center',
  },
  pinLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 6,
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
    transform: [{ scale: 1.2 }],
  },
  pinDotError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },
  keypadGrid: {
    width: '100%',
    marginVertical: 4,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  keyButton: {
    flex: 1,
    height: 52,
    marginHorizontal: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
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
    fontSize: 22,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  actionKeyText: {
    fontSize: 16,
    color: '#64748B',
  },
  footer: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  registerLink: {
    paddingVertical: 8,
  },
  registerLinkText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  registerLinkHighlight: {
    color: SOL_COLORS.primary,
    fontWeight: '800',
  },
});
