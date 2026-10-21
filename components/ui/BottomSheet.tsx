import React, { useEffect, useRef } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Main action(s), pinned under the scrollable body in the thumb zone. */
  footer?: React.ReactNode;
}

/**
 * Bottom sheet for quick actions (encaisser, remettre, détail, menu ⋯).
 * Plain RN Modal + one translate animation on the native driver: no blur, no gesture
 * library, cheap on low-end Android. Closes on backdrop tap, Android back and the close button.
 * Centered with a max width on tablets.
 */
export function BottomSheet({ visible, onClose, title, subtitle, children, footer }: BottomSheetProps) {
  const { colors, spacing, radius, layout, shadows } = useTheme();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translate = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      translate.setValue(height * 0.4);
      Animated.timing(translate, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, height, translate]);

  const isTablet = width >= layout.tabletMinWidth;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer" />
          <Animated.View
            accessibilityViewIsModal
            style={[
              {
                width: '100%',
                maxWidth: isTablet ? layout.maxContentWidth : undefined,
                alignSelf: 'center',
                maxHeight: height * 0.88,
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                borderCurve: 'continuous',
                paddingBottom: Math.max(insets.bottom, spacing.lg),
                transform: [{ translateY: translate }],
              },
              shadows.sheet,
            ]}
          >
            <View style={{ alignItems: 'center', paddingTop: spacing.sm }}>
              <View style={{ width: spacing.xxl, height: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.borderStrong }} />
            </View>

            {title ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: layout.gutter, paddingTop: spacing.md }}>
                <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
                  <Text variant="heading" accessibilityRole="header" numberOfLines={2}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text variant="caption" tone="muted">
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Fermer"
                  hitSlop={4}
                  style={({ pressed }) => ({
                    width: layout.touchTarget,
                    height: layout.touchTarget,
                    marginTop: -spacing.sm,
                    marginRight: -spacing.sm,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? colors.surfacePressed : 'transparent',
                  })}
                >
                  <Icon name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {footer ? <View style={{ paddingHorizontal: layout.gutter, gap: spacing.sm }}>{footer}</View> : null}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
