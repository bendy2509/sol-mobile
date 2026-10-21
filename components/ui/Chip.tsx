import React from 'react';
import { Pressable } from 'react-native';

import { triggerLightImpact } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** 'danger' fills the selected chip with the danger color (e.g. "En retard"). */
  tone?: 'primary' | 'danger';
}

/** Filter chip: pill, 40dp visual + hit slop to 48dp, filled when selected. */
export function Chip({ label, selected = false, onPress, tone = 'primary' }: ChipProps) {
  const { colors, spacing, radius, layout } = useTheme();
  const activeBg = tone === 'danger' ? colors.danger : colors.primary;

  return (
    <Pressable
      onPress={() => {
        triggerLightImpact();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: layout.touchTarget - spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        justifyContent: 'center',
        borderColor: selected ? activeBg : 'transparent',
        backgroundColor: selected ? activeBg : pressed ? colors.surfacePressed : colors.surfaceAlt,
      })}
    >
      <Text variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}
