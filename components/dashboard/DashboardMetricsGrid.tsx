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
          label: t("Encaissé aujourd'hui"),
          value: formatCurrency(metrics.amountCollectedToday),
          hint: t('{0} sur le cycle', formatCurrency(metrics.amountCollectedCycle)),
        },
        { label: t('À jour'), value: `${metrics.paidTodayCount} / ${membersCount}`, hint: t("aujourd'hui") },
        {
          label: t('En retard'),
          value: String(metrics.overdueMembersCount),
          // Owed: late hands plus today's missing ones, in HTG (the same count as the collect list)
          hint: metrics.overdueAmount > 0 ? t('{0} dû', formatCurrency(metrics.overdueAmount)) : t('Aucun'),
          tone: isLate ? 'warning' : 'default',
        },
      ]}
    />
  );
};
