import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
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
  const { activeCollector, loginWithPin } = useAuth();

  const [phone, setPhone] = useState(activeCollector?.phoneNumber || '+50937123456');
  const [pin, setPin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDigit = async (digit: string) => {
    triggerLightImpact();

    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      setErrorMessage(null);

      if (newPin.length === 6) {
        const success = await loginWithPin(newPin);
        if (success) {
          triggerSuccessFeedback();
          const business = await getActiveBusinessConfig();
          if (!business) {
            router.replace('/setup-business' as any);
          } else {
            router.replace('/(tabs)' as any);
          }
        } else {
          triggerErrorFeedback();
          setErrorMessage('Code PIN incorrect. Veuillez réessayer (PIN test : 123456).');
          setPin('');
        }
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
      {/* Brand Header */}
      <View style={styles.header}>
        <View style={styles.logoCircle}>
          <Icon name="shield" size={28} color="#FFFFFF" />
        </View>
        <Text style={styles.appName}>SOL</Text>
        <Text style={styles.appTagline}>Plateforme d'Épargne & Collecte Mobile</Text>
      </View>

      {/* Collector Profile Card */}
      <View style={styles.collectorCard}>
        <View style={styles.collectorHeader}>
          <Icon name="user" size={14} color="#64748B" />
          <Text style={styles.collectorLabel}>AGENT COLLECTEUR</Text>
        </View>
        <Text style={styles.collectorName}>
          {activeCollector ? activeCollector.fullName : 'Jean-Baptiste Pierre'}
        </Text>
        <Text style={styles.collectorZone}>
          {activeCollector?.zone || 'Marché Salomon (Port-au-Prince)'}
        </Text>
      </View>

      {/* Phone Number Input Confirmation */}
      <View style={styles.phoneInputContainer}>
        <Icon name="phone" size={16} color="#64748B" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.phoneInput}
          value={phone}
          onChangeText={setPhone}
          placeholder="+509 XX XX XXXX"
          placeholderTextColor="#94A3B8"
          keyboardType="phone-pad"
        />
      </View>

      {/* PIN Dots Display */}
      <View style={styles.pinSection}>
        <Text style={styles.pinPrompt}>Entrez votre code PIN de sécurité (6 chiffres)</Text>

        <View style={styles.pinDotsRow}>
          {[0, 1, 2, 3, 4, 5].map((index) => {
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  header: {
    alignItems: 'center',
    marginTop: 4,
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
    color: SOL_COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  collectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  collectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  collectorLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  collectorName: {
    fontSize: 16,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  collectorZone: {
    fontSize: 12,
    color: SOL_COLORS.primary,
    marginTop: 2,
    fontWeight: '700',
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  phoneInput: {
    flex: 1,
    color: SOL_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  pinSection: {
    alignItems: 'center',
    marginVertical: 4,
  },
  pinPrompt: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '700',
    marginBottom: 10,
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
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  keypadGrid: {
    width: '100%',
    marginBottom: 4,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  keyButton: {
    flex: 1,
    height: 58,
    marginHorizontal: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  actionKeyButton: {
    backgroundColor: '#F1F5F9',
    borderColor: '#94A3B8',
  },
  keyText: {
    fontSize: 24,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  actionKeyText: {
    fontSize: 18,
    color: '#64748B',
  },
});
