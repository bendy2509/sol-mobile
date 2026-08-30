import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/Icon';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';
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
          setErrorMessage('Code PIN incorrect. Veuillez réessayer.');
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

  // Keypad layout — 'DEL' replaces emoji ⌫
  const numpadKeys: string[][] = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', 'DEL'],
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Icon name="shield" size={22} color="#FFFFFF" />
            </View>
            <TouchableOpacity
              onPress={onCancel}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Fermer"
            >
              <Icon name="close" size={16} color={SOL_COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* 4 Dots PIN Display */}
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

          {errorMessage && (
            <View style={styles.errorContainer}>
              <Icon name="alert" size={14} color={SOL_COLORS.danger} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Keypad */}
          <View style={styles.keypad}>
            {numpadKeys.map((row, rIdx) => (
              <View key={rIdx} style={styles.keypadRow}>
                {row.map((key) => {
                  const isAction = key === 'C' || key === 'DEL';
                  return (
                    <TouchableOpacity
                      key={key}
                      activeOpacity={0.65}
                      onPress={() => {
                        if (key === 'C') handleClear();
                        else if (key === 'DEL') handleBackspace();
                        else handleDigit(key);
                      }}
                      style={[styles.keyBtn, isAction && styles.keyBtnAction]}
                      accessibilityLabel={key === 'DEL' ? 'Supprimer' : key === 'C' ? 'Effacer' : key}
                    >
                      {key === 'DEL' ? (
                        <Icon name="arrow-left" size={18} color={SOL_COLORS.textSecondary} />
                      ) : key === 'C' ? (
                        <Text style={[styles.keyText, styles.keyTextAction]}>C</Text>
                      ) : (
                        <Text style={styles.keyText}>{key}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.80)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: SOL_COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: SOL_COLORS.borderStrong,
    backgroundColor: '#FFFFFF',
  },
  dotFilled: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primaryDark,
  },
  dotError: {
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
    marginBottom: 16,
    borderWidth: 1,
    borderColor: SOL_COLORS.dangerLight,
  },
  errorText: {
    color: SOL_COLORS.dangerDark,
    fontSize: 12,
    fontWeight: '700',
  },
  keypad: {
    width: '100%',
    gap: 12,
    marginTop: 4,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  keyBtn: {
    flex: 1,
    height: 58,
    borderRadius: 16,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBtnAction: {
    backgroundColor: '#FFFFFF',
    borderColor: SOL_COLORS.borderStrong,
  },
  keyText: {
    fontSize: 22,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  keyTextAction: {
    fontSize: 17,
    color: SOL_COLORS.textSecondary,
    fontWeight: '700',
  },
});
