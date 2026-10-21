import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Modal, Pressable, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Card, Icon, PinDots, PinPad, Text } from '@/components/ui';
import { triggerLightImpact, triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

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
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { verifyPin, getPinLockMessage } = useAuth();
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
      // Progressive lockout is global (login + every sensitive action): show it right away
      getPinLockMessage().then((lock) => {
        if (lock) {
          setIsLocked(true);
          setErrorMessage(lock);
        }
      });
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

            const lock = await getPinLockMessage();
            if (lock) {
              setIsLocked(true);
              setErrorMessage(lock);
              return;
            }

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

  const insets = useSafeAreaInsets();
  const compact = isSmallScreen || isShortScreen;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.overlay, isTablet && styles.overlayTablet]}>
        <View style={[styles.sheet, isTablet && styles.sheetTablet, !isTablet && { paddingBottom: insets.bottom + theme.spacing.lg }]}>
          <View style={styles.headerRow}>
            <View style={[styles.iconCircle, isLocked && styles.iconCircleLocked]}>
              <Icon name={isLocked ? 'alert' : 'lock'} size={24} color={isLocked ? theme.colors.danger : theme.colors.primary} />
            </View>
            <View style={styles.flexShrink}>
              <Text variant="heading" accessibilityRole="header">
                {isLocked ? 'Accès verrouillé' : title}
              </Text>
              <Text variant={compact ? 'caption' : 'body'} tone="muted">
                {isLocked ? 'Saisie du code PIN suspendue pour votre sécurité.' : subtitle}
              </Text>
            </View>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            >
              <Icon name="close" size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {failureCount > 0 && (
            <View style={styles.attemptsRow} accessible accessibilityLabel={`${failureCount} tentative(s) incorrecte(s) sur ${MAX_ATTEMPTS}`}>
              {[1, 2, 3].map((n) => (
                <View key={n} style={[styles.attemptDot, n <= failureCount && styles.attemptDotFailed]} />
              ))}
            </View>
          )}

          {!isLocked && (
            <Animated.View style={[styles.dotsBox, { transform: [{ translateX: shakeAnim }] }]}>
              <PinDots filled={pin.length} active={!isVerifying} error={!!errorMessage} size={compact ? 'md' : 'lg'} />
            </Animated.View>
          )}

          {isVerifying && (
            <View style={styles.verifyingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text variant="label" tone="primary">
                Vérification…
              </Text>
            </View>
          )}

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

          <PinPad onDigit={handleDigit} onBackspace={handleBackspace} onClear={handleClear} disabled={isLocked || isVerifying} compact={compact} />
        </View>
      </View>
    </Modal>
  );
};

const createStyles = ({ colors, spacing, radius, layout }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    pressed: { backgroundColor: colors.surfacePressed },

    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
    overlayTablet: { justifyContent: 'center', alignItems: 'center', padding: layout.gutter },
    sheet: {
      width: '100%',
      gap: spacing.lg,
      paddingTop: spacing.xl,
      paddingHorizontal: layout.gutter,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
    },
    sheetTablet: { maxWidth: 440, borderRadius: radius.lg, padding: spacing.xl },

    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    iconCircle: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    iconCircleLocked: { backgroundColor: colors.dangerSoft },
    closeBtn: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      marginTop: -spacing.sm,
      marginRight: -spacing.sm,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },

    attemptsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
    attemptDot: { width: spacing.md, height: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
    attemptDotFailed: { backgroundColor: colors.danger },
    dotsBox: { paddingVertical: spacing.sm },
    verifyingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  });
