import React from 'react';
import { View } from 'react-native';

import { Avatar, StatusBadge, Text } from '@/components/ui';
import { Client } from '@/types';
import { MemberSheet } from '@/services/memberSheet';
import { useTheme } from '@/theme';
import { t } from '@/i18n';

/** Name, phone, hands and ranks, and the hands already received. */
export function MemberIdentity({ client, sheet }: { client: Client; sheet: MemberSheet }) {
  const { spacing } = useTheme();
  const { isMulti, memberHands, receivedHands } = sheet;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar name={client.fullName} size="lg" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title" numberOfLines={2} selectable>
            {client.fullName}
          </Text>
          <Text variant="body" tone="muted" selectable>
            {client.phoneNumber}
          </Text>
        </View>
      </View>

      <Text variant="caption" tone="muted">
        {isMulti ? t('{0} mains · rangs {1}', memberHands, sheet.payoutRanks.join(',')) : t('Rang {0}', sheet.payoutRanks[0] || 1)} ·{' '}
        {client.type === 'SABOTAY' ? t('Sabotay') : client.type === 'SOL' ? t('Sol') : client.type}
      </Text>
      {sheet.isFullyReceived ? (
        <StatusBadge
          status="HAND_RECEIVED"
          appearance="inline"
          label={isMulti ? t('Toutes les mains reçues ({0}/{1})', memberHands, memberHands) : t('Main reçue')}
        />
      ) : isMulti && receivedHands > 0 ? (
        <StatusBadge status="HAND_RECEIVED" appearance="inline" label={t('{0}/{1} mains reçues', receivedHands, memberHands)} />
      ) : null}
    </View>
  );
}
