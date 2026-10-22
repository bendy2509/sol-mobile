import React from 'react';
import { View } from 'react-native';

import { getInitials } from '@/lib/formatters';
import { useTheme } from '@/theme';
import { Text } from './Text';

export interface AvatarProps {
  name?: string;
  /** Shows a rank number instead of initials (SOL draw order). */
  rank?: number;
  size?: 'sm' | 'md' | 'lg';
  /** Highlights the current beneficiary / active rank. */
  highlighted?: boolean;
}

/** Initials or rank disc used by list rows and the beneficiary banner. */
export function Avatar({ name, rank, size = 'md', highlighted = false }: AvatarProps) {
  const { colors, spacing } = useTheme();
  const dim = { sm: spacing.xxl - spacing.xs, md: spacing.xxxl - spacing.sm, lg: spacing.xxxl + spacing.sm }[size];
  const label = rank !== undefined ? String(rank) : getInitials(name || '?');

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: highlighted ? colors.primary : rank !== undefined ? colors.surfaceAlt : colors.primarySoft,
      }}
    >
      <Text
        variant={size === 'lg' ? 'heading' : 'label'}
        style={{ color: highlighted ? colors.onPrimary : rank !== undefined ? colors.text : colors.onPrimarySoft }}
      >
        {label}
      </Text>
    </View>
  );
}
