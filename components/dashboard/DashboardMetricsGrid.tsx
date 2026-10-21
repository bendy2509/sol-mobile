import React from 'react';
import { DashboardMetrics } from '@/types';
import { StatStrip } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';

interface DashboardMetricsGridProps {
  metrics: DashboardMetrics;
  membersCount: number;
}

/** Today's three figures. Only the late count takes a color, and only when someone is late. */
export const DashboardMetricsGrid: React.FC<DashboardMetricsGridProps> = ({ metrics, membersCount }) => {
  const isLate = metrics.overdueMembersCount > 0;

  return (
    <StatStrip
      cells={[
        {
          label: 'Encaissé',
          value: formatCurrency(metrics.handsCollectedToday * metrics.unitAmount),
          hint: `${metrics.handsCollectedToday} main${metrics.handsCollectedToday > 1 ? 's' : ''}`,
        },
        { label: 'À jour', value: `${metrics.paidTodayCount} / ${membersCount}`, hint: "aujourd'hui" },
        {
          label: 'En retard',
          value: String(metrics.overdueMembersCount),
          hint: isLate ? `${metrics.overdueHandsCount} main(s)` : 'Aucun',
          tone: isLate ? 'danger' : 'default',
        },
      ]}
    />
  );
};
