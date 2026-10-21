import { TextStyle } from 'react-native';

/**
 * SOL Mobile — Type scale (Public Sans, embedded in assets/fonts, loaded with expo-font).
 * Each weight is its own family: never combine a custom fontFamily with fontWeight
 * (Android would fall back to the system font).
 * Minimum size is 14 (field use in full sunlight). Amounts always use tabular figures.
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

export const typography = {
  // Amounts (HTG): the heroes of every screen
  amountHero: { fontFamily: fontFamilies.extrabold, fontSize: 40, lineHeight: 46, letterSpacing: -0.5, fontVariant: tabular },
  amountLarge: { fontFamily: fontFamilies.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.3, fontVariant: tabular },
  amount: { fontFamily: fontFamilies.bold, fontSize: 18, lineHeight: 22, fontVariant: tabular },
  amountSmall: { fontFamily: fontFamilies.bold, fontSize: 15, lineHeight: 20, fontVariant: tabular },

  // Text
  title: { fontFamily: fontFamilies.bold, fontSize: 22, lineHeight: 28 },
  heading: { fontFamily: fontFamilies.bold, fontSize: 18, lineHeight: 24 },
  subheading: { fontFamily: fontFamilies.bold, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamilies.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fontFamilies.semibold, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: fontFamilies.medium, fontSize: 14, lineHeight: 18 },

  // Controls
  button: { fontFamily: fontFamilies.bold, fontSize: 16, lineHeight: 20 },
  buttonLarge: { fontFamily: fontFamilies.bold, fontSize: 17, lineHeight: 22 },
  tab: { fontFamily: fontFamilies.semibold, fontSize: 14, lineHeight: 18 },
  numpad: { fontFamily: fontFamilies.bold, fontSize: 26, lineHeight: 32, fontVariant: tabular },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
