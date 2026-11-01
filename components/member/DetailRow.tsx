import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

/** Label on the left, value on the right, thin rule under: the member sheet's detail line. */
export function DetailRow({ label, value, selectable }: { label: string; value: string; selectable?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingVertical: spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
      }}
    >
      <Text variant="caption" tone="muted" style={{ flex: 1.3 }}>
        {label}
      </Text>
      <Text variant="label" selectable={selectable} style={{ flex: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}
