import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, View } from 'react-native';

import { useTheme } from '@/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: 'sm' | 'md' | 'pill';
}

/** Placeholder block with a slow opacity pulse (native driver, no shimmer gradient). */
export function Skeleton({ width = '100%', height = 16, radius = 'sm' }: SkeletonProps) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{ width, height, borderRadius: theme.radius[radius], backgroundColor: theme.colors.surfaceAlt, opacity }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** Loading placeholder for a ledger list: hero line + n rows. */
export function ListSkeleton({ rows = 5, hero = true }: { rows?: number; hero?: boolean }) {
  const { spacing, colors, radius, layout } = useTheme();
  return (
    <View accessibilityLabel="Chargement" accessibilityRole="progressbar" style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      {hero ? (
        <View style={{ gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg }}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="65%" height={32} />
          <Skeleton width="50%" height={14} />
        </View>
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' }}>
        {Array.from({ length: rows }).map((_, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              minHeight: layout.rowHeight,
              paddingHorizontal: spacing.lg,
              borderBottomWidth: i === rows - 1 ? 0 : 1,
              borderBottomColor: colors.divider,
            }}
          >
            <Skeleton width={spacing.xxl + spacing.sm} height={spacing.xxl + spacing.sm} radius="pill" />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="35%" height={12} />
            </View>
            <Skeleton width={spacing.xxxl + spacing.lg} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}
