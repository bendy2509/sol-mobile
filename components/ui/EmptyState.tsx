import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, ButtonProps } from './Button';
import { Icon, UiIconName } from './Icon';
import { Text } from './Text';

export interface EmptyStateProps {
  icon?: UiIconName;
  title: string;
  message?: string;
  /** Primary way out of the empty screen ("Ajouter un adhérent"). */
  action?: Pick<ButtonProps, 'label' | 'onPress' | 'icon' | 'variant'>;
}

/** Empty list / no result: says what is missing and what to do next. */
export function EmptyState({ icon = 'info', title, message, action }: EmptyStateProps) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl }}>
      <View
        style={{
          width: spacing.xxxl + spacing.lg,
          height: spacing.xxxl + spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={28} color={colors.textMuted} />
      </View>
      <Text variant="subheading" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="body" tone="muted" align="center">
          {message}
        </Text>
      ) : null}
      {action ? <Button {...action} variant={action.variant ?? 'primary'} style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}
