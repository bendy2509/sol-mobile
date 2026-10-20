import React from 'react';
import { ColorValue, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';

/**
 * Local stroke icon set (24×24 grid, react-native-svg, no network).
 * Replaces the View-drawn shapes of components/Icon.tsx and the emoji used as icons.
 */
type Shape =
  | { d: string }
  | { cx: number; cy: number; r: number }
  | { x: number; y: number; w: number; h: number; rx?: number };

const ICONS = {
  check: [{ d: 'M20 6 9 17l-5-5' }],
  clock: [{ cx: 12, cy: 12, r: 9 }, { d: 'M12 7v5l3 2' }],
  alert: [{ d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z' }, { d: 'M12 9v4M12 17h.01' }],
  info: [{ cx: 12, cy: 12, r: 9 }, { d: 'M12 11v5M12 8h.01' }],
  'arrow-right': [{ d: 'M5 12h14M13 6l6 6-6 6' }],
  'arrow-left': [{ d: 'M19 12H5M11 6l-6 6 6 6' }],
  'chevron-right': [{ d: 'm9 6 6 6-6 6' }],
  'chevron-down': [{ d: 'm6 9 6 6 6-6' }],
  lock: [{ x: 5, y: 11, w: 14, h: 10, rx: 2 }, { d: 'M8 11V7a4 4 0 0 1 8 0v4' }],
  cash: [{ x: 2, y: 6, w: 20, h: 12, rx: 2 }, { cx: 12, cy: 12, r: 2.5 }, { d: 'M6 12h.01M18 12h.01' }],
  payout: [{ d: 'M12 15V3M7 8l5-5 5 5' }, { d: 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4' }],
  home: [{ d: 'M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z' }],
  cycle: [{ d: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5' }],
  history: [{ d: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5' }, { d: 'M12 7v5l3 2' }],
  scan: [{ d: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8' }],
  search: [{ cx: 11, cy: 11, r: 7 }, { d: 'm20 20-4-4' }],
  filter: [{ d: 'M3 5h18l-7 8v6l-4 2v-8Z' }],
  plus: [{ d: 'M12 5v14M5 12h14' }],
  minus: [{ d: 'M5 12h14' }],
  close: [{ d: 'M18 6 6 18M6 6l12 12' }],
  user: [{ cx: 12, cy: 8, r: 4 }, { d: 'M4 21a8 8 0 0 1 16 0' }],
  users: [{ cx: 9, cy: 8, r: 4 }, { d: 'M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3' }],
  phone: [{ d: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2' }],
  message: [{ d: 'M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12Z' }],
  mail: [{ x: 3, y: 5, w: 18, h: 14, rx: 2 }, { d: 'm3 7 9 6 9-6' }],
  printer: [{ d: 'M6 9V3h12v6' }, { x: 3, y: 9, w: 18, h: 8, rx: 2 }, { d: 'M7 14h10v7H7Z' }],
  share: [{ cx: 18, cy: 5, r: 3 }, { cx: 6, cy: 12, r: 3 }, { cx: 18, cy: 19, r: 3 }, { d: 'm8.6 13.5 6.8 4M15.4 6.5l-6.8 4' }],
  shield: [{ d: 'M12 3 20 6v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6Z' }],
  crown: [{ d: 'm3 7 4.5 4L12 5l4.5 6L21 7l-2 11H5Z' }],
  eye: [{ d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z' }, { cx: 12, cy: 12, r: 3 }],
  trash: [{ d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' }],
  edit: [{ d: 'M4 20h4L19 9l-4-4L4 16Z' }],
  calendar: [{ x: 3, y: 5, w: 18, h: 16, rx: 2 }, { d: 'M3 10h18M8 3v4M16 3v4' }],
  logout: [{ d: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3' }],
} satisfies Record<string, Shape[]>;

export type UiIconName = keyof typeof ICONS;

interface IconProps {
  name: UiIconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color, strokeWidth = 2 }: IconProps) {
  const { colors } = useTheme();
  const stroke = color ?? colors.text;
  const shapes: Shape[] = ICONS[name];

  // Decorative: the parent (button, badge) carries the accessible label.
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {shapes.map((s, i) => {
          if ('d' in s) return <Path key={i} d={s.d} />;
          if ('r' in s) return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} />;
          return <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx ?? 0} />;
        })}
      </Svg>
    </View>
  );
}
