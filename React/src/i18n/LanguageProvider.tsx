import { useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nContext, type I18n } from "./context";
import { DICTIONARIES, LOCALES, type Language } from "./translations";

const STORAGE_KEY = "sg-lang";

/** Saved language, else the browser language, else English. */
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in DICTIONARIES) return saved as Language;
  } catch {
    // storage blocked (private mode) - fall through
  }
  const browser = navigator.language.slice(0, 2);
  return browser in DICTIONARIES ? (browser as Language) : "en";
}

/** Gives every component the current language, t() and number / time formatting. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // not saved - the choice still works until the page is closed
    }
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const dict = DICTIONARIES[lang];
    const locale = LOCALES[lang];
    const timeShort = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
    const timeLong = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
    const numberFormats = new Map<number, Intl.NumberFormat>();

    return {
      lang,
      setLang,
      t: (key, vars) =>
        dict[key].replace(/\{(\w+)\}/g, (match, name: string) => (vars && name in vars ? String(vars[name]) : match)),
      formatNumber: (v, digits) => {
        if (!numberFormats.has(digits)) {
          numberFormats.set(
            digits,
            new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
          );
        }
        return numberFormats.get(digits)!.format(v);
      },
      formatTime: (ms, withSeconds = false) => (withSeconds ? timeLong : timeShort).format(ms),
      // "5 sec. ago" / "vor 5 Sek." / "5 sec. geleden"
      formatAgo: (ms, now) => {
        const seconds = Math.max(0, Math.round((now - ms) / 1000));
        if (seconds < 60) return relative.format(-seconds, "second");
        if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), "minute");
        return relative.format(-Math.floor(seconds / 3600), "hour");
      },
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
