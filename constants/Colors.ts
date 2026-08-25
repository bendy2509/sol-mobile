export const SOL_COLORS = {
  primary: '#059669', // Strong Emerald Green (Lajan / Kwasans)
  primaryDark: '#047857',
  primaryLight: '#D1FAE5',
  secondary: '#0F172A', // Slate 900 (High-contrast text & dark elements)
  accent: '#D97706', // Amber 600 (Pending sync / Sol)
  accentLight: '#FEF3C7',
  danger: '#DC2626', // Red 600 (Withdrawals / errors)
  dangerLight: '#FEE2E2',
  background: '#F8FAFC', // Slate 50
  cardBg: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#CBD5E1',
  borderLight: '#E2E8F0',
  white: '#FFFFFF',
  black: '#000000',
  success: '#10B981',
  warning: '#F59E0B',
};

export default {
  light: {
    text: SOL_COLORS.textPrimary,
    background: SOL_COLORS.background,
    tint: SOL_COLORS.primary,
    tabIconDefault: '#64748B',
    tabIconSelected: SOL_COLORS.primary,
  },
  dark: {
    text: '#F8FAFC',
    background: '#0F172A',
    tint: '#34D399',
    tabIconDefault: '#94A3B8',
    tabIconSelected: '#34D399',
  },
};
