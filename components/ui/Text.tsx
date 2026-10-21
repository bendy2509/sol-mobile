import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';

import { ThemeColors, TypographyVariant, useTheme } from '@/theme';

export type TextTone =
  | 'default'
  | 'muted'
  | 'inverse'
  | 'primary'
  | 'success'
  | 'advance'
  | 'warning'
  | 'danger'
  | 'locked'
  | 'onHero'
  | 'onHeroMuted';

export const toneColor = (colors: ThemeColors, tone: TextTone): string =>
  ({
    default: colors.text,
    muted: colors.textMuted,
    inverse: colors.textInverse,
    primary: colors.primary,
    success: colors.success,
    advance: colors.advance,
    warning: colors.warning,
    danger: colors.danger,
    locked: colors.locked,
    onHero: colors.onHero,
    onHeroMuted: colors.onHeroMuted,
  })[tone];

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  align?: 'left' | 'center' | 'right';
}

/** Themed text: every string in a migrated screen goes through this component. */
export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[theme.typography[variant], { color: toneColor(theme.colors, tone) }, align && { textAlign: align }, style]}
    />
  );
}
