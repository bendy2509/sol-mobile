import React, { createContext, use, useEffect, useMemo, useState } from 'react';

import { setDateLanguage } from '@/lib/formatters';
import { readPreference, writePreference } from '@/lib/preferences';
import { fr, TranslationKey } from './fr';
import { ht } from './ht';
import { htPhrases } from './ht.phrases';

/**
 * Offline i18n, two languages: French (source) and Kreyòl ayisyen.
 *
 * - Screen texts are written in French and wrapped with t('…'): the French text is the
 *   key, `ht.phrases.ts` holds its Kreyòl translation (gettext style).
 * - Placeholders are positional: t('{0} mains', n).
 * - A few structural labels (tabs, Réglages) use ids such as 'settings.title' (fr.ts / ht.ts).
 * - A missing translation falls back to French; scripts/test_i18n.ts checks there is none.
 *
 * t() reads the current language from a module variable, so it also works in helpers and
 * alerts. The root navigator is keyed by the language (app/_layout.tsx): changing it redraws
 * every screen without touching the session.
 */
export type Language = 'fr' | 'ht';

export const LANGUAGES: readonly { code: Language; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'ht', label: 'Kreyòl ayisyen' },
];

let currentLanguage: Language = 'fr';

export function getLanguage(): Language {
  return currentLanguage;
}

function format(text: string, args: unknown[]): string {
  return args.length ? text.replace(/\{(\d+)\}/g, (m, i) => (Number(i) < args.length ? String(args[Number(i)]) : m)) : text;
}

/** Translates a French UI text (or a structural id) into the current language. */
export function t(text: string, ...args: unknown[]): string {
  if (text in fr) {
    const key = text as TranslationKey;
    return format(currentLanguage === 'ht' ? ht[key] ?? fr[key] : fr[key], args);
  }
  return format(currentLanguage === 'ht' ? htPhrases[text] ?? text : text, args);
}

interface I18nContextValue {
  language: Language;
  /** True once the stored language has been read (the app waits for it at boot). */
  ready: boolean;
  setLanguage: (language: Language) => void;
  t: typeof t;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('fr');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    readPreference<Language>('language', ['fr', 'ht']).then((stored) => {
      if (stored) {
        currentLanguage = stored;
        setDateLanguage(stored);
        setLanguageState(stored);
      }
      setReady(true);
    });
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      ready,
      setLanguage: (next) => {
        currentLanguage = next;
        setDateLanguage(next);
        setLanguageState(next);
        writePreference('language', next);
      },
      t,
    }),
    [language, ready]
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}

const fallback: I18nContextValue = { language: 'fr', ready: true, setLanguage: () => {}, t };

export function useI18n(): I18nContextValue {
  return use(I18nContext) ?? fallback;
}

export type { TranslationKey };
