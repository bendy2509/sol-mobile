import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local display preferences (theme, text size, language, receipt header).
 * Stored on the device only; nothing here is sensitive.
 */
export const PREFERENCE_KEYS = {
  theme: 'SOL_PREF_THEME',
  textSize: 'SOL_PREF_TEXT_SIZE',
  language: 'SOL_PREF_LANGUAGE',
  receipt: 'SOL_PREF_RECEIPT',
} as const;

export type PreferenceKey = keyof typeof PREFERENCE_KEYS;

export async function readPreference<T extends string>(key: PreferenceKey, allowed: readonly T[]): Promise<T | null> {
  try {
    const value = await AsyncStorage.getItem(PREFERENCE_KEYS[key]);
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
  } catch {
    return null;
  }
}

export async function readJsonPreference<T>(key: PreferenceKey): Promise<T | null> {
  try {
    const value = await AsyncStorage.getItem(PREFERENCE_KEYS[key]);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export function writePreference(key: PreferenceKey, value: string | object): void {
  AsyncStorage.setItem(PREFERENCE_KEYS[key], typeof value === 'string' ? value : JSON.stringify(value)).catch(() => {});
}
