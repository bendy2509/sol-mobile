import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Avatar, rank disc or icon on the left. */
  leading?: React.ReactNode;
  /** Status badge rendered under the title. */
  meta?: React.ReactNode;
  /** Amount or action on the right. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  /** Draws the bottom divider (false on the last row of a group). */
  divider?: boolean;
  /** Highlights the row (current choice in a picker). */
  selected?: boolean;
  accessibilityLabel?: string;
}

/** Ledger row: leading · title / subtitle / meta · trailing. Min height 56dp. */
export const ListItem = React.memo(function ListItem({
  title,
  subtitle,
  leading,
  meta,
  trailing,
  onPress,
  showChevron = false,
  divider = true,
  selected = false,
  accessibilityLabel,
}: ListItemProps) {
  const { colors, spacing, layout } = useTheme();

  const content = (
    <>
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta}
      </View>
      {trailing}
      {showChevron ? <Icon name="chevron-right" size={18} color={colors.textMuted} /> : null}
    </>
  );

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    minHeight: layout.rowHeight,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: divider ? 1 : 0,
    borderBottomColor: colors.divider,
    backgroundColor: selected ? colors.primarySoft : undefined,
  };

  if (!onPress) return <View style={rowStyle}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected }}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      {content}
    </Pressable>
  );
});
