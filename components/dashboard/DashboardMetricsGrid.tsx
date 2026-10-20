import React from 'react';
import { View } from 'react-native';
import { DashboardMetrics } from '@/types';
import { MetricTile } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useTheme } from '@/theme';

interface DashboardMetricsGridProps {
  metrics: DashboardMetrics;
  membersCount: number;
}

/** Today's three key figures. Only "En retard" is tinted, and only when someone is late. */
export const DashboardMetricsGrid: React.FC<DashboardMetricsGridProps> = ({ metrics, membersCount }) => {
  const { spacing } = useTheme();
  const isLate = metrics.overdueMembersCount > 0;

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <MetricTile
        label="Encaissé"
        icon="cash"
        value={formatCurrency(metrics.handsCollectedToday * metrics.unitAmount)}
        hint={`${metrics.handsCollectedToday} main${metrics.handsCollectedToday > 1 ? 's' : ''}`}
      />
      <MetricTile label="À jour" tone="success" value={`${metrics.paidTodayCount} / ${membersCount}`} hint="aujourd'hui" />
      <MetricTile
        label="En retard"
        icon="alert"
        tone={isLate ? 'danger' : 'default'}
        value={String(metrics.overdueMembersCount)}
        hint={isLate ? `${metrics.overdueHandsCount} main(s)` : 'Aucun'}
      />
    </View>
  );
};
