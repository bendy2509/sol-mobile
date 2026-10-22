import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Text, TextTone } from './Text';

export interface StatCell {
  label: string;
  /** Pre-formatted value; pass `children` instead for an <AmountText>. */
  value?: string;
  children?: React.ReactNode;
  hint?: string;
  /** Only a figure that needs attention takes a color (late, remaining). */
  tone?: TextTone;
}

export interface StatStripProps {
  cells: StatCell[];
}

/**
 * Key figures on one ruled strip, like the totals line of a ledger:
 * one surface, cells divided by hairlines, no icons, no tinted boxes.
 */
export function StatStrip({ cells }: StatStripProps) {
  const { colors, spacing, radius, shadows } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        backgroundColor: colors.surface,
        ...shadows.card,
      }}
    >
      {cells.map((cell, i) => {
        const tone = cell.tone ?? 'default';
        return (
          <View
            key={cell.label}
            accessible
            accessibilityLabel={`${cell.label} : ${cell.value ?? ''}${cell.hint ? `, ${cell.hint}` : ''}`}
            style={{
              flex: 1,
              minWidth: 0,
              gap: spacing.xs,
              paddingVertical: spacing.lg,
              paddingHorizontal: spacing.md,
              borderLeftWidth: i === 0 ? 0 : 1,
              borderLeftColor: colors.divider,
            }}
          >
            <Text variant="caption" tone={tone === 'default' || tone === 'success' ? 'muted' : tone} numberOfLines={1}>
              {cell.label}
            </Text>
            {cell.children ?? (
              <Text variant="amount" tone={tone} numberOfLines={1} adjustsFontSizeToFit>
                {cell.value}
              </Text>
            )}
            {cell.hint ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {cell.hint}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
