import { ViewStyle } from 'react-native';
import { ColorSchemeName } from './colors';

/**
 * SOL Mobile — Elevation levels, as CSS `boxShadow` (iOS + Android New Architecture).
 * Kept light on purpose: Direction A separates surfaces with borders first.
 * Dark mode relies on borders only (shadows are invisible on dark grounds).
 */
export interface ThemeShadows {
  none: ViewStyle;
  card: ViewStyle;
  raised: ViewStyle;
  sheet: ViewStyle;
}

const light: ThemeShadows = {
  none: {},
  card: { boxShadow: '0px 1px 2px rgba(20, 27, 45, 0.06)' },
  raised: { boxShadow: '0px 4px 12px rgba(20, 27, 45, 0.10)' },
  sheet: { boxShadow: '0px -2px 16px rgba(20, 27, 45, 0.12)' },
};

const dark: ThemeShadows = {
  none: {},
  card: {},
  raised: {},
  sheet: {},
};

export const shadowSets: Record<ColorSchemeName, ThemeShadows> = { light, dark };
