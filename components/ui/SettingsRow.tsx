import React from 'react';
import { Pressable, Switch, View } from 'react-native';

import { triggerSelectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Icon, UiIconName } from './Icon';
import { Text } from './Text';

export interface SettingsRowProps {
  label: string;
  /** Secondary line under the label. */
  description?: string;
  icon?: UiIconName;
  /** Current value shown on the right (e.g. « 15 min », « Français »). */
  value?: string;
  /** Renders a switch instead of a chevron. */
  toggle?: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean };
  onPress?: () => void;
  /** Danger rows (déconnexion) use the danger color, never the brand red. */
  tone?: 'default' | 'danger';
  divider?: boolean;
  /** Shows a lock: the action asks for the PIN. */
  requiresPin?: boolean;
  /** Current choice in a list of options (langue): check mark instead of chevron. */
  selected?: boolean;
}

/** One line of the Réglages screen: icon · label / description · value or switch · chevron. */
export function SettingsRow({ label, description, icon, value, toggle, onPress, tone = 'default', divider = true, requiresPin, selected }: SettingsRowProps) {
  const { colors, spacing, layout } = useTheme();
  const fg = tone === 'danger' ? colors.danger : colors.text;

  const content = (
    <>
      {icon ? <Icon name={icon} size={20} color={tone === 'danger' ? colors.danger : colors.textMuted} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        <Text variant="body" style={{ color: fg }}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="body" tone="muted" numberOfLines={1} style={{ maxWidth: '40%', flexShrink: 1 }}>
          {value}
        </Text>
      ) : null}
      {requiresPin ? <Icon name="lock" size={14} color={colors.textMuted} /> : null}
      {toggle ? (
        <Switch
          value={toggle.value}
          disabled={toggle.disabled}
          onValueChange={(v) => {
            triggerSelectionHaptic();
            toggle.onChange(v);
          }}
          trackColor={{ false: colors.borderStrong, true: colors.primary }}
          thumbColor={colors.surface}
          accessibilityLabel={label}
        />
      ) : selected !== undefined ? (
        selected ? <Icon name="check" size={20} color={colors.primary} strokeWidth={2.5} /> : null
      ) : onPress ? (
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      ) : null}
    </>
  );

  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    minHeight: layout.rowHeight,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: divider ? 1 : 0,
    borderBottomColor: colors.divider,
  };

  if (!onPress || toggle) return <View style={[style, toggle?.disabled && { opacity: 0.6 }]}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      accessibilityHint={requiresPin ? 'Demande votre code PIN' : undefined}
      style={({ pressed }) => [style, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      {content}
    </Pressable>
  );
}

/** Groups SettingsRow lines in one card; the last divider is hidden by the caller. */
export function SettingsGroup({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const { colors, spacing, radius, shadows } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {title ? (
        <Text variant="label" tone="muted" accessibilityRole="header" style={{ paddingHorizontal: spacing.xs }}>
          {title}
        </Text>
      ) : null}
      <View style={[{ backgroundColor: colors.surface, borderRadius: radius.md, borderCurve: 'continuous', overflow: 'hidden' }, shadows.card]}>
        {children}
      </View>
      {footer ? (
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: spacing.xs }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
