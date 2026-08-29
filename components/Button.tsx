import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';
import { triggerMediumImpact } from '@/lib/haptics';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'subtle';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'large',
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}) => {
  const handlePress = () => {
    if (disabled || loading) return;
    triggerMediumImpact();
    onPress();
  };

  const getContainerStyle = () => {
    const s: ViewStyle[] = [styles.base];

    // Size
    if (size === 'small') s.push(styles.smallContainer);
    else if (size === 'medium') s.push(styles.mediumContainer);
    else s.push(styles.largeContainer);

    // Variant
    if (variant === 'primary') s.push(styles.primaryContainer);
    else if (variant === 'secondary') s.push(styles.secondaryContainer);
    else if (variant === 'danger') s.push(styles.dangerContainer);
    else if (variant === 'outline') s.push(styles.outlineContainer);
    else if (variant === 'subtle') s.push(styles.subtleContainer);

    if (disabled || loading) s.push(styles.disabledContainer);

    return s;
  };

  const getTextStyle = () => {
    const s: TextStyle[] = [styles.baseText];

    if (size === 'small') s.push(styles.smallText);
    else if (size === 'medium') s.push(styles.mediumText);
    else s.push(styles.largeText);

    if (variant === 'outline') s.push(styles.outlineText);
    else if (variant === 'subtle') s.push(styles.subtleText);
    else s.push(styles.whiteText);

    return s;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={handlePress}
      style={[getContainerStyle(), style]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? SOL_COLORS.primary : '#FFFFFF'} />
      ) : (
        <>
          {icon}
          <Text style={[getTextStyle(), textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    gap: 8,
  },
  smallContainer: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  mediumContainer: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  largeContainer: {
    height: 54,
    paddingHorizontal: 22,
    borderRadius: 16,
    ...SHADOWS.sm,
  },
  primaryContainer: {
    backgroundColor: SOL_COLORS.primary,
  },
  secondaryContainer: {
    backgroundColor: SOL_COLORS.secondary,
  },
  dangerContainer: {
    backgroundColor: SOL_COLORS.danger,
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: SOL_COLORS.primary,
  },
  subtleContainer: {
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  disabledContainer: {
    backgroundColor: '#CBD5E1',
    borderColor: '#CBD5E1',
    elevation: 0,
    shadowOpacity: 0,
  },
  baseText: {
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  smallText: {
    fontSize: 13,
  },
  mediumText: {
    fontSize: 15,
  },
  largeText: {
    fontSize: 16,
  },
  whiteText: {
    color: '#FFFFFF',
  },
  outlineText: {
    color: SOL_COLORS.primary,
  },
  subtleText: {
    color: SOL_COLORS.textPrimary,
  },
});
