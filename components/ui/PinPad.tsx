import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';

export interface PinPadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  disabled?: boolean;
  /** 44dp keys instead of 48dp (short screens). */
  compact?: boolean;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['C', '0', 'DEL'],
];

/**
 * Numeric keypad for phone numbers and PINs. Flat 48dp keys, one-handed use.
 * Haptic feedback stays in the screen handlers (they already trigger it).
 */
export function PinPad({ onDigit, onBackspace, onClear, disabled = false, compact = false }: PinPadProps) {
  const { colors, spacing, radius, layout } = useTheme();
  const keyHeight = compact ? layout.touchTarget : layout.actionHeight;

  return (
    <View style={{ gap: spacing.sm, opacity: disabled ? 0.6 : 1 }}>
      {ROWS.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: spacing.sm }}>
          {row.map((k) => {
            const isAction = k === 'C' || k === 'DEL';
            return (
              <Pressable
                key={k}
                disabled={disabled}
                onPress={() => (k === 'C' ? onClear() : k === 'DEL' ? onBackspace() : onDigit(k))}
                accessibilityRole="button"
                accessibilityLabel={k === 'DEL' ? 'Supprimer le dernier chiffre' : k === 'C' ? 'Tout effacer' : k}
                style={({ pressed }) => ({
                  flex: 1,
                  height: keyHeight,
                  borderRadius: radius.md,
                  borderCurve: 'continuous',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? colors.surfacePressed : isAction ? 'transparent' : colors.surfaceAlt,
                })}
              >
                {k === 'DEL' ? (
                  <Icon name="backspace" size={22} color={colors.textMuted} />
                ) : k === 'C' ? (
                  <Text variant="label" tone="muted">
                    Effacer
                  </Text>
                ) : (
                  <Text variant="numpad">{k}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
