import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  /** Shown as "Adhérents (4)". */
  count?: number;
  action?: { label: string; onPress: () => void };
}

/** Section title in sentence case (no tracked-out uppercase eyebrows). */
export function SectionHeader({ title, count, action }: SectionHeaderProps) {
  const { spacing, layout } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingTop: spacing.lg,
        paddingBottom: spacing.sm,
      }}
    >
      <Text variant="subheading" accessibilityRole="header" style={{ flexShrink: 1 }}>
        {count !== undefined ? `${title} (${count})` : title}
      </Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          hitSlop={8}
          style={{ minHeight: layout.touchTarget, justifyContent: 'center' }}
        >
          <Text variant="label" tone="primary">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
