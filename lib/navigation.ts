import { router } from 'expo-router';
import { triggerLightImpact } from '@/lib/haptics';

/**
 * Safely navigates back if there is history, or falls back to a default route.
 * Prevents dead ends, no-op clicks, and crashes when navigation history is shallow.
 */
export function safeBack(customRouter?: any, fallbackRoute: string = '/(tabs)'): void {
  triggerLightImpact();
  const r = customRouter || router;
  if (r.canGoBack()) {
    r.back();
  } else {
    r.replace(fallbackRoute as any);
  }
}

/**
 * Navigates to a tab screen without pushing redundant stack instances.
 * Using router.navigate activates existing tab screens instead of duplicating them.
 */
export function navigateToTab(tabPath: '/(tabs)' | '/(tabs)/collect' | '/(tabs)/sol' | '/(tabs)/history', customRouter?: any): void {
  triggerLightImpact();
  const r = customRouter || router;
  r.navigate(tabPath as any);
}
