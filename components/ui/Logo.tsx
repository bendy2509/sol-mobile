import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import { Text } from './Text';
import { t } from '@/i18n';

/**
 * Three arrows turning around the pot: the hand passes from member to member. Same geometry
 * as the app icons (assets/images), on a 48-unit grid.
 */
const ARCS = ['M26.08 12.18A12 12 0 0 1 35.82 26.08', 'M33.19 31.71A12 12 0 0 1 16.29 33.19', 'M12.72 28.10A12 12 0 0 1 19.90 12.72'];
const HEADS = ['M39.36 26.71L35.09 30.22L32.27 25.46Z', 'M13.97 35.95L13.07 30.49L18.60 30.43Z', 'M18.66 9.34L23.84 11.29L21.13 16.11Z'];

/** The SOL Mobile mark, in the action color. `wordmark` adds the name beside it (headers). */
export function Logo({ size = 40, wordmark = false }: { size?: number; wordmark?: boolean }) {
  const { colors, spacing } = useTheme();
  const mark = (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={0} y={0} width={48} height={48} rx={12} fill={colors.primary} />
      {ARCS.map((d) => (
        <Path key={d} d={d} stroke={colors.onPrimary} strokeWidth={3.4} strokeLinecap="round" fill="none" />
      ))}
      {HEADS.map((d) => (
        <Path key={d} d={d} fill={colors.onPrimary} />
      ))}
      <Circle cx={24} cy={24} r={4.6} fill={colors.onPrimary} />
    </Svg>
  );
  if (!wordmark) return mark;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={t('SOL Mobile')} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {mark}
      <Text variant="heading">{t('SOL Mobile')}</Text>
    </View>
  );
}
