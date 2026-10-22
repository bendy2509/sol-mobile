import { TextStyle } from 'react-native';

/**
 * SOL Mobile — Type scale (Public Sans, embedded in assets/fonts, loaded with expo-font).
 * Each weight is its own family: never combine a custom fontFamily with fontWeight
 * (Android would fall back to the system font).
 * Sizes follow the brief: body 15, captions 13, screen titles 21, one hero amount at 30.
 * The scale is multiplied by the text-size preference (Réglages → Apparence); the
 * system font size still applies on top, through allowFontScaling.
 * Amounts always use tabular figures.
 */

export const fontFamilies = {
  regular: 'PublicSans_400Regular',
  medium: 'PublicSans_500Medium',
  semibold: 'PublicSans_600SemiBold',
  bold: 'PublicSans_700Bold',
  extrabold: 'PublicSans_800ExtraBold',
} as const;

/** Font map passed to useFonts() in app/_layout.tsx. */
export const fontAssets = {
  [fontFamilies.regular]: require('../assets/fonts/PublicSans_400Regular.ttf'),
  [fontFamilies.medium]: require('../assets/fonts/PublicSans_500Medium.ttf'),
  [fontFamilies.semibold]: require('../assets/fonts/PublicSans_600SemiBold.ttf'),
  [fontFamilies.bold]: require('../assets/fonts/PublicSans_700Bold.ttf'),
  [fontFamilies.extrabold]: require('../assets/fonts/PublicSans_800ExtraBold.ttf'),
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
  amountHero: { fontFamily: fontFamilies.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: -0.4, fontVariant: tabular },
  amountLarge: { fontFamily: fontFamilies.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.2, fontVariant: tabular },
  amount: { fontFamily: fontFamilies.bold, fontSize: 16, lineHeight: 22, fontVariant: tabular },
  amountSmall: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 20, fontVariant: tabular },

  // Text
  title: { fontFamily: fontFamilies.bold, fontSize: 21, lineHeight: 28, letterSpacing: -0.2 },
  heading: { fontFamily: fontFamilies.bold, fontSize: 18, lineHeight: 24 },
  subheading: { fontFamily: fontFamilies.semibold, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 22 },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fontFamilies.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 18 },

  // Controls
  button: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 20 },
  buttonLarge: { fontFamily: fontFamilies.semibold, fontSize: 16, lineHeight: 22 },
  tab: { fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 16 },
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
