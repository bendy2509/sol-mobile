import React from 'react';
import { DashboardMetrics } from '@/types';
import { StatStrip } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { t } from '@/i18n';

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
          label: t('Encaissé'),
          value: formatCurrency(metrics.amountCollectedToday),
          hint: t('{0} main{1}', metrics.handsCollectedToday, metrics.handsCollectedToday > 1 ? 's' : ''),
        },
        { label: t('À jour'), value: `${metrics.paidTodayCount} / ${membersCount}`, hint: t('aujourd\'hui') },
        {
          label: t('En retard'),
          value: String(metrics.overdueMembersCount),
          hint: isLate ? t('{0} main(s)', metrics.overdueHandsCount) : t('Aucun'),
          tone: isLate ? 'danger' : 'default',
        },
      ]}
    />
  );
};
