import { ViewStyle } from 'react-native';
import { ColorSchemeName } from './colors';

/**
 * SOL Mobile — Elevation levels, as CSS `boxShadow` (iOS + Android New Architecture).
 * Surfaces are separated by elevation, not outlines: a tight contact shadow plus a wide, faint ambient one.
 * Dark mode relies on surface lightness only (shadows are invisible on dark grounds).
 */
export interface ThemeShadows {
  none: ViewStyle;
  card: ViewStyle;
  raised: ViewStyle;
  sheet: ViewStyle;
}

const light: ThemeShadows = {
  none: {},
  card: { boxShadow: '0px 1px 2px rgba(20, 27, 45, 0.04), 0px 8px 24px rgba(20, 27, 45, 0.06)' },
  raised: { boxShadow: '0px 2px 4px rgba(20, 27, 45, 0.06), 0px 12px 32px rgba(20, 27, 45, 0.10)' },
  sheet: { boxShadow: '0px -2px 16px rgba(20, 27, 45, 0.12)' },
};

const dark: ThemeShadows = {
  none: {},
  card: {},
  raised: {},
  sheet: {},
};

export const shadowSets: Record<ColorSchemeName, ThemeShadows> = { light, dark };
