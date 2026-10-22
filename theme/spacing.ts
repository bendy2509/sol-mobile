/**
 * SOL Mobile — Spacing scale (4/8 grid). Only these values are allowed in screens.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Layout constants shared by every screen. */
export const layout = {
  /** Horizontal screen gutter. */
  gutter: spacing.lg,
  /** Minimum touch target (dp). Buttons are 44, main actions 48. */
  touchTarget: 44,
  /** Main action button height (thumb zone). */
  actionHeight: 48,
  /** Minimum list row height. */
  rowHeight: 56,
  /** Centered content width on tablets. */
  maxContentWidth: 720,
  /** Tablet breakpoint. */
  tabletMinWidth: 768,
} as const;
