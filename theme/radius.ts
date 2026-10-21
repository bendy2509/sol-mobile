/**
 * SOL Mobile — Corner radii. Hierarchy: chips < controls < cards < hero.
 */
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;
