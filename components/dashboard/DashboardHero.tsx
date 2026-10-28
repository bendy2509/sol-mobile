import React from 'react';
import { View } from 'react-native';
import { DashboardMetrics } from '@/types';
import { AmountText, Card, ProgressBar, Text } from '@/components/ui';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { useTheme } from '@/theme';
import { t } from '@/i18n';

interface DashboardHeroProps {
  metrics: DashboardMetrics;
  cycleProgressPct: number;
  /** Current beneficiary row, rendered inside the band under a hairline rule. */
  children?: React.ReactNode;
}

/** Segmented track (one segment per hand) is readable up to this many hands. */
const MAX_SEGMENTS = 12;

/** Cagnotte card: the pot is the single hero of the dashboard, its meaning follows it. */
export const DashboardHero: React.FC<DashboardHeroProps> = ({ metrics, cycleProgressPct, children }) => {
  const { colors, spacing, radius } = useTheme();
  const potTotal = metrics.totalHandsExpected * metrics.unitAmount;
  const handsTouched = metrics.handsTouchedCount || 0;
  const useSegments = metrics.totalHandsExpected > 0 && metrics.totalHandsExpected <= MAX_SEGMENTS;

  return (
    <Card tone="hero" padding="lg" style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <AmountText amount={potTotal} size="hero" tone="onHero" />
        <Text variant="body" tone="onHeroMuted">{t('Cagnotte du tour · {0} mains × {1}', metrics.totalHandsExpected, formatCurrency(metrics.unitAmount))}
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        {useSegments ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('{0} main(s) remise(s) sur {1}', handsTouched, metrics.totalHandsExpected)}
            style={{ flexDirection: 'row', gap: spacing.xs }}
          >
            {Array.from({ length: metrics.totalHandsExpected }).map((_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: spacing.xs,
                  borderRadius: radius.pill,
                  backgroundColor: i < handsTouched ? colors.heroTrackActive : colors.heroTrack,
                }}
              />
            ))}
          </View>
        ) : (
          <ProgressBar value={cycleProgressPct / 100} tone="onHero" size="sm" accessibilityLabel={t('Progression du tirage')} />
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm }}>
          <Text variant="label" tone="onHero">
            {handsTouched} / {metrics.totalHandsExpected}{' '}{t('mains remises')}</Text>
          {metrics.endDate ? (
            <Text variant="caption" tone="onHeroMuted">
              {metrics.startDate ? `${formatDateShort(metrics.startDate)} → ` : `${t('Fin')} `}
              {formatDateShort(metrics.endDate)} · {metrics.daysRemaining} j
            </Text>
          ) : null}
        </View>
      </View>

      {children ? (
        <View style={{ gap: spacing.lg }}>
          <View style={{ height: 1, backgroundColor: colors.divider }} />
          {children}
        </View>
      ) : null}
    </Card>
  );
};
