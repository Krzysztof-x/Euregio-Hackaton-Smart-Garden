import { createContext, useContext } from "react";
import type { Language, TextKey } from "./translations";

// Kept in its own file: editing translations must not create a new context during hot reload.

export interface I18n {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TextKey, vars?: Record<string, string | number>) => string;
  formatNumber: (value: number, digits: number) => string;
  formatTime: (ms: number, withSeconds?: boolean) => string;
  formatAgo: (ms: number, now: number) => string;
}

export const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside <LanguageProvider>");
  return context;
}
