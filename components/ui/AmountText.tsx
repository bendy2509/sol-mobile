import React from 'react';
import { StyleProp, TextStyle } from 'react-native';

import { formatCurrency } from '@/lib/formatters';
import { Text, TextTone } from './Text';

export type AmountSize = 'hero' | 'large' | 'medium' | 'small';

export interface AmountTextProps {
  amount: number;
  currency?: string;
  size?: AmountSize;
  tone?: TextTone;
  /** 'credit' prefixes +, 'debit' prefixes − (never on zero). */
  sign?: 'none' | 'credit' | 'debit';
  align?: 'left' | 'center' | 'right';
  style?: StyleProp<TextStyle>;
}

const VARIANT = { hero: 'amountHero', large: 'amountLarge', medium: 'amount', small: 'amountSmall' } as const;

/**
 * HTG amount with tabular figures. A zero is always neutral: never red, never signed,
 * so "-0 HTG" can't be read as a loss.
 */
export function AmountText({ amount, currency = 'HTG', size = 'medium', tone = 'default', sign = 'none', align, style }: AmountTextProps) {
  const value = Number.isFinite(amount) ? amount : 0;
  const isZero = value === 0;
  const prefix = isZero || sign === 'none' ? '' : sign === 'credit' ? '+' : '−';
  const formatted = `${prefix}${formatCurrency(Math.abs(value), currency)}`;

  return (
    <Text
      variant={VARIANT[size]}
      tone={isZero && (tone === 'danger' || tone === 'success') ? 'muted' : tone}
      align={align}
      selectable
      numberOfLines={1}
      adjustsFontSizeToFit={size === 'hero' || size === 'large'}
      accessibilityLabel={`${sign === 'debit' && !isZero ? 'moins ' : ''}${formatCurrency(Math.abs(value), currency)}`}
      style={style}
    >
      {formatted}
    </Text>
  );
}
