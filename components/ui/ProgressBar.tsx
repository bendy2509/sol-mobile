import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

export interface ProgressBarProps {
  /** 0 → 1 (clamped). */
  value: number;
  tone?: 'primary' | 'success' | 'onHero';
  size?: 'sm' | 'md';
  accessibilityLabel?: string;
}

/** Thin progress track (cotisations, tours du cycle). */
export function ProgressBar({ value, tone = 'primary', size = 'md', accessibilityLabel }: ProgressBarProps) {
  const { colors, radius, spacing } = useTheme();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const height = size === 'sm' ? spacing.xs : spacing.sm;
  const fill = { primary: colors.primary, success: colors.success, onHero: colors.heroTrackActive }[tone];
  const track = tone === 'onHero' ? colors.heroTrack : colors.surfaceAlt;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height, borderRadius: radius.pill, backgroundColor: track, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: radius.pill, backgroundColor: fill }} />
    </View>
  );
}
