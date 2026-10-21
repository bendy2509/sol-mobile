import React, { createContext, use, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { readPreference, writePreference } from '@/lib/preferences';
import { brand, ColorSchemeName, palettes, ThemeColors } from './colors';
import { radius } from './radius';
import { shadowSets, ThemeShadows } from './shadows';
import { layout, spacing } from './spacing';
import { buildTypography, fontFamilies, TextSizePreference, Typography } from './typography';

export type ThemePreference = 'system' | ColorSchemeName;

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];
export const TEXT_SIZE_PREFERENCES: readonly TextSizePreference[] = ['small', 'normal', 'large'];

export interface Theme {
  scheme: ColorSchemeName;
  isDark: boolean;
  textSize: TextSizePreference;
  colors: ThemeColors;
  shadows: ThemeShadows;
  brand: typeof brand;
  spacing: typeof spacing;
  layout: typeof layout;
  radius: typeof radius;
  typography: Typography;
  fonts: typeof fontFamilies;
}

export function buildTheme(scheme: ColorSchemeName, textSize: TextSizePreference = 'normal'): Theme {
  return {
    scheme,
    isDark: scheme === 'dark',
    textSize,
    colors: palettes[scheme],
    shadows: shadowSets[scheme],
    brand,
    spacing,
    layout,
    radius,
    typography: buildTypography(textSize),
    fonts: fontFamilies,
  };
}

const defaultTheme = buildTheme('light');

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  textSize: TextSizePreference;
  setTextSize: (size: TextSizePreference) => void;
  /** True once the stored preferences have been read (avoids a flash of the wrong theme). */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Provides the active theme. Theme (system / light / dark) and text size are read from
 * local preferences and applied instantly when changed in Réglages.
 * Following the system needs `userInterfaceStyle: "automatic"` in app.json.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [textSize, setTextSizeState] = useState<TextSizePreference>('normal');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([readPreference('theme', THEME_PREFERENCES), readPreference('textSize', TEXT_SIZE_PREFERENCES)]).then(
      ([storedTheme, storedSize]) => {
        if (storedTheme) setPreferenceState(storedTheme);
        if (storedSize) setTextSizeState(storedSize);
        setReady(true);
      }
    );
  }, []);

  const scheme: ColorSchemeName = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const theme = useMemo(() => buildTheme(scheme, textSize), [scheme, textSize]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      preference,
      textSize,
      ready,
      setPreference: (pref) => {
        setPreferenceState(pref);
        writePreference('theme', pref);
      },
      setTextSize: (size) => {
        setTextSizeState(size);
        writePreference('textSize', size);
      },
    }),
    [theme, preference, textSize, ready]
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

/** Returns the active theme (light theme when used outside ThemeProvider). */
export function useTheme(): Theme {
  return use(ThemeContext)?.theme ?? defaultTheme;
}

/** Read / change the appearance preferences (theme and text size). */
export function useThemePreference(): Omit<ThemeContextValue, 'theme'> {
  const ctx = use(ThemeContext);
  return {
    preference: ctx?.preference ?? 'system',
    setPreference: ctx?.setPreference ?? (() => {}),
    textSize: ctx?.textSize ?? 'normal',
    setTextSize: ctx?.setTextSize ?? (() => {}),
    ready: ctx?.ready ?? true,
  };
}
