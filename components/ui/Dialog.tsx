import React from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { useTheme } from '@/theme';
import { Icon, UiIconName } from './Icon';
import { Text } from './Text';

export interface DialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Optional icon shown in a tinted disc above the title. */
  icon?: UiIconName;
  tone?: 'primary' | 'success' | 'danger';
  children: React.ReactNode;
  /** Buttons row pinned under the scrollable body. */
  actions?: React.ReactNode;
}

/** Centered modal card: overlay, title, 48dp close button, scrollable body, actions. */
export function Dialog({ visible, onClose, title, subtitle, icon, tone = 'primary', children, actions }: DialogProps) {
  const { colors, spacing, radius, layout } = useTheme();
  const { height, width } = useWindowDimensions();
  const toneColors = {
    primary: { bg: colors.primarySoft, fg: colors.primary },
    success: { bg: colors.successSoft, fg: colors.success },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[tone];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: layout.gutter }}>
        <View
          style={{
            width: '100%',
            maxWidth: Math.min(440, width - layout.gutter * 2),
            maxHeight: height * 0.9,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            paddingVertical: spacing.xl,
            gap: spacing.lg,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.xl }}>
            {icon ? (
              <View
                style={{
                  width: layout.touchTarget,
                  height: layout.touchTarget,
                  borderRadius: radius.pill,
                  backgroundColor: toneColors.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={icon} size={24} color={toneColors.fg} />
              </View>
            ) : null}
            <View style={{ flex: 1, minWidth: 0, gap: spacing.xs, paddingTop: icon ? spacing.xs : 0 }}>
              <Text variant="heading" accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? (
                <Text variant="body" tone="muted">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
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
              <Icon name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {actions ? <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl }}>{actions}</View> : null}
        </View>
      </View>
    </Modal>
  );
}
