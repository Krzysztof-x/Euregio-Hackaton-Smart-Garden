import { Leaf, LoaderCircle, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { ConnectionStatus } from "../hooks/useGardenData";
import type { Theme } from "../hooks/useTheme";
import { useI18n } from "../i18n/context";
import { LANGUAGES, type TextKey } from "../i18n/translations";

const STATUS_TEXT: Record<ConnectionStatus, TextKey> = {
  connected: "statusConnected",
  connecting: "statusConnecting",
  offline: "statusOffline",
};

interface HeaderProps {
  status: ConnectionStatus;
  theme: Theme;
  onToggleTheme: () => void;
  /** extra controls, e.g. the notification bell */
  children?: ReactNode;
}

/** Title, broker connection status, language switch and light/dark switch. */
export function Header({ status, theme, onToggleTheme, children }: HeaderProps) {
  const { t, lang, setLang } = useI18n();
  const themeLabel = theme === "dark" ? t("themeToLight") : t("themeToDark");

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-logo">
          <Leaf size={22} aria-hidden="true" />
        </span>
        <div>
          <h1>{t("appTitle")}</h1>
          <p>{t("appSubtitle")}</p>
        </div>
      </div>

      <div className="controls">
        <span className={`pill is-${status}`} role="status">
          {status === "connecting" ? (
            <LoaderCircle size={14} className="spin" aria-hidden="true" />
          ) : (
            <span className="dot" aria-hidden="true" />
          )}
          {t(STATUS_TEXT[status])}
        </span>

        <div className="segmented" role="group" aria-label={t("language")}>
          {LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              lang={language.code}
              title={language.name}
              aria-pressed={lang === language.code}
              onClick={() => setLang(language.code)}
            >
              {language.label}
            </button>
          ))}
        </div>

        {children}

        <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
          {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
