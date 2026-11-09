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

/**
 * Pot card: the pot of the round, the payout progress, the round of the day (calendar) and the
 * cycle dates; the beneficiary and the Remettre action follow under a rule.
 */
export const DashboardHero: React.FC<DashboardHeroProps> = ({ metrics, cycleProgressPct, children }) => {
  const { colors, spacing, radius } = useTheme();
  const handsTouched = metrics.handsTouchedCount || 0;
  const useSegments = metrics.totalHandsExpected > 0 && metrics.totalHandsExpected <= MAX_SEGMENTS;

  return (
    <Card tone="hero" padding="lg" style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="caption" tone="onHeroMuted">
          {metrics.cycleNotStarted
            ? t('Le cycle commence le {0}', formatDateShort(metrics.startDate))
            : t('Tour {0} sur {1}', metrics.currentRound, metrics.totalRounds)}
        </Text>
        <AmountText amount={metrics.totalPotAmount} size="hero" tone="onHero" />
        <Text variant="body" tone="onHeroMuted">
          {t('Cagnotte du tour · {0} mains × {1}', metrics.totalHandsExpected, formatCurrency(metrics.unitAmount))}
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
            {t('{0} / {1} mains remises', handsTouched, metrics.totalHandsExpected)}
          </Text>
          {metrics.endDate ? (
            <Text variant="caption" tone="onHeroMuted">
              {t('Du {0} au {1}', formatDateShort(metrics.startDate), formatDateShort(metrics.endDate))}
            </Text>
          ) : null}
        </View>
        {metrics.payoutsBehind > 0 ? (
          <Text variant="label" tone="warning">
            {t('{0} remise(s) en attente sur les tours passés', metrics.payoutsBehind)}
          </Text>
        ) : null}
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
