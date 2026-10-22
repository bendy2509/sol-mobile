import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { Icon, UiIconName } from './Icon';
import { Text, TextTone } from './Text';

export type MetricTone = 'default' | 'success' | 'warning' | 'danger';

export interface MetricTileProps {
  label: string;
  /** Pre-formatted value ("750 HTG", "3 / 4"). Use AmountText via `children` for amounts with signs. */
  value?: string;
  children?: React.ReactNode;
  hint?: string;
  icon?: UiIconName;
  tone?: MetricTone;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Compact key figure. Tone tints the tile only for states that need attention. */
export function MetricTile({ label, value, children, hint, icon, tone = 'default', onPress, style }: MetricTileProps) {
  const { colors, spacing, radius, shadows } = useTheme();
  const palette: Record<MetricTone, { bg: string; line: string; fg: TextTone }> = {
    default: { bg: colors.surface, line: 'transparent', fg: 'default' },
    success: { bg: colors.surface, line: 'transparent', fg: 'success' },
    warning: { bg: colors.warningSoft, line: 'transparent', fg: 'warning' },
    danger: { bg: colors.dangerSoft, line: 'transparent', fg: 'danger' },
  };
  const p = palette[tone];

  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        {icon ? <Icon name={icon} size={16} color={tone === 'default' ? colors.textMuted : colors[tone]} /> : null}
        <Text variant="caption" tone={tone === 'default' || tone === 'success' ? 'muted' : p.fg} numberOfLines={2} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
      {children ?? (
        <Text variant="amount" tone={p.fg} numberOfLines={1} adjustsFontSizeToFit selectable>
          {value}
        </Text>
      )}
      {hint ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </>
  );

  const box: ViewStyle = {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    backgroundColor: p.bg,
    borderColor: p.line,
    ...(tone === 'default' || tone === 'success' ? shadows.card : null),
  };

  if (!onPress) return <View style={[box, style]}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [box, pressed && { opacity: 0.85 }, style]}>
      {body}
    </Pressable>
  );
}
