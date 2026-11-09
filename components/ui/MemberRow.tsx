import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { Avatar } from './Avatar';
import { StatusBadge, StatusKind } from './StatusBadge';
import { Text } from './Text';

export interface MemberRowProps {
  name: string;
  rank?: number;
  /** One short line under the name (hands, dates). Wraps, never cut. */
  meta?: string;
  status?: StatusKind;
  statusDetail?: string;
  /** Right column: an amount or a short value (tabular figures). */
  value?: string;
  valueTone?: 'default' | 'muted' | 'warning';
  /** Right-most control (a button); the row stays pressable around it. */
  action?: React.ReactNode;
  highlighted?: boolean;
  divider?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/**
 * One member in a list (collect, home, sol): rank disc, name, a discreet status dot and the
 * amount on the right. Same layout on every screen; the status never colors the whole row.
 */
export function MemberRow({
  name,
  rank,
  meta,
  status,
  statusDetail,
  value,
  valueTone = 'default',
  action,
  highlighted = false,
  divider = true,
  onPress,
  accessibilityLabel,
}: MemberRowProps) {
  const { colors, spacing, layout } = useTheme();
  return (
    // The action sits beside the pressable area, never inside it (no button in a button)
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: action ? spacing.lg : 0,
        backgroundColor: highlighted ? colors.primarySoft : 'transparent',
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: colors.divider,
      }}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: layout.rowHeight + spacing.sm,
          paddingVertical: spacing.md,
          paddingLeft: spacing.lg,
          paddingRight: action ? spacing.md : spacing.lg,
          backgroundColor: pressed ? colors.surfacePressed : 'transparent',
        })}
      >
        <Avatar rank={rank} name={rank === undefined ? name : undefined} highlighted={highlighted} />
        <View style={{ flex: 1, minWidth: 0, gap: spacing.xs / 2 }}>
          <Text variant="bodyStrong">{name}</Text>
          {status ? <StatusBadge status={status} detail={statusDetail} appearance="dot" /> : null}
          {meta ? (
            <Text variant="caption" tone="muted">
              {meta}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text variant="amount" tone={valueTone} style={{ flexShrink: 0 }}>
            {value}
          </Text>
        ) : null}
      </Pressable>
      {action}
    </View>
  );
}
