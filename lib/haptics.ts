import * as Haptics from 'expo-haptics';

/**
 * Safe haptic feedback wrappers for market operations
 */

export function triggerLightImpact(): void {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
}

export function triggerMediumImpact(): void {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {}
}

export function triggerHeavyImpact(): void {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {}
}

export function triggerSuccessFeedback(): void {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

export function triggerWarningFeedback(): void {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {}
}

export function triggerErrorFeedback(): void {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {}
}

export function triggerSelectionHaptic(): void {
  try {
    Haptics.selectionAsync();
  } catch {}
}
