/**
 * SOL Mobile - Unified Design System & Color Tokens
 * Tailored for Haitian ROSCA / Sol financial workflows.
 */

export const SOL_COLORS = {
  // Primary Brand: Deep Emerald Green (Lajan, Kwasans, Konfyans)
  primary: '#0D9488', // Emerald/Teal 600
  primaryDark: '#0F766E', // Emerald/Teal 700
  primaryDarker: '#115E59', // Emerald/Teal 800
  primaryLight: '#CCFBF1', // Teal 100
  primaryLighter: '#F0FDFA', // Teal 50

  // Dark & Neutral Dominants (Slate / Midnight Navy)
  secondary: '#0F172A', // Slate 900
  secondaryLight: '#1E293B', // Slate 800
  secondaryLighter: '#334155', // Slate 700
  
  // Surfaces & Backgrounds
  background: '#F8FAFC', // Slate 50 (Crisp Canvas)
  surface: '#FFFFFF', // Pure White for Cards
  surfaceSubtle: '#F1F5F9', // Slate 100
  cardBg: '#FFFFFF',
  
  // Semantic Accents
  accent: '#D97706', // Amber 600 (Sol / Cagnotte / Sync)
  accentLight: '#FEF3C7', // Amber 100
  accentLighter: '#FFFBEB', // Amber 50
  
  danger: '#E11D48', // Rose 600 (Retard / Annulation / Retrait)
  dangerDark: '#BE123C', // Rose 700
  dangerLight: '#FFE4E6', // Rose 100
  dangerLighter: '#FFF1F2', // Rose 50
  
  success: '#10B981', // Emerald 500
  successDark: '#059669',
  successLight: '#D1FAE5',
  successLighter: '#ECFDF5',
  
  warning: '#F59E0B', // Amber 500
  info: '#2563EB', // Blue 600 (Reçus / Rapports / PDF)
  infoLight: '#DBEAFE',
  infoLighter: '#EFF6FF',
  
  // Text Colors
  textPrimary: '#0F172A', // Slate 900
  textSecondary: '#475569', // Slate 600
  textMuted: '#94A3B8', // Slate 400
  textLight: '#CBD5E1', // Slate 300
  textInverse: '#FFFFFF',
  
  // Borders & Dividers
  border: '#E2E8F0', // Slate 200
  borderLight: '#F1F5F9', // Slate 100
  borderStrong: '#CBD5E1', // Slate 300
  
  white: '#FFFFFF',
  black: '#000000',
};

export const SHADOWS = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
};

export default {
  light: {
    text: SOL_COLORS.textPrimary,
    background: SOL_COLORS.background,
    tint: SOL_COLORS.primary,
    tabIconDefault: '#94A3B8',
    tabIconSelected: SOL_COLORS.primary,
  },
  dark: {
    text: '#F8FAFC',
    background: '#0F172A',
    tint: '#2DD4BF',
    tabIconDefault: '#64748B',
    tabIconSelected: '#2DD4BF',
  },
};
