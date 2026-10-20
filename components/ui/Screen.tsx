import React from 'react';
import { RefreshControlProps, ScrollView, StyleProp, View, ViewStyle, useWindowDimensions } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export interface ScreenProps {
  children: React.ReactNode;
  /** false for screens whose root is a FlatList (the list scrolls itself). */
  scroll?: boolean;
  /** Sticky bottom zone (main action in the thumb zone), above the safe area. */
  footer?: React.ReactNode;
  /** Element pinned above the content, full width (app header, banner). */
  header?: React.ReactNode;
  /** Safe-area edges handled here; tabs/stack headers already cover the top. */
  edges?: Edge[];
  /** Horizontal gutter on content (default true). */
  padded?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Pads the footer with the bottom safe area (false inside tabs: the tab bar already does). */
  footerSafeArea?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Screen shell: themed background, safe area, centered max width on tablets,
 * scroll with keyboard-friendly taps and a sticky footer for the primary action.
 */
export function Screen({
  children,
  scroll = true,
  footer,
  header,
  edges = ['left', 'right'],
  padded = true,
  refreshControl,
  footerSafeArea = true,
  contentStyle,
}: ScreenProps) {
  const { colors, spacing, layout, shadows } = useTheme();
  const { width } = useWindowDimensions();
  const isTablet = width >= layout.tabletMinWidth;

  const inner: ViewStyle = {
    width: '100%',
    maxWidth: isTablet ? layout.maxContentWidth : undefined,
    alignSelf: 'center',
    paddingHorizontal: padded ? layout.gutter : 0,
  };

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          contentContainerStyle={[inner, { paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }, contentStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <SafeAreaView
          edges={footerSafeArea ? ['bottom'] : []}
          style={[{ backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }, shadows.sheet]}
        >
          <View style={[inner, { paddingVertical: spacing.md, gap: spacing.sm }]}>{footer}</View>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}
