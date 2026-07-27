import { ArrowLeft, MapPinned } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { BrandMark } from "./components/BrandMark";
import { AppLink, matchRoute, navigate, useRoute } from "./components/Router";
import {
  getCurrentAppSession,
  sendMagicLink,
  signInWithSharedCode,
  signOut,
  subscribeToAuth,
} from "./lib/auth";
import type { SessionUser } from "./lib/demoData";
import { isSupabaseConfigured } from "./lib/supabase";
import { DashboardPage } from "./pages/DashboardPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventsPage } from "./pages/EventsPage";
import { LoginPage } from "./pages/LoginPage";
import { MembersPage } from "./pages/MembersPage";
import { PairingPage } from "./pages/PairingPage";
import { ScoresPage } from "./pages/ScoresPage";
import { SettingsPage } from "./pages/SettingsPage";

const SESSION_KEY = "nsp-akce-session";

function readSession(): SessionUser | null {
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    return stored ? (JSON.parse(stored) as SessionUser) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const route = useRoute();
  const [session, setSession] = useState<SessionUser | null>(
    isSupabaseConfigured ? null : readSession,
  );
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!window.location.hash) navigate("/", { replace: true });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    void getCurrentAppSession()
      .then((nextSession) => {
        if (active) setSession(nextSession);
      })
      .catch((error: unknown) => {
        if (active) {
          setAuthError(
            error instanceof Error
              ? error.message
              : "Přihlášení se nepodařilo ověřit.",
          );
        }
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });

    const unsubscribe = subscribeToAuth((nextSession) => {
      if (active) {
        setSession(nextSession);
        setAuthReady(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!authReady) {
    return (
      <main className="auth-loading" aria-live="polite">
        <BrandMark />
        <p>Ověřujeme přihlášení…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <LoginPage
        onDemoLogin={
          isSupabaseConfigured
            ? undefined
            : () => {
                const nextSession: SessionUser = {
                  displayName: "Ukázkový správce",
                  role: "admin",
                };
                window.sessionStorage.setItem(
                  SESSION_KEY,
                  JSON.stringify(nextSession),
                );
                setSession(nextSession);
                navigate("/");
              }
        }
        onEmailLogin={async (email) => {
          if (!isSupabaseConfigured) {
            throw new Error(
              "E-mailové přihlášení funguje až po připojení Supabase.",
            );
          }
          setAuthError("");
          await sendMagicLink(email);
        }}
        onSharedCodeLogin={async (code) => {
          setAuthError("");
          if (isSupabaseConfigured) {
            const nextSession = await signInWithSharedCode(code);
            setSession(nextSession);
          } else {
            const nextSession: SessionUser = {
              displayName: "Členský přehled",
              role: "member",
            };
            window.sessionStorage.setItem(
              SESSION_KEY,
              JSON.stringify(nextSession),
            );
            setSession(nextSession);
          }
          navigate("/");
        }}
      />
    );
  }

  const canRecord = session.role === "admin" || session.role === "recorder";
  const canAdmin = session.role === "admin";
  const eventRoute = matchRoute(route, "/udalosti/:id");

  let page;
  if (route === "/") {
    page = <DashboardPage canEdit={canRecord} />;
  } else if (route === "/udalosti") {
    page = <EventsPage canEdit={canAdmin} />;
  } else if (eventRoute?.id) {
    page = (
      <EventDetailPage
        canAdmin={canAdmin}
        canEdit={canRecord}
        canPair={canAdmin}
        eventId={eventRoute.id}
      />
    );
  } else if (route === "/body") {
    page = <ScoresPage />;
  } else if (route === "/pary") {
    page = <PairingPage canEdit={canAdmin} />;
  } else if (route === "/clenove" && canRecord) {
    page = <MembersPage canEdit={canAdmin} />;
  } else if (route === "/nastaveni" && canAdmin) {
    page = <SettingsPage canEdit session={session} />;
  } else {
    page = <NotFoundPage />;
  }

  return (
    <AppShell
      currentPath={route}
      onSignOut={() => {
        void (async () => {
          setAuthError("");
          if (isSupabaseConfigured) await signOut();
          window.sessionStorage.removeItem(SESSION_KEY);
          setSession(null);
          navigate("/");
        })().catch((error: unknown) => {
          setAuthError(
            error instanceof Error
              ? error.message
              : "Odhlášení se nepodařilo.",
          );
        });
      }}
      session={session}
    >
      {authError ? (
        <div className="global-error" role="alert">
          {authError}
        </div>
      ) : null}
      {page}
    </AppShell>
  );
}

function NotFoundPage() {
  return (
    <div className="not-found">
      <span aria-hidden="true">
        <MapPinned />
      </span>
      <p className="eyebrow">Chyba 404</p>
      <h1>Tahle cesta nikam nevede</h1>
      <p>Stránka možná změnila adresu nebo už neexistuje.</p>
      <AppLink className="button button--primary button--medium" to="/">
        <ArrowLeft aria-hidden="true" />
        Zpět na přehled
      </AppLink>
    </div>
  );
}
