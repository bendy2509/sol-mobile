import React from 'react';
import { View } from 'react-native';

import { AmountText, Button, Card, Icon, Text } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { MemberSheet } from '@/services/memberSheet';
import { useTheme } from '@/theme';
import { t } from '@/i18n';

/** The hand(s) of the member: already received, or the button to pay the next one out. */
export function MemberPayoutCard({
  sheet,
  handReceivedDate,
  onPayout,
}: {
  sheet: MemberSheet;
  handReceivedDate?: string;
  onPayout: () => void;
}) {
  const { colors, spacing } = useTheme();
  const { isMulti, memberHands } = sheet;

  if (sheet.isFullyReceived) {
    return (
      <Card tone="success">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <Icon name="check" size={22} color={colors.success} strokeWidth={2.5} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="subheading" tone="success">
              {isMulti ? t('Toutes les mains remises ({0}/{1})', memberHands, memberHands) : t('Main déjà remise')}
            </Text>
            <Text variant="body" tone="success">
              {t('Cagnotte perçue')} {handReceivedDate ? t('le {0}', formatDate(handReceivedDate)) : t('pour ce cycle')} ({formatCurrency(sheet.potAmount)})
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text variant="subheading">{t('Remise de la main')}</Text>
        <AmountText amount={sheet.potAmount} size="small" />
      </View>
      <Text variant="caption" tone="muted">
        {t('{0} mains effectives au cycle × {1}', sheet.totalCycleHands, formatCurrency(sheet.unitAmount))}
      </Text>
      <Button
        icon="payout"
        fullWidth
        variant="secondary"
        label={isMulti ? t('Remettre la main ({0}/{1})', sheet.receivedHands + 1, memberHands) : t('Remettre la main')}
        onPress={onPayout}
      />
    </Card>
  );
}
