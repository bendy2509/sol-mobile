import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

export interface PinDotsProps {
  /** Number of digits entered. */
  filled: number;
  length?: number;
  /** Highlights the next dot to fill. */
  active?: boolean;
  error?: boolean;
  size?: 'md' | 'lg';
}

/** PIN entry indicator: filled / next / empty dots; error tints them danger. */
export function PinDots({ filled, length = 4, active = false, error = false, size = 'lg' }: PinDotsProps) {
  const { colors, spacing, radius } = useTheme();
  const dim = size === 'lg' ? spacing.lg + spacing.xs : spacing.md + spacing.xs;

  return (
    <View
      accessible
      accessibilityLabel={`${filled} chiffre(s) saisi(s) sur ${length}`}
      style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.lg }}
    >
      {Array.from({ length }).map((_, i) => {
        const isFilled = i < filled;
        const isNext = active && i === filled;
        const tint = error ? colors.danger : colors.primary;
        return (
          <View
            key={i}
            style={{
              width: dim,
              height: dim,
              borderRadius: radius.pill,
              borderWidth: 2,
              borderColor: isFilled || isNext ? tint : colors.borderStrong,
              backgroundColor: isFilled ? tint : 'transparent',
            }}
          />
        );
      })}
    </View>
  );
}
