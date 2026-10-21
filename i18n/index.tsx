import React, { createContext, use, useEffect, useMemo, useState } from 'react';

import { readPreference, writePreference } from '@/lib/preferences';
import { en } from './en';
import { Dictionary, fr, TranslationKey } from './fr';
import { ht } from './ht';

/**
 * Minimal offline i18n: one typed dictionary per language, French as the reference and
 * fallback. Screens call t('key'); strings not yet extracted stay in French.
 */
export type Language = 'fr' | 'ht' | 'en';

export const LANGUAGES: readonly { code: Language; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'ht', label: 'Kreyòl ayisyen' },
  { code: 'en', label: 'English' },
];

const dictionaries: Record<Language, Dictionary> = { fr, ht, en };

export function translate(language: Language, key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = dictionaries[language][key] ?? fr[key];
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
  return text;
}

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('fr');

  useEffect(() => {
    readPreference<Language>('language', ['fr', 'ht', 'en']).then((stored) => {
      if (stored) setLanguageState(stored);
    });
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage: (next) => {
        setLanguageState(next);
        writePreference('language', next);
      },
      t: (key, vars) => translate(language, key, vars),
    }),
    [language]
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}

const fallback: I18nContextValue = { language: 'fr', setLanguage: () => {}, t: (key, vars) => translate('fr', key, vars) };

export function useI18n(): I18nContextValue {
  return use(I18nContext) ?? fallback;
}

export type { TranslationKey };
