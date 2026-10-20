import React from 'react';
import { View } from 'react-native';
import { DashboardMetrics } from '@/types';
import { AmountText, Card, Icon, ProgressBar, Text } from '@/components/ui';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { useTheme } from '@/theme';

interface DashboardHeroProps {
  metrics: DashboardMetrics;
  cycleProgressPct: number;
  /** Current beneficiary row, rendered inside the band. */
  children?: React.ReactNode;
}

/** Segmented track (one segment per hand) is readable up to this many hands. */
const MAX_SEGMENTS = 12;

/** Blue cagnotte band: the pot is the hero of the dashboard. */
export const DashboardHero: React.FC<DashboardHeroProps> = ({ metrics, cycleProgressPct, children }) => {
  const { colors, spacing, radius } = useTheme();
  const potTotal = metrics.totalHandsExpected * metrics.unitAmount;
  const handsTouched = metrics.handsTouchedCount || 0;
  const handsRemaining = Math.max(0, metrics.totalHandsExpected - handsTouched);
  const useSegments = metrics.totalHandsExpected > 0 && metrics.totalHandsExpected <= MAX_SEGMENTS;

  return (
    <Card tone="hero" padding="lg" style={{ gap: spacing.xs }}>
      <Text variant="label" tone="onHeroMuted">
        Cagnotte du sol (bay men)
      </Text>
      <AmountText amount={potTotal} size="hero" tone="onHero" />
      <Text variant="body" tone="onHeroMuted">
        {metrics.totalHandsExpected} mains × {formatCurrency(metrics.unitAmount)}
      </Text>

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {useSegments ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${handsTouched} main(s) remise(s) sur ${metrics.totalHandsExpected}`}
            style={{ flexDirection: 'row', gap: spacing.xs }}
          >
            {Array.from({ length: metrics.totalHandsExpected }).map((_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: spacing.sm,
                  borderRadius: radius.pill,
                  backgroundColor: i < handsTouched ? colors.heroTrackActive : colors.heroTrack,
                }}
              />
            ))}
          </View>
        ) : (
          <ProgressBar value={cycleProgressPct / 100} tone="onHero" accessibilityLabel="Progression du tirage" />
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm }}>
          <Text variant="label" tone="onHero">
            {handsTouched} / {metrics.totalHandsExpected} mains remises · {handsRemaining} restante{handsRemaining > 1 ? 's' : ''}
          </Text>
          {metrics.endDate ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Icon name="calendar" size={14} color={colors.onHeroMuted} />
              <Text variant="caption" tone="onHeroMuted">
                Fin {formatDateShort(metrics.endDate)} · {metrics.daysRemaining} j
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {children ? <View style={{ marginTop: spacing.md }}>{children}</View> : null}
    </Card>
  );
};
