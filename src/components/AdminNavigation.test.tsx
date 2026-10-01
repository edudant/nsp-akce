import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import type { SessionUser } from "../lib/domain";
afterEach(cleanup);
const session: SessionUser = {
  displayName: "Správce",
  role: "admin",
  accessMode: "admin",
};
describe("Administrative navigation and event transitions", () => {
  it("keeps preview exclusively in the menu and shows all settings routes", () => {
    const toggle = vi.fn();
    render(
      <AppShell
        currentPath="/"
        session={session}
        onSignOut={vi.fn()}
        onToggleMemberPreview={toggle}
      >
        <h1>Obsah</h1>
      </AppShell>,
    );
    const sidebar = screen.getByRole("complementary");
    expect(
      screen.queryByRole("link", { name: "Páry" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(sidebar).getByRole("button", { name: "Zobrazit jako člen" }),
    );
    expect(toggle).toHaveBeenCalledOnce();
    expect(
      within(screen.getByRole("main")).queryByRole("button", {
        name: "Zobrazit jako člen",
      }),
    ).not.toBeInTheDocument();
    for (const name of ["Sezóny", "Přístupy", "Data"])
      expect(within(sidebar).getByRole("link", { name })).toHaveAttribute(
        "href",
        expect.stringContaining("/nastaveni/"),
      );
    expect(within(sidebar).getByRole("link", { name: "Texty" })).toHaveAttribute("href", "#/texty");
    expect(within(sidebar).getByRole("link", { name: "Akce" })).toHaveAttribute(
      "href",
      "#/udalosti",
    );
  });
  it("offers return to administrator and hides settings in member preview", () => {
    render(
      <AppShell
        currentPath="/"
        session={{ ...session, role: "member", accessMode: "member" }}
        onSignOut={vi.fn()}
        memberPreview
        onToggleMemberPreview={vi.fn()}
      >
        <h1>Obsah</h1>
      </AppShell>,
    );
    expect(
      screen.getByRole("button", { name: "Zobrazit jako správce" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Přístupy" }),
    ).not.toBeInTheDocument();
  });
});
