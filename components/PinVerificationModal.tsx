import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/Icon';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';
import { triggerLightImpact, triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';

const MAX_ATTEMPTS = 3;

interface PinVerificationModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onSuccess: () => void;
  onCancel: () => void;
  /** Appelé si l'utilisateur dépasse le nombre max de tentatives incorrectes */
  onLockout?: () => void;
}

export const PinVerificationModal: React.FC<PinVerificationModalProps> = ({
  visible,
  title = 'Confirmation de Sécurité',
  subtitle = 'Veuillez saisir votre code PIN à 4 chiffres pour valider cette opération.',
  onSuccess,
  onCancel,
  onLockout,
}) => {
  const { verifyPin } = useAuth();
  const { isSmallScreen, isTablet, height } = useResponsive();
  const isShortScreen = height < 680;
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failureCount, setFailureCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Shake animation for wrong PIN
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // Reset all state when modal becomes visible
  useEffect(() => {
    if (visible) {
      setPin('');
      setErrorMessage(null);
      setFailureCount(0);
      setIsLocked(false);
      setIsVerifying(false);
      shakeAnim.setValue(0);
    }
  }, [visible]);

  const handleDigit = async (digit: string) => {
    if (isLocked || isVerifying) return;
    triggerLightImpact();
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage(null);

      if (nextPin.length === 4) {
        setIsVerifying(true);
        // Allow the 4th filled dot and spinner to render on screen before starting verification
        setTimeout(async () => {
          const isValid = await verifyPin(nextPin);
          setIsVerifying(false);
          if (isValid) {
            triggerSuccessFeedback();
            onSuccess();
          } else {
            triggerErrorFeedback();
            triggerShake();
            setPin('');

            const nextFailures = failureCount + 1;
            setFailureCount(nextFailures);

            if (nextFailures >= MAX_ATTEMPTS) {
              setIsLocked(true);
              setErrorMessage(
                `Accès verrouillé — ${MAX_ATTEMPTS} tentatives incorrectes. Opération annulée par sécurité.`
              );
              // Fermeture automatique après 2 secondes
              setTimeout(() => {
                onLockout?.();
                onCancel();
              }, 2000);
            } else {
              const remaining = MAX_ATTEMPTS - nextFailures;
              setErrorMessage(
                `Code PIN incorrect — ${remaining} tentative${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`
              );
            }
          }
        }, 30);
      }
    }
  };

  const handleBackspace = () => {
    if (isLocked || isVerifying) return;
    triggerLightImpact();
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setErrorMessage(null);
    }
  };

  const handleClear = () => {
    if (isLocked || isVerifying) return;
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
      onRequestClose={isLocked ? undefined : onCancel}
    >
      <View style={[styles.overlay, isTablet && styles.overlayTablet]}>
        <View style={[styles.card, isTablet && styles.cardTablet, (isSmallScreen || isShortScreen) && styles.cardCompact]}>
          {/* Header */}
          <View style={[styles.header, (isSmallScreen || isShortScreen) && { marginBottom: 10 }]}>
            <View style={[styles.iconCircle, (isSmallScreen || isShortScreen) && { width: 44, height: 44, borderRadius: 22 }, isLocked && styles.iconCircleLocked]}>
              <Icon name={isLocked ? 'alert' : 'shield'} size={(isSmallScreen || isShortScreen) ? 18 : 22} color="#FFFFFF" />
            </View>
            <TouchableOpacity
              onPress={isLocked ? undefined : onCancel}
              style={[styles.closeBtn, (isSmallScreen || isShortScreen) && { width: 38, height: 38, borderRadius: 19 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Fermer"
              disabled={isLocked}
            >
              <Icon name="close" size={16} color={isLocked ? SOL_COLORS.border : SOL_COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, (isSmallScreen || isShortScreen) && { fontSize: 16 }]}>{isLocked ? 'Accès Verrouillé' : title}</Text>
          <Text style={[styles.subtitle, (isSmallScreen || isShortScreen) && { marginBottom: 14, fontSize: 12 }]}>
            {isLocked
              ? 'Trop de tentatives incorrectes. Cette opération a été annulée par sécurité.'
              : subtitle}
          </Text>

          {/* Indicateur visuel des tentatives (s'affiche dès la 1ère erreur) */}
          {failureCount > 0 && (
            <View style={[styles.attemptsRow, (isSmallScreen || isShortScreen) && { marginBottom: 8 }]}>
              {[1, 2, 3].map((n) => (
                <View
                  key={n}
                  style={[
                    styles.attemptDot,
                    n <= failureCount ? styles.attemptDotFailed : styles.attemptDotEmpty,
                  ]}
                />
              ))}
            </View>
          )}

          {/* 4 Dots PIN Display with Shake Animation — masqué si verrouillé */}
          {!isLocked && (
            <Animated.View
              style={[styles.dotsRow, (isSmallScreen || isShortScreen) && { marginBottom: 12, gap: 12 }, { transform: [{ translateX: shakeAnim }] }]}
            >
              {[0, 1, 2, 3].map((index) => {
                const isFilled = index < pin.length;
                return (
                  <View
                    key={index}
                    style={[
                      styles.dot,
                      (isSmallScreen || isShortScreen) && { width: 16, height: 16, borderRadius: 8 },
                      isFilled && styles.dotFilled,
                      errorMessage ? styles.dotError : null,
                    ]}
                  />
                );
              })}
            </Animated.View>
          )}

          {isVerifying && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <ActivityIndicator size="small" color={SOL_COLORS.primary} style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: SOL_COLORS.primary }}>Vérification...</Text>
            </View>
          )}

          {errorMessage && (
            <View style={[styles.errorContainer, (isSmallScreen || isShortScreen) && { marginBottom: 10, paddingVertical: 8 }, isLocked && styles.errorContainerLocked]}>
              <Icon name="alert" size={14} color={isLocked ? '#991B1B' : SOL_COLORS.danger} style={{ marginRight: 6 }} />
              <Text style={[styles.errorText, isLocked && styles.errorTextLocked]}>{errorMessage}</Text>
            </View>
          )}

          {/* Keypad — opacité réduite si verrouillé */}
          <View style={[styles.keypad, (isSmallScreen || isShortScreen) && { gap: 8 }, (isLocked || isVerifying) && styles.keypadLocked]}>
            {numpadKeys.map((row, rIdx) => (
              <View key={rIdx} style={[styles.keypadRow, (isSmallScreen || isShortScreen) && { gap: 8 }]}>
                {row.map((key) => {
                  const isAction = key === 'C' || key === 'DEL';
                  return (
                    <TouchableOpacity
                      key={key}
                      activeOpacity={(isLocked || isVerifying) ? 1 : 0.65}
                      onPress={() => {
                        if (key === 'C') handleClear();
                        else if (key === 'DEL') handleBackspace();
                        else handleDigit(key);
                      }}
                      style={[
                        styles.keyBtn,
                        (isSmallScreen || isShortScreen) && { height: 50, borderRadius: 14 },
                        isAction && styles.keyBtnAction,
                      ]}
                      accessibilityLabel={key === 'DEL' ? 'Supprimer' : key === 'C' ? 'Effacer' : key}
                      disabled={isLocked || isVerifying}
                    >
                      {key === 'DEL' ? (
                        <Icon name="arrow-left" size={(isSmallScreen || isShortScreen) ? 18 : 20} color={SOL_COLORS.textSecondary} />
                      ) : key === 'C' ? (
                        <Text style={[styles.keyText, styles.keyTextAction, (isSmallScreen || isShortScreen) && { fontSize: 15 }]}>C</Text>
                      ) : (
                        <Text style={[styles.keyText, (isSmallScreen || isShortScreen) && { fontSize: 20 }]}>{key}</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  overlayTablet: {
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  cardTablet: {
    maxWidth: 440,
    borderRadius: 28,
  },
  cardCompact: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    marginBottom: 26,
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 18,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: SOL_COLORS.dangerLight,
  },
  errorText: {
    color: SOL_COLORS.dangerDark,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  errorContainerLocked: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    marginTop: 8,
  },
  errorTextLocked: {
    color: '#991B1B',
  },
  iconCircleLocked: {
    backgroundColor: SOL_COLORS.danger,
  },
  attemptsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  attemptDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  attemptDotFailed: {
    backgroundColor: SOL_COLORS.danger,
  },
  attemptDotEmpty: {
    backgroundColor: SOL_COLORS.border,
    borderWidth: 1.5,
    borderColor: SOL_COLORS.borderStrong,
  },
  keypadLocked: {
    opacity: 0.3,
  },
  keypad: {
    width: '100%',
    gap: 12,
    marginTop: 6,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  keyBtn: {
    flex: 1,
    height: 62,
    borderRadius: 18,
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
    fontSize: 24,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  keyTextAction: {
    fontSize: 17,
    color: SOL_COLORS.textSecondary,
    fontWeight: '700',
  },
});

