import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

import { Member, MemberPaymentStatus } from '@/types';
import { ThemeColors, useTheme } from '@/theme';
import { Icon, UiIconName } from './Icon';
import { Text } from './Text';
import { t } from '@/i18n';

/** Financial statuses + UI-only states (hand received, locked). */
export type StatusKind = MemberPaymentStatus | 'HAND_RECEIVED' | 'LOCKED';

interface StatusConfig {
  label: string;
  icon: UiIconName;
  fg: keyof ThemeColors;
  bg: keyof ThemeColors;
  line: keyof ThemeColors;
}

/** Single source of truth for status vocabulary: same wording and color on every screen. */
export const STATUS_CONFIG: Record<StatusKind, StatusConfig> = {
  PAID_TODAY: { label: "Payé aujourd'hui", icon: 'check', fg: 'success', bg: 'successSoft', line: 'successLine' },
  PAID_IN_ADVANCE: { label: 'En avance', icon: 'arrow-right', fg: 'advance', bg: 'advanceSoft', line: 'advanceLine' },
  UNPAID_TODAY: { label: 'À encaisser', icon: 'clock', fg: 'warning', bg: 'warningSoft', line: 'warningLine' },
  OVERDUE: { label: 'En retard', icon: 'alert', fg: 'danger', bg: 'dangerSoft', line: 'dangerLine' },
  UPCOMING_PAYOUT: { label: 'Reçoit la main', icon: 'payout', fg: 'info', bg: 'infoSoft', line: 'infoLine' },
  HAND_RECEIVED: { label: 'Main reçue', icon: 'check', fg: 'success', bg: 'successSoft', line: 'successLine' },
  LOCKED: { label: 'Verrouillé', icon: 'lock', fg: 'locked', bg: 'lockedSoft', line: 'lockedLine' },
};

/**
 * Detail after a member's status. Several hands: it counts hands (1 hand paid out of 2 leaves
 * « À encaisser · partiel, 1 main »); one hand: late rounds; in advance: rounds ahead.
 */
export function memberStatusDetail(
  member: Pick<Member, 'paymentStatusToday' | 'handsCount' | 'handsCoveredAhead' | 'overdueRoundsCount' | 'missingHandsToday' | 'lateHands' | 'isPartialToday'>
): string | undefined {
  const isMultiHands = (member.handsCount || 1) > 1;
  const missingToday = member.missingHandsToday || 0;
  const lateHands = member.lateHands || 0;
  const hands = (n: number) => t('{0} main{1}', n, n > 1 ? 's' : '');
  switch (member.paymentStatusToday) {
    case 'PAID_IN_ADVANCE':
      return `+${member.handsCoveredAhead || 1}`;
    case 'OVERDUE':
      if (isMultiHands && lateHands > 0) return hands(lateHands);
      return member.overdueRoundsCount > 0 ? t('{0} tour{1}', member.overdueRoundsCount, member.overdueRoundsCount > 1 ? 's' : '') : undefined;
    case 'UNPAID_TODAY':
      if (member.isPartialToday) return t('partiel, {0} main{1}', missingToday, missingToday > 1 ? 's' : '');
      return isMultiHands && missingToday > 0 ? hands(missingToday) : undefined;
    default:
      return undefined;
  }
}

export interface StatusBadgeProps {
  status: StatusKind;
  /** Extra detail appended after the label, e.g. "1 tour" → "En retard · 1 tour". */
  detail?: string;
  /** Overrides the default label (keep the vocabulary consistent!). */
  label?: string;
  /** 'chip' = tinted pill, 'inline' = icon + text only (dense lists). */
  appearance?: 'chip' | 'inline';
  style?: StyleProp<ViewStyle>;
}

/** Status = color + icon + label, never color alone. */
export function StatusBadge({ status, detail, label, appearance = 'chip', style }: StatusBadgeProps) {
  const { colors, spacing, radius } = useTheme();
  const cfg = STATUS_CONFIG[status];
  const fg = colors[cfg.fg];
  const text = `${label ?? t(cfg.label)}${detail ? ` · ${detail}` : ''}`;
  const isChip = appearance === 'chip';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('Statut : {0}', text)}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          flexShrink: 1,
          minWidth: 0,
          gap: spacing.xs,
        },
        isChip && {
          minHeight: spacing.xl + spacing.xs,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm + spacing.xs,
          borderRadius: radius.pill,
          borderWidth: 1,
          backgroundColor: colors[cfg.bg],
          borderColor: status === 'LOCKED' ? colors[cfg.line] : colors[cfg.bg],
          borderStyle: status === 'LOCKED' ? 'dashed' : 'solid',
        },
        style,
      ]}
    >
      <Icon name={cfg.icon} size={14} color={fg} strokeWidth={2.5} />
      <Text variant="label" style={{ color: fg, flexShrink: 1 }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
