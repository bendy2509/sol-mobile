import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/Icon';
import { SOL_COLORS } from '@/constants/Colors';
import { triggerLightImpact, triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';

interface PinVerificationModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PinVerificationModal: React.FC<PinVerificationModalProps> = ({
  visible,
  title = 'Confirmation de Sécurité',
  subtitle = 'Veuillez saisir votre code PIN à 4 chiffres pour valider cette opération.',
  onSuccess,
  onCancel,
}) => {
  const { verifyPin } = useAuth();
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPin('');
      setErrorMessage(null);
    }
  }, [visible]);

  const handleDigit = async (digit: string) => {
    triggerLightImpact();
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage(null);

      if (nextPin.length === 4) {
        const isValid = await verifyPin(nextPin);
        if (isValid) {
          triggerSuccessFeedback();
          onSuccess();
        } else {
          triggerErrorFeedback();
          setErrorMessage('Code PIN incorrect.');
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Icon name="shield" size={24} color="#FFFFFF" />
            </View>
            <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
              <Icon name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* 4 Dots Display */}
          <View style={styles.dotsRow}>
            {[0, 1, 2, 3].map((index) => {
              const isFilled = index < pin.length;
              return (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    isFilled && styles.dotFilled,
                    errorMessage ? styles.dotError : null,
                  ]}
                />
              );
            })}
          </View>

          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

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

          {/* Cancel Button */}
          <TouchableOpacity activeOpacity={0.7} onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    padding: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 10,
    fontWeight: '600',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 12,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
  },
  dotFilled: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primary,
    transform: [{ scale: 1.25 }],
  },
  dotError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  keypadGrid: {
    width: '100%',
    marginTop: 6,
    marginBottom: 6,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
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
    fontSize: 22,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  actionKeyText: {
    fontSize: 16,
    color: '#64748B',
  },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
});
