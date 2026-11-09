/**
 * SOL Mobile — Semantic color palette.
 * Screens never use raw hex values: they read these roles through useTheme().
 *
 * Rules:
 * - One action color, royal blue (#1D4ED8 light, #2F5FF5 dark, white text on both): Remettre,
 *   Encaisser, Enregistrer. Nothing else is filled with it.
 * - Statuses, used sparingly (a dot or a small badge, never a whole row):
 *   green `success` = up to date, orange `warning` = late, teal `advance` = paid ahead;
 *   « À encaisser » stays neutral (muted text, clock icon).
 * - Red `danger` only for errors and destructive actions (reversal, discrepancy).
 * - Two clearly distinct levels: `background` (the screen) and `surface` (cards), in both schemes.
 * - The flag blue (#00209F) and red (#D21034) are brand accents only: logo and receipts.
 * - Every status pairs its color with an icon and a label.
 */

export type ColorSchemeName = 'light' | 'dark';

/** Fixed brand colors, identical in both schemes (flag, PDF, liseré). */
export const brand = {
  haitiBlue: '#00209F',
  haitiRed: '#D21034',
  white: '#FFFFFF',
  /** Camera backdrop (QR scanner), whatever the scheme. */
  black: '#000000',
} as const;

export interface ThemeColors {
  // Brand & actions
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;

  // Hero band (cagnotte, key totals)
  hero: string;
  onHero: string;
  onHeroMuted: string;
  heroTrack: string;
  heroTrackActive: string;

  // Surfaces
  background: string;
  surface: string;
  surfaceAlt: string;
  surfacePressed: string;
  border: string;
  borderStrong: string;
  divider: string;
  overlay: string;

  // Text
  text: string;
  textMuted: string;
  textPlaceholder: string;
  textInverse: string;
  link: string;

  // Financial statuses (fg = text/icon, soft = background, line = border)
  success: string;
  successSoft: string;
  successLine: string;
  advance: string;
  advanceSoft: string;
  advanceLine: string;
  warning: string;
  warningSoft: string;
  warningLine: string;
  danger: string;
  dangerSoft: string;
  dangerLine: string;
  info: string;
  infoSoft: string;
  infoLine: string;

  // Locked actions (e.g. cycle-capped presets)
  locked: string;
  lockedSoft: string;
  lockedLine: string;
}

const light: ThemeColors = {
  primary: '#1D4ED8',
  primaryPressed: '#1E40AF',
  onPrimary: '#FFFFFF',
  primarySoft: '#E8EEFD',
  onPrimarySoft: '#1D4ED8',

  hero: '#FFFFFF',
  onHero: '#141B2D',
  onHeroMuted: '#4A5368',
  heroTrack: '#EEF0F4',
  heroTrackActive: '#1D4ED8',

  background: '#ECEEF3',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F7',
  surfacePressed: '#E4E7EE',
  border: '#E2E5EC',
  borderStrong: '#C5CBD8',
  divider: '#EDEFF3',
  overlay: 'rgba(14, 19, 34, 0.55)',

  text: '#141B2D',
  textMuted: '#4A5368',
  textPlaceholder: '#6B7385',
  textInverse: '#FFFFFF',
  link: '#1D4ED8',

  success: '#0B6E47',
  successSoft: '#E6F4EC',
  successLine: '#A9D9BF',
  advance: '#0F6B66',
  advanceSoft: '#E3F2F1',
  advanceLine: '#A6D6D2',
  warning: '#B45309',
  warningSoft: '#FDF0E3',
  warningLine: '#F3C89B',
  danger: '#C62828',
  dangerSoft: '#FDECEC',
  dangerLine: '#F4B4B4',
  info: '#1D4ED8',
  infoSoft: '#E8EEFD',
  infoLine: '#BCCDF8',

  locked: '#4A5368',
  lockedSoft: '#EEF0F4',
  lockedLine: '#C5CBD8',
};

const dark: ThemeColors = {
  primary: '#2F5FF5',
  primaryPressed: '#2550D6',
  onPrimary: '#FFFFFF',
  primarySoft: '#17224A',
  onPrimarySoft: '#B9CBFF',

  hero: '#161D30',
  onHero: '#EEF1F8',
  onHeroMuted: '#A8B0C4',
  heroTrack: '#26304D',
  heroTrackActive: '#4D7BFF',

  background: '#090D17',
  surface: '#161D30',
  surfaceAlt: '#1F2840',
  surfacePressed: '#28324D',
  border: '#2A3450',
  borderStrong: '#3A4566',
  divider: '#222B44',
  overlay: 'rgba(0, 0, 0, 0.65)',

  text: '#EEF1F8',
  textMuted: '#A8B0C4',
  textPlaceholder: '#8C95AB',
  textInverse: '#0E1322',
  link: '#8FA8FF',

  success: '#4CC38A',
  successSoft: '#12301F',
  successLine: '#1F5A3B',
  advance: '#4FC1B8',
  advanceSoft: '#0F2C2A',
  advanceLine: '#1D5450',
  warning: '#FB923C',
  warningSoft: '#3A2210',
  warningLine: '#6B3D1A',
  danger: '#F87171',
  dangerSoft: '#3B1414',
  dangerLine: '#6E2525',
  info: '#8FA8FF',
  infoSoft: '#17224A',
  infoLine: '#2E3F80',

  locked: '#A8B0C4',
  lockedSoft: '#1E2740',
  lockedLine: '#3A4566',
};

export const palettes: Record<ColorSchemeName, ThemeColors> = { light, dark };
