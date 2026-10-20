/**
 * SOL Mobile — Corner radii. Hierarchy: chips < controls < cards < hero.
 */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;
