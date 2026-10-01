import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, getTheme, saveTheme, themeStorageKey } from "../lib/theme";

export function ThemeSwitch() {
  const [theme, setTheme] = useState(getTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === themeStorageKey || event.key === null)
        setTheme(getTheme());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return (
    <button
      type="button"
      className="sidebar__theme-toggle"
      role="switch"
      aria-label="Tmavý režim"
      aria-checked={theme === "dark"}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        saveTheme(next);
        setTheme(next);
      }}
    >
      {theme === "dark" ? (
        <Moon aria-hidden="true" />
      ) : (
        <Sun aria-hidden="true" />
      )}
      <span>{theme === "dark" ? "Tmavý režim" : "Světlý režim"}</span>
      <span className="theme-switch-track" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}
