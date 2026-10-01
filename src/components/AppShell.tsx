import {
  CalendarDays,
  Eye,
  ChevronRight,
  Home,
  LogOut,
  Medal,
  Menu,
  Settings,
  ListMusic,
  KeyRound,
  Database,
  Layers,
  UsersRound,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type { SessionUser } from "../lib/domain";
import { BrandMark } from "./BrandMark";
import { AppLink } from "./Router";

const navigation = [
  { path: "/", label: "Přehled", icon: Home },
  { path: "/udalosti", label: "Akce", icon: CalendarDays },
  { path: "/body", label: "Body", icon: Medal },
  { path: "/clenove", label: "Členové", icon: UsersRound },
];

const settingsNavigation = [
  { path: "/nastaveni/sezony", label: "Sezóny", icon: CalendarDays },
  { path: "/nastaveni/pasma", label: "Pásma", icon: Layers },
  { path: "/nastaveni/pisne", label: "Písně", icon: ListMusic },
  { path: "/nastaveni/pristupy", label: "Přístupy", icon: KeyRound },
  { path: "/nastaveni/data", label: "Data", icon: Database },
];

function pathIsActive(currentPath: string, path: string) {
  if (path === "/") return currentPath === "/";
  return currentPath === path || currentPath.startsWith(`${path}/`);
}

export function AppShell({
  children,
  currentPath,
  session,
  onSignOut,
  memberPreview = false,
  onToggleMemberPreview,
}: {
  children: ReactNode;
  currentPath: string;
  session: SessionUser;
  onSignOut: () => void;
  memberPreview?: boolean;
  onToggleMemberPreview?: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const availableNavigation = navigation.filter(
    (item) => item.path !== "/clenove" || session.role !== "member",
  );
  const canOpenSettings = session.role === "admin";
  const roleLabel =
    session.role === "admin"
      ? "Správce"
      : session.accessMode === "shared"
        ? "Společný přehled"
        : "Člen souboru";

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        Přeskočit na obsah
      </a>
      <aside
        aria-label="Hlavní navigace"
        className={`sidebar ${mobileMenuOpen ? "is-open" : ""}`}
      >
        <div className="sidebar__brand">
          <BrandMark />
          <div>
            <strong>Národopisný soubor</strong>
            <span>Postřekov · docházka a páry</span>
          </div>
          <button
            aria-label="Zavřít nabídku"
            className="sidebar__close"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <nav className="sidebar__nav">
          {availableNavigation.map((item) => {
            const Icon = item.icon;
            const active = pathIsActive(currentPath, item.path);
            return (
              <AppLink
                aria-current={active ? "page" : undefined}
                className={active ? "is-active" : ""}
                key={item.path}
                onClick={() => setMobileMenuOpen(false)}
                to={item.path}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                <ChevronRight aria-hidden="true" className="nav-chevron" />
              </AppLink>
            );
          })}
          {canOpenSettings && (
            <div className="sidebar__settings">
              <span className="sidebar__section-label">Nastavení</span>
              {settingsNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <AppLink
                    key={item.path}
                    to={item.path}
                    aria-current={
                      pathIsActive(currentPath, item.path) ? "page" : undefined
                    }
                    className={
                      pathIsActive(currentPath, item.path) ? "is-active" : ""
                    }
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </AppLink>
                );
              })}
            </div>
          )}
        </nav>

        <div className="sidebar__bottom">
          {onToggleMemberPreview && (
            <button
              className="sidebar__view-toggle"
              type="button"
              aria-pressed={memberPreview}
              onClick={() => {
                setMobileMenuOpen(false);
                onToggleMemberPreview();
              }}
            >
              <Eye aria-hidden="true" />
              <span>
                {memberPreview ? "Zobrazit jako správce" : "Zobrazit jako člen"}
              </span>
            </button>
          )}
          {onToggleMemberPreview && (
            <details className="sidebar__view-help">
              <summary>Nápověda zobrazení</summary>
              <p>
                Náhled skryje administraci a nezveřejněné podklady. Osobní
                odpovědi patří vašemu členskému účtu a jejich uložení je
                skutečná změna. Obnovení stránky vrátí zobrazení správce.
              </p>
            </details>
          )}
          <div className="sidebar__profile">
            <span aria-hidden="true" className="profile-avatar">
              {session.displayName
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")}
            </span>
            <div>
              <strong>{session.displayName}</strong>
              <span>{roleLabel}</span>
            </div>
            <button aria-label="Odhlásit se" onClick={onSignOut} type="button">
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          aria-label="Zavřít nabídku"
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          type="button"
        />
      ) : null}

      <div className="app-main">
        <header className="mobile-header">
          <button
            aria-label="Otevřít nabídku"
            onClick={() => setMobileMenuOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" />
          </button>
          <AppLink className="mobile-brand" to="/">
            <BrandMark />
            <strong>Postřekov</strong>
          </AppLink>
          {canOpenSettings ? (
            <AppLink aria-label="Nastavení" to="/nastaveni/pristupy">
              <Settings aria-hidden="true" />
            </AppLink>
          ) : (
            <span aria-hidden="true" className="mobile-header__spacer" />
          )}
        </header>

        <main id="main-content">{children}</main>

        <nav
          aria-label="Mobilní navigace"
          className={`bottom-nav bottom-nav--${availableNavigation.length}`}
        >
          {availableNavigation.map((item) => {
            const Icon = item.icon;
            const active = pathIsActive(currentPath, item.path);
            return (
              <AppLink
                aria-current={active ? "page" : undefined}
                className={active ? "is-active" : ""}
                key={item.path}
                to={item.path}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </AppLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
