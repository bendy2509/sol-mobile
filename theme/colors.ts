/**
 * SOL Mobile — Semantic color palette (Direction A « Registre »).
 * Screens never use raw hex values: they read these roles through useTheme().
 *
 * Rules:
 * - Haitian blue (#00209F) is the brand signature (primary, hero, liseré).
 * - Haitian red (#D21034) is ONLY used in the bicolor liseré and official documents,
 *   never as a status. Errors / overdue use `danger` (burnt orange), a distinct hue.
 * - Every financial status pairs its color with an icon and a label.
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

  // Locked actions (closed cycle, admin only)
  locked: string;
  lockedSoft: string;
  lockedLine: string;

  // 👑 Supervisor mode: must never be confused with manager mode
  supervisor: string;
  onSupervisor: string;
  supervisorSoft: string;
}

const light: ThemeColors = {
  primary: '#00209F',
  primaryPressed: '#001A80',
  onPrimary: '#FFFFFF',
  primarySoft: '#E7EBFF',
  onPrimarySoft: '#00209F',

  hero: '#00209F',
  onHero: '#FFFFFF',
  onHeroMuted: '#C9D2FF',
  heroTrack: '#2E44B8',
  heroTrackActive: '#FFFFFF',

  background: '#F4F5F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F4',
  surfacePressed: '#E3E6EC',
  border: '#E3E6EC',
  borderStrong: '#C5CBD8',
  divider: '#EEF0F4',
  overlay: 'rgba(14, 19, 34, 0.55)',

  text: '#141B2D',
  textMuted: '#4A5368',
  textPlaceholder: '#6B7385',
  textInverse: '#FFFFFF',
  link: '#00209F',

  success: '#0B6E47',
  successSoft: '#E6F4EC',
  successLine: '#A9D9BF',
  advance: '#0F6B66',
  advanceSoft: '#E3F2F1',
  advanceLine: '#A6D6D2',
  warning: '#8A5300',
  warningSoft: '#FBF1DF',
  warningLine: '#EBCB91',
  danger: '#B83A0B',
  dangerSoft: '#FDEDE4',
  dangerLine: '#F0B9A0',
  info: '#00209F',
  infoSoft: '#E7EBFF',
  infoLine: '#B9C4FA',

  locked: '#4A5368',
  lockedSoft: '#EEF0F4',
  lockedLine: '#C5CBD8',

  supervisor: '#3D1A78',
  onSupervisor: '#FFFFFF',
  supervisorSoft: '#EFE8FB',
};

const dark: ThemeColors = {
  primary: '#8EA0FF',
  primaryPressed: '#A9B7FF',
  onPrimary: '#0B1440',
  primarySoft: '#1E2A5C',
  onPrimarySoft: '#C9D2FF',

  hero: '#14247A',
  onHero: '#FFFFFF',
  onHeroMuted: '#B7C2FF',
  heroTrack: '#2C3C96',
  heroTrackActive: '#FFFFFF',

  background: '#0E1322',
  surface: '#171E31',
  surfaceAlt: '#1E2740',
  surfacePressed: '#26304D',
  border: '#2A3450',
  borderStrong: '#3A4566',
  divider: '#222B44',
  overlay: 'rgba(0, 0, 0, 0.65)',

  text: '#EEF1F8',
  textMuted: '#A8B0C4',
  textPlaceholder: '#8C95AB',
  textInverse: '#0E1322',
  link: '#A9B7FF',

  success: '#4CC38A',
  successSoft: '#12301F',
  successLine: '#1F5A3B',
  advance: '#4FC1B8',
  advanceSoft: '#0F2C2A',
  advanceLine: '#1D5450',
  warning: '#F0B45A',
  warningSoft: '#33250C',
  warningLine: '#5E4518',
  danger: '#FF8A5C',
  dangerSoft: '#3A1A10',
  dangerLine: '#6B3220',
  info: '#8EA0FF',
  infoSoft: '#1E2A5C',
  infoLine: '#33438A',

  locked: '#A8B0C4',
  lockedSoft: '#1E2740',
  lockedLine: '#3A4566',

  supervisor: '#B99AF0',
  onSupervisor: '#1C0B3D',
  supervisorSoft: '#2A1A4A',
};

export const palettes: Record<ColorSchemeName, ThemeColors> = { light, dark };
