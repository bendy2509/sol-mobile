import React from 'react';
import { View } from 'react-native';
import { DashboardMetrics } from '@/types';
import { Text, TextTone } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useTheme } from '@/theme';

interface DashboardMetricsGridProps {
  metrics: DashboardMetrics;
  membersCount: number;
}

/**
 * Today's three figures on one ruled strip, like the totals line of a ledger.
 * Only the late count takes a color, and only when someone is late.
 */
export const DashboardMetricsGrid: React.FC<DashboardMetricsGridProps> = ({ metrics, membersCount }) => {
  const { colors, spacing, radius, shadows } = useTheme();
  const isLate = metrics.overdueMembersCount > 0;

  const cells: { label: string; value: string; hint: string; tone: TextTone }[] = [
    {
      label: 'Encaissé',
      value: formatCurrency(metrics.handsCollectedToday * metrics.unitAmount),
      hint: `${metrics.handsCollectedToday} main${metrics.handsCollectedToday > 1 ? 's' : ''}`,
      tone: 'default',
    },
    { label: 'À jour', value: `${metrics.paidTodayCount} / ${membersCount}`, hint: "aujourd'hui", tone: 'default' },
    {
      label: 'En retard',
      value: String(metrics.overdueMembersCount),
      hint: isLate ? `${metrics.overdueHandsCount} main(s)` : 'Aucun',
      tone: isLate ? 'danger' : 'default',
    },
  ];

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
      {cells.map((cell, i) => (
        <View
          key={cell.label}
          accessible
          accessibilityLabel={`${cell.label} : ${cell.value}, ${cell.hint}`}
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
          <Text variant="caption" tone={cell.tone === 'danger' ? 'danger' : 'muted'} numberOfLines={1}>
            {cell.label}
          </Text>
          <Text variant="amount" tone={cell.tone} numberOfLines={1} adjustsFontSizeToFit>
            {cell.value}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {cell.hint}
          </Text>
        </View>
      ))}
    </View>
  );
};
