import { ArrowLeft, MapPinned } from "lucide-react";
import { useEffect, useState } from "react";
import { ViewContext } from "./components/DataContext";
import { AppShell } from "./components/AppShell";
import { BrandMark } from "./components/BrandMark";
import { AppLink, matchRoute, navigate, useRoute } from "./components/Router";
import {
  getCurrentAppSession,
  requestEmailLogin,
  signInWithSharedCode,
  signOut,
  subscribeToAuth,
  verifyEmailOtp,
} from "./lib/auth";
import type { SessionUser } from "./lib/domain";
import { isSupabaseConfigured } from "./lib/supabase";
import { DashboardPage } from "./pages/DashboardPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventsPage } from "./pages/EventsPage";
import { LoginPage } from "./pages/LoginPage";
import { MembersPage } from "./pages/MembersPage";
import { PairingPage } from "./pages/PairingPage";
import { ScoresPage } from "./pages/ScoresPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  const route = useRoute();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [previewAccount, setPreviewAccount] = useState<string | null>(null);
  const [personalLoginReturn, setPersonalLoginReturn] = useState<string | null>(
    null,
  );
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!window.location.hash) navigate("/", { replace: true });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    let authRevision = 0;
    const initialRevision = authRevision;
    void getCurrentAppSession()
      .then((nextSession) => {
        if (active && authRevision === initialRevision) {
          setSession(nextSession);
          if (nextSession) setAuthError("");
        }
      })
      .catch((error: unknown) => {
        if (active && authRevision === initialRevision) {
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
        authRevision += 1;
        setSession(nextSession);
        if (nextSession) setAuthError("");
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

  if (!isSupabaseConfigured) {
    return (
      <main className="configuration-error" role="alert">
        <BrandMark />
        <h1>Aplikace není připojená k databázi</h1>
        <p>
          Doplňte veřejnou adresu a publishable key projektu Supabase do
          lokálního prostředí a stránku znovu načtěte.
        </p>
      </main>
    );
  }

  if (!session) {
    return (
      <LoginPage
        onEmailLogin={async (email) => {
          setAuthError("");
          await requestEmailLogin(email);
        }}
        onEmailOtpLogin={async (email, token) => {
          setAuthError("");
          const nextSession = await verifyEmailOtp(email, token);
          setSession(nextSession);
          navigate(personalLoginReturn ?? "/");
          setPersonalLoginReturn(null);
        }}
        onSharedCodeLogin={async (code) => {
          setAuthError("");
          const nextSession = await signInWithSharedCode(code);
          setSession(nextSession);
          navigate("/");
        }}
      />
    );
  }

  const accountScope = `${session.email ?? session.memberId ?? session.displayName}:${session.accessMode}`;
  const memberPreview =
    session.role === "admin" && previewAccount === accountScope;
  const canRecord = session.role === "admin" && !memberPreview;
  const canAdmin = canRecord;
  const displayedSession: SessionUser = memberPreview
    ? { ...session, role: "member", accessMode: "member" }
    : session;
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
        onPersonalLogin={() => {
          void (async () => {
            setAuthError("");
            setPersonalLoginReturn(route);
            await signOut();
            setSession(null);
            setPreviewAccount(null);
          })().catch((error: unknown) =>
            setAuthError(
              error instanceof Error
                ? error.message
                : "Přihlášení se nepodařilo.",
            ),
          );
        }}
      />
    );
  } else if (route === "/body") {
    page = <ScoresPage />;
  } else if (route === "/pary") {
    page = <PairingPage canEdit={canAdmin} />;
  } else if (route === "/clenove" && canRecord) {
    page = <MembersPage canEdit={canAdmin} />;
  } else if (
    (route === "/nastaveni" ||
      /^\/nastaveni\/(sezony|pasma|pisne|pristupy|data)$/.test(route)) &&
    canAdmin
  ) {
    page = (
      <SettingsPage
        key={route}
        canEdit
        session={session}
        section={route.split("/")[2] || "pristupy"}
      />
    );
  } else {
    page = <NotFoundPage />;
  }

  return (
    <ViewContext.Provider value={{ memberPreview, scope: accountScope }}>
      <AppShell
        key={`${accountScope}:${memberPreview}`}
        memberPreview={memberPreview}
        onToggleMemberPreview={
          session.role === "admin"
            ? () => {
                setPreviewAccount(memberPreview ? null : accountScope);
                if (route.startsWith("/nastaveni") || route === "/clenove")
                  navigate("/");
              }
            : undefined
        }
        currentPath={route}
        onSignOut={() => {
          void (async () => {
            setAuthError("");
            await signOut();
            setSession(null);
            setPreviewAccount(null);
            navigate("/");
          })().catch((error: unknown) => {
            setAuthError(
              error instanceof Error
                ? error.message
                : "Odhlášení se nepodařilo.",
            );
          });
        }}
        session={displayedSession}
      >
        {authError ? (
          <div className="global-error" role="alert">
            {authError}
          </div>
        ) : null}
        {page}
      </AppShell>
    </ViewContext.Provider>
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
