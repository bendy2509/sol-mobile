import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';
import { t } from '@/i18n';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Back arrow (stacked screens). */
  onBack?: () => void;
  /** Actions on the right (icon buttons, menu). */
  right?: React.ReactNode;
}

/**
 * Title block of every screen: same size, gutter and spacing everywhere. The title and the
 * subtitle wrap instead of being cut, so large text stays readable on a 360 px phone.
 */
export function ScreenHeader({ title, subtitle, onBack, right }: ScreenHeaderProps) {
  const { colors, spacing, layout, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: layout.gutter,
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
      }}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('Retour')}
          hitSlop={spacing.sm}
          style={({ pressed }) => ({
            width: layout.touchTarget,
            height: layout.touchTarget,
            marginLeft: -spacing.md,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? colors.surfacePressed : 'transparent',
          })}
        >
          <Icon name="arrow-left" size={22} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs / 2 }}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>{right}</View> : null}
    </View>
  );
}
