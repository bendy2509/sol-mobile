import React from 'react';
import { Pressable, View } from 'react-native';

import { triggerSelectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

/** Mutually exclusive choice of 2 to 4 short options (theme, text size, history filter). 44dp. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) {
  const { colors, spacing, radius, layout, shadows } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        padding: spacing.xs,
        gap: spacing.xs,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        backgroundColor: colors.surfaceAlt,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (selected) return;
              triggerSelectionHaptic();
              onChange(option.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={({ pressed }) => [
              {
                flex: 1,
                minHeight: layout.touchTarget - spacing.sm,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.sm,
                borderCurve: 'continuous',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? colors.surface : pressed ? colors.surfacePressed : 'transparent',
              },
              selected && shadows.card,
            ]}
          >
            <Text variant="label" tone={selected ? 'default' : 'muted'} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
