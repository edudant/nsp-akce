import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeSwitch } from "./ThemeSwitch";
import { applyTheme, getTheme, themeStorageKey } from "../lib/theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Appearance preference", () => {
  it("defaults to explicit light even when the system uses dark, and persists both choices", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    render(<ThemeSwitch />);
    const toggle = screen.getByRole("switch", { name: "Tmavý režim" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.style.colorScheme).toBe("only light");
    fireEvent.click(toggle);
    expect(localStorage.getItem(themeStorageKey)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    cleanup();
    render(<ThemeSwitch />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("switch"));
    expect(getTheme()).toBe("light");
    vi.unstubAllGlobals();
  });
  it("allows switching when storage is blocked and ignores malformed saved values", () => {
    localStorage.setItem(themeStorageKey, "invalid");
    expect(getTheme()).toBe("light");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole("switch"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
  });
  it("updates an open tab after another tab changes the preference", () => {
    render(<ThemeSwitch />);
    localStorage.setItem(themeStorageKey, "dark");
    fireEvent(
      window,
      new StorageEvent("storage", { key: themeStorageKey, newValue: "dark" }),
    );
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});
