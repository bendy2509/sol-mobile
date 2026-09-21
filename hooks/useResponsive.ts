import { useWindowDimensions } from 'react-native';

export interface ResponsiveInfo {
  width: number;
  height: number;
  isVerySmallScreen: boolean; // < 340px
  isSmallScreen: boolean;     // < 380px
  isTablet: boolean;          // >= 768px
  isLandscape: boolean;
  contentMaxWidth: number | '100%';
  horizontalPadding: number;
  scaleFont: (size: number) => number;
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();

  const isVerySmallScreen = width < 340;
  const isSmallScreen = width < 380;
  const isTablet = width >= 768;
  const isLandscape = width > height;

  const contentMaxWidth = isTablet ? 768 : '100%';
  const horizontalPadding = isVerySmallScreen ? 10 : isSmallScreen ? 12 : 16;

  const scaleFont = (size: number) => {
    if (isVerySmallScreen) return Math.max(9, Math.round(size * 0.88));
    if (isSmallScreen) return Math.max(10, Math.round(size * 0.94));
    if (isTablet) return Math.round(size * 1.05);
    return size;
  };

  return {
    width,
    height,
    isVerySmallScreen,
    isSmallScreen,
    isTablet,
    isLandscape,
    contentMaxWidth,
    horizontalPadding,
    scaleFont,
  };
}
