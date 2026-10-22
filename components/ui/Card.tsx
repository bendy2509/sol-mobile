import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type CardTone = 'default' | 'sunken' | 'hero' | 'success' | 'warning' | 'danger' | 'locked';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps {
  children: React.ReactNode;
  tone?: CardTone;
  padding?: CardPadding;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Surface container. `hero` holds the screen's single hero amount; status tones tint the card. */
export function Card({ children, tone = 'default', padding = 'md', onPress, accessibilityLabel, style }: CardProps) {
  const { colors, radius, spacing, shadows } = useTheme();

  const toneStyle: Record<CardTone, ViewStyle> = {
    default: { backgroundColor: colors.surface, borderColor: 'transparent', ...shadows.card },
    sunken: { backgroundColor: colors.surfaceAlt, borderColor: colors.surfaceAlt },
    hero: { backgroundColor: colors.hero, borderColor: 'transparent', ...shadows.card },
    success: { backgroundColor: colors.successSoft, borderColor: colors.successSoft },
    warning: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft },
    danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
    locked: { backgroundColor: colors.lockedSoft, borderColor: colors.lockedLine, borderStyle: 'dashed' },
  };
  const pad = { none: 0, sm: spacing.md, md: spacing.lg, lg: spacing.xl }[padding];

  const base: ViewStyle = {
    borderWidth: 1,
    borderRadius: tone === 'hero' ? radius.lg : radius.md,
    borderCurve: 'continuous',
    padding: pad,
    ...toneStyle[tone],
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, pressed && tone === 'default' && { backgroundColor: colors.surfacePressed }, style]}
    >
      {children}
    </Pressable>
  );
}
