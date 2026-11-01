import { TextStyle } from 'react-native';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';

/**
 * SOL Mobile — Type scale. One typeface for the whole app: Inter (@expo-google-fonts/inter),
 * three weights only — Regular 400, SemiBold 600, Bold 700 — imported weight by weight so no
 * other weight is bundled. Screens never name a font: they use these variants (or theme.fonts).
 * Each weight is its own family: never combine a custom fontFamily with fontWeight
 * (Android would fall back to the system font).
 * Sizes follow the brief: body 15, captions 13, screen titles 21, one hero amount at 30.
 * The scale is multiplied by the text-size preference (Réglages → Apparence); the
 * system font size still applies on top, through allowFontScaling.
 * Every variant uses tabular figures, so an amount lines up wherever it is shown.
 */

export const fontFamilies = {
  regular: 'Inter_400Regular',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Font map passed to useFonts() in app/_layout.tsx: the only fonts the app loads. */
export const fontAssets = {
  [fontFamilies.regular]: Inter_400Regular,
  [fontFamilies.semibold]: Inter_600SemiBold,
  [fontFamilies.bold]: Inter_700Bold,
};

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

/** Text-size preference, chosen in Réglages. */
export type TextSizePreference = 'small' | 'normal' | 'large';

export const TEXT_SIZE_FACTORS: Record<TextSizePreference, number> = {
  small: 0.92,
  normal: 1,
  large: 1.14,
};

/** Base scale at the « Normale » text size. */
const baseScale = {
  // Amounts (HTG): one hero per screen
  amountHero: { fontFamily: fontFamilies.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.4, fontVariant: tabular },
  amountLarge: { fontFamily: fontFamilies.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.2, fontVariant: tabular },
  amount: { fontFamily: fontFamilies.bold, fontSize: 16, lineHeight: 22, fontVariant: tabular },
  amountSmall: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 20, fontVariant: tabular },

  // Text
  title: { fontFamily: fontFamilies.bold, fontSize: 21, lineHeight: 28, letterSpacing: -0.2, fontVariant: tabular },
  heading: { fontFamily: fontFamilies.bold, fontSize: 18, lineHeight: 24, fontVariant: tabular },
  subheading: { fontFamily: fontFamilies.semibold, fontSize: 16, lineHeight: 22, fontVariant: tabular },
  bodyStrong: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 22, fontVariant: tabular },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22, fontVariant: tabular },
  label: { fontFamily: fontFamilies.semibold, fontSize: 13, lineHeight: 18, fontVariant: tabular },
  caption: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 18, fontVariant: tabular },

  // Controls
  button: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 20, fontVariant: tabular },
  buttonLarge: { fontFamily: fontFamilies.semibold, fontSize: 16, lineHeight: 22, fontVariant: tabular },
  tab: { fontFamily: fontFamilies.semibold, fontSize: 12, lineHeight: 16, fontVariant: tabular },
  numpad: { fontFamily: fontFamilies.semibold, fontSize: 24, lineHeight: 30, fontVariant: tabular },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof baseScale;
export type Typography = Record<TypographyVariant, TextStyle>;

/** Builds the scale for a text-size preference (sizes rounded to whole points). */
export function buildTypography(size: TextSizePreference = 'normal'): Typography {
  const f = TEXT_SIZE_FACTORS[size];
  const out = {} as Typography;
  for (const key of Object.keys(baseScale) as TypographyVariant[]) {
    const v: TextStyle = baseScale[key];
    out[key] = { ...v, fontSize: Math.round((v.fontSize as number) * f), lineHeight: Math.round((v.lineHeight as number) * f) };
  }
  return out;
}

/** Scale at the « Normale » size (static contexts such as tab labels outside the provider). */
export const typography = buildTypography('normal');
