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
import { SOL_COLORS } from '@/constants/Colors';
import { triggerMediumImpact } from '@/lib/haptics';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
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

    if (disabled || loading) s.push(styles.disabledContainer);

    return s;
  };

  const getTextStyle = () => {
    const s: TextStyle[] = [styles.baseText];

    if (size === 'small') s.push(styles.smallText);
    else if (size === 'medium') s.push(styles.mediumText);
    else s.push(styles.largeText);

    if (variant === 'outline') s.push(styles.outlineText);
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
    borderRadius: 14,
    gap: 8,
  },
  smallContainer: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  mediumContainer: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  largeContainer: {
    height: 56,
    paddingHorizontal: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  primaryContainer: {
    backgroundColor: SOL_COLORS.primary,
    borderWidth: 1.5,
    borderColor: SOL_COLORS.primaryDark,
  },
  secondaryContainer: {
    backgroundColor: SOL_COLORS.secondary,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  dangerContainer: {
    backgroundColor: SOL_COLORS.danger,
    borderWidth: 1.5,
    borderColor: '#B91C1C',
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: SOL_COLORS.primary,
  },
  disabledContainer: {
    backgroundColor: '#94A3B8',
    borderColor: '#94A3B8',
    elevation: 0,
    shadowOpacity: 0,
  },
  baseText: {
    fontWeight: '800',
  },
  smallText: {
    fontSize: 13,
  },
  mediumText: {
    fontSize: 15,
  },
  largeText: {
    fontSize: 17,
  },
  whiteText: {
    color: '#FFFFFF',
  },
  outlineText: {
    color: SOL_COLORS.primary,
  },
});
