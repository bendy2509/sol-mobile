import React, { createContext, use, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { brand, ColorSchemeName, palettes, ThemeColors } from './colors';
import { radius } from './radius';
import { shadowSets, ThemeShadows } from './shadows';
import { layout, spacing } from './spacing';
import { fontAssets, fontFamilies, typography, TypographyVariant } from './typography';

export type ThemePreference = 'system' | ColorSchemeName;

export interface Theme {
  scheme: ColorSchemeName;
  isDark: boolean;
  colors: ThemeColors;
  shadows: ThemeShadows;
  brand: typeof brand;
  spacing: typeof spacing;
  layout: typeof layout;
  radius: typeof radius;
  typography: typeof typography;
  fonts: typeof fontFamilies;
}

export function buildTheme(scheme: ColorSchemeName): Theme {
  return {
    scheme,
    isDark: scheme === 'dark',
    colors: palettes[scheme],
    shadows: shadowSets[scheme],
    brand,
    spacing,
    layout,
    radius,
    typography,
    fonts: fontFamilies,
  };
}

const lightTheme = buildTheme('light');
const darkTheme = buildTheme('dark');

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Provides the active theme. Follows the system appearance by default
 * (requires `userInterfaceStyle: "automatic"` in app.json to receive dark mode).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ColorSchemeName =
      preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
    return { theme: scheme === 'dark' ? darkTheme : lightTheme, preference, setPreference };
  }, [preference, systemScheme]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

/** Returns the active theme (light theme when used outside ThemeProvider). */
export function useTheme(): Theme {
  return use(ThemeContext)?.theme ?? lightTheme;
}

/** Read / change the user's appearance preference (system, light, dark). */
export function useThemePreference(): Pick<ThemeContextValue, 'preference' | 'setPreference'> {
  const ctx = use(ThemeContext);
  return {
    preference: ctx?.preference ?? 'system',
    setPreference: ctx?.setPreference ?? (() => {}),
  };
}

export { brand, fontAssets, fontFamilies, layout, palettes, radius, spacing, typography };
export type { ColorSchemeName, ThemeColors, ThemeShadows, TypographyVariant };
