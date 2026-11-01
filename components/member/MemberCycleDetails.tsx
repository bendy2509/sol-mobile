import React from 'react';

import { Card, Text } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { MemberSheet } from '@/services/memberSheet';
import { useTheme } from '@/theme';
import { t } from '@/i18n';
import { DetailRow } from './DetailRow';

/** The member's figures for the cycle: amount per hand, pot, what is due and what is received. */
export function MemberCycleDetails({ sheet }: { sheet: MemberSheet }) {
  const { spacing } = useTheme();
  const { isMulti, memberHands } = sheet;
  return (
    <Card style={{ gap: spacing.sm }}>
      <Text variant="subheading" accessibilityRole="header">
        {isMulti ? t('Cycle · {0} mains souscrites', memberHands) : t('Cycle')}
      </Text>
      <DetailRow label={t('Montant par main')} value={formatCurrency(sheet.unitAmount)} />
      <DetailRow label={t('Cagnotte d\'un tirage')} value={formatCurrency(sheet.potAmount)} />
      <DetailRow label={t('Total à cotiser sur le cycle')} value={t('{0} ({1} cotisations)', formatCurrency(sheet.maxAmount), sheet.maxHands)} />
      <DetailRow
        label={t('Total à recevoir')}
        value={t('{0} ({1} tirage{2})', formatCurrency(sheet.totalToReceive), memberHands, memberHands > 1 ? 's' : '')}
      />
      <DetailRow label={t('Tirages perçus')} value={`${sheet.receivedHands} / ${memberHands}`} />
    </Card>
  );
}
