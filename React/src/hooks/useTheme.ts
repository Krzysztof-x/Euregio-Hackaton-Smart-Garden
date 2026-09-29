import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "sg-theme";

/** Light / dark mode. The first value is set by the small script in index.html (no white flash). */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // not saved - the choice still works until the page is closed
    }
  }, [theme]);

  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));
  return { theme, toggleTheme };
}
