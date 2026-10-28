import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Icon, StatusBadge, Text } from '@/components/ui';
import { formatDateShort } from '@/lib/formatters';
import { localDateString } from '@/lib/dates';
import { MemberRound, buildMemberSchedule } from '@/services/scheduleService';
import { useTheme } from '@/theme';
import { t } from '@/i18n';

interface MemberScheduleCardProps {
  /** Round days of the cycle (buildCycleRounds). */
  rounds: string[];
  memberHands: number;
  paidHands: number;
  /** The member's payout ranks (round numbers where they receive the pot). */
  payoutRanks: number[];
}

/** Rounds shown before « Voir tout »: the past ones that are not paid, today, and a few to come. */
const UPCOMING_SHOWN = 3;

function RoundBadge({ round }: { round: MemberRound }) {
  const hands = (n: number) => t('{0}/{1} main{2}', n, round.dueHands, round.dueHands > 1 ? 's' : '');
  switch (round.state) {
    case 'PAID':
      return <StatusBadge status="PAID_TODAY" label={t('Payé')} appearance="inline" />;
    case 'PARTIAL':
      return <StatusBadge status="UNPAID_TODAY" label={t('Partiel')} detail={hands(round.paidHands)} appearance="inline" />;
    case 'DUE_TODAY':
      return <StatusBadge status="UNPAID_TODAY" appearance="inline" />;
    case 'LATE':
      return <StatusBadge status="OVERDUE" detail={round.paidHands > 0 ? hands(round.paidHands) : undefined} appearance="inline" />;
    default:
      return <Text variant="caption" tone="muted">{t('À venir')}</Text>;
  }
}

/**
 * Échéancier: every round of the cycle with the hands due and paid, so the manager sees which
 * days a member owes and which are already paid, and on which day they receive their hand.
 */
export function MemberScheduleCard({ rounds, memberHands, paidHands, payoutRanks }: MemberScheduleCardProps) {
  const { colors, spacing } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const today = localDateString();
  const schedule = buildMemberSchedule({ rounds, memberHands, paidHands, todayStr: today });
  if (!schedule.rounds.length) return null;

  const firstFuture = schedule.rounds.findIndex((r) => r.date > today);
  const cut = firstFuture === -1 ? schedule.rounds.length : firstFuture + UPCOMING_SHOWN;
  const visible = showAll ? schedule.rounds : schedule.rounds.filter((r, i) => i < cut && (r.state !== 'PAID' || r.date >= today));
  const paidHidden = !showAll ? schedule.rounds.filter((r) => r.state === 'PAID' && r.date < today).length : 0;
  const hidden = schedule.rounds.length - visible.length;

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text variant="subheading" accessibilityRole="header">{t('Échéancier')}</Text>
      <Text variant="caption" tone="muted">
        {schedule.paidUntilDate ? t('Payé jusqu\'au {0}', formatDateShort(schedule.paidUntilDate)) : t('Aucun tour entièrement payé')}
        {schedule.nextDueDate ? ` · ${t('Prochaine échéance : {0}', formatDateShort(schedule.nextDueDate))}` : ` · ${t('Tout est payé')}`}
      </Text>
      {paidHidden > 0 && (
        <Text variant="caption" tone="muted">{t('{0} tour(s) précédent(s) payé(s)', paidHidden)}</Text>
      )}
      {visible.map((r) => {
        const receives = payoutRanks.includes(r.index);
        return (
          <View
            key={r.index}
            accessible
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.md,
              paddingVertical: spacing.xs,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="label">
                {t('Tour {0}', r.index)} · {formatDateShort(r.date)}{r.date === today ? ` · ${t('aujourd\'hui')}` : ''}
              </Text>
              {receives && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Icon name="payout" size={14} color={colors.info} />
                  <Text variant="caption" tone="muted">{t('Reçoit la main ce jour')}</Text>
                </View>
              )}
            </View>
            <RoundBadge round={r} />
          </View>
        );
      })}
      {hidden > 0 && (
        <Pressable onPress={() => setShowAll(true)} accessibilityRole="button" hitSlop={8}>
          <Text variant="label" tone="primary">{t('Voir les {0} tours', schedule.rounds.length)}</Text>
        </Pressable>
      )}
    </Card>
  );
}
