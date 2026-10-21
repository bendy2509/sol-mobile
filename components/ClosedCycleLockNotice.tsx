import React from 'react';
import { View } from 'react-native';
import { Card, Icon, Text } from '@/components/ui';
import { CLOSED_CYCLE_REVERSAL_NOTICE } from '@/services/financialService';
import { useTheme } from '@/theme';

/**
 * Shown in a transaction's detail when it belongs to a closed cycle: the manager can still
 * reverse it (PIN + mandatory reason), but the reversal is archival only.
 */
export const ClosedCycleNotice: React.FC = () => {
  const { colors, spacing } = useTheme();
  return (
    <Card tone="sunken" padding="sm">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <Icon name="lock" size={18} color={colors.textMuted} />
        <Text variant="caption" tone="muted" style={{ flex: 1, minWidth: 0 }}>
          {CLOSED_CYCLE_REVERSAL_NOTICE}
        </Text>
      </View>
    </Card>
  );
};
