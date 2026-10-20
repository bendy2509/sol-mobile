import React, { useState } from 'react';
import { TextInput, TextInputProps, View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  /** Help text under the field. */
  helper?: string;
  /** Error text under the field (replaces helper, danger tone). */
  error?: string;
}

/** Labelled input, 48dp minimum, themed focus and error states. */
export function TextField({ label, helper, error, multiline, onFocus, onBlur, ...inputProps }: TextFieldProps) {
  const { colors, spacing, radius, layout, typography } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label">{label}</Text>
      <TextInput
        {...inputProps}
        multiline={multiline}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        placeholderTextColor={colors.textPlaceholder}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          ...typography.body,
          color: colors.text,
          minHeight: multiline ? layout.actionHeight + spacing.xl : layout.touchTarget,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
          borderWidth: focused ? 2 : 1,
          borderColor: error ? colors.danger : focused ? colors.primary : colors.borderStrong,
          backgroundColor: colors.surface,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
