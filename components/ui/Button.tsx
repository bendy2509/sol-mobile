import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, View, ViewStyle } from 'react-native';

import { triggerLightImpact } from '@/lib/haptics';
import { Theme, useTheme } from '@/theme';
import { Icon, UiIconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** md = 48dp (default), lg = 56dp main action in the thumb zone. */
  size?: ButtonSize;
  icon?: UiIconName;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  /**
   * Locked state (e.g. closed-cycle transaction, admin-only action):
   * dashed outline + lock icon, not pressable, `lockedLabel` replaces the label.
   */
  locked?: boolean;
  lockedLabel?: string;
  fullWidth?: boolean;
  haptic?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

function variantColors(theme: Theme, variant: ButtonVariant, pressed: boolean) {
  const c = theme.colors;
  switch (variant) {
    case 'primary':
      return { bg: pressed ? c.primaryPressed : c.primary, fg: c.onPrimary, border: 'transparent' };
    case 'secondary':
      return { bg: pressed ? c.surfacePressed : c.surface, fg: c.text, border: c.borderStrong };
    case 'danger':
      return { bg: pressed ? c.dangerLine : c.dangerSoft, fg: c.danger, border: c.dangerLine };
    case 'ghost':
      return { bg: pressed ? c.surfacePressed : 'transparent', fg: c.link, border: 'transparent' };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  locked = false,
  lockedLabel,
  fullWidth = false,
  haptic = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const { colors, radius, spacing, layout } = theme;
  const inactive = disabled || locked || loading;
  const height = size === 'lg' ? layout.actionHeight : layout.touchTarget;
  const text = locked && lockedLabel ? lockedLabel : label;

  return (
    <Pressable
      onPress={() => {
        if (inactive) return;
        if (haptic) triggerLightImpact();
        onPress?.();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? text}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={4}
      style={({ pressed }) => {
        const v = variantColors(theme, variant, pressed && !inactive);
        const base: ViewStyle = {
          minHeight: height,
          paddingHorizontal: size === 'lg' ? spacing.xl : spacing.md,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          borderWidth: 1,
          flexDirection: iconPosition === 'right' ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          alignSelf: fullWidth ? 'stretch' : 'auto',
          backgroundColor: v.bg,
          borderColor: v.border,
        };
        if (locked) {
          return [base, { backgroundColor: colors.lockedSoft, borderColor: colors.lockedLine, borderStyle: 'dashed' }, style];
        }
        if (disabled) {
          return [base, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }, style];
        }
        return [base, style];
      }}
    >
      {({ pressed }) => {
        const v = variantColors(theme, variant, pressed);
        const fg = locked || disabled ? colors.textMuted : v.fg;
        return (
          <>
            {loading ? (
              <ActivityIndicator color={fg} />
            ) : locked ? (
              <Icon name="lock" size={18} color={fg} />
            ) : icon ? (
              <Icon name={icon} size={size === 'lg' ? 22 : 18} color={fg} />
            ) : null}
            <View style={{ flexShrink: 1 }}>
              <Text variant={size === 'lg' ? 'buttonLarge' : 'button'} style={{ color: fg }} numberOfLines={2} align="center">
                {text}
              </Text>
            </View>
          </>
        );
      }}
    </Pressable>
  );
}
