import React from 'react';
import { View } from 'react-native';

import { AmountText, Card, Icon, ProgressBar, StatStrip, Text } from '@/components/ui';
import { formatDateShort } from '@/lib/formatters';
import { MemberSheet } from '@/services/memberSheet';
import { useTheme } from '@/theme';
import { t } from '@/i18n';

/** Paid and left to pay, progress over the cycle and the day covered. */
export function MemberContribution({ sheet, totalPaid }: { sheet: MemberSheet; totalPaid: number }) {
  const { colors, spacing } = useTheme();
  return (
    <>
      <StatStrip
        cells={[
          { label: t('Total cotisé'), children: <AmountText amount={totalPaid} size="medium" /> },
          sheet.remainingHands === 0
            ? { label: t('Reste à verser'), value: t('Complété'), tone: 'success', hint: t('Toutes mains réglées') }
            : {
                label: t('Reste à verser'),
                tone: 'warning',
                hint: t('{0} main(s)', sheet.remainingHands),
                children: <AmountText amount={sheet.remainingAmount} size="medium" tone="warning" />,
              },
        ]}
      />

      <Card style={{ gap: spacing.sm }}>
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm }}>
            <Text variant="label">
              {t('Cotisations :')} {sheet.paidHands} / {sheet.maxHands} {t('mains')}
            </Text>
            <Text variant="label" tone="muted">
              {sheet.contributionPct} %
            </Text>
          </View>
          <ProgressBar value={sheet.contributionPct / 100} accessibilityLabel={t('Progression des cotisations')} />
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs }}>
            <Icon name="calendar" size={16} color={colors.textMuted} />
            <Text variant="caption" tone="muted">
              {t('Couvert jusqu\'au')}
            </Text>
            <Text variant="label">{sheet.schedule.paidUntilDate ? formatDateShort(sheet.schedule.paidUntilDate) : t('en attente')}</Text>
          </View>
        </View>
      </Card>
    </>
  );
}
