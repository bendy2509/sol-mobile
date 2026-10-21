import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { triggerLightImpact } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { BottomSheet } from './BottomSheet';
import { Icon, UiIconName } from './Icon';
import { Text } from './Text';

export interface ActionMenuItem {
  label: string;
  icon: UiIconName;
  onPress: () => void;
  description?: string;
  /** Destructive action (supprimer, annuler une opération): danger color, never the brand red. */
  destructive?: boolean;
  disabled?: boolean;
}

export interface ActionMenuProps {
  title?: string;
  items: ActionMenuItem[];
  /** Accessible name of the ⋯ button. */
  accessibilityLabel?: string;
  /** Icon color, e.g. on a header. */
  color?: string;
}

/** ⋯ button that opens the screen's secondary actions in a bottom sheet. */
export function ActionMenu({ title = 'Actions', items, accessibilityLabel = "Plus d'actions", color }: ActionMenuProps) {
  const { colors, spacing, radius, layout } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => {
          triggerLightImpact();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={4}
        style={({ pressed }) => ({
          width: layout.touchTarget,
          height: layout.touchTarget,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.surfacePressed : 'transparent',
        })}
      >
        <Icon name="more" size={22} color={color ?? colors.text} />
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={title}>
        <View style={{ marginHorizontal: -spacing.lg, marginTop: -spacing.sm }}>
          {items.map((item) => {
            const fg = item.destructive ? colors.danger : colors.text;
            return (
              <Pressable
                key={item.label}
                disabled={item.disabled}
                onPress={() => {
                  setOpen(false);
                  // Let the sheet close before a dialog or a PIN modal opens
                  setTimeout(item.onPress, 220);
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: item.disabled }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.lg,
                  minHeight: layout.rowHeight,
                  paddingHorizontal: spacing.xl,
                  paddingVertical: spacing.sm,
                  opacity: item.disabled ? 0.5 : 1,
                  backgroundColor: pressed ? colors.surfacePressed : 'transparent',
                })}
              >
                <Icon name={item.icon} size={20} color={item.destructive ? colors.danger : colors.textMuted} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text variant="body" style={{ color: fg }}>
                    {item.label}
                  </Text>
                  {item.description ? (
                    <Text variant="caption" tone="muted">
                      {item.description}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </>
  );
}
