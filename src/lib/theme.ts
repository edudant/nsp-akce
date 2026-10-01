export type Theme = "light" | "dark";
export const themeStorageKey = "nsp-theme";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === "light" ? "only light" : "dark";
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", theme === "light" ? "only light" : "dark");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#15202c" : "#142a47");
}

export function saveTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch {
    // The switch still works when storage is unavailable.
  }
}
