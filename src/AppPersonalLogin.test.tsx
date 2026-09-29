import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import type { SessionUser } from "./lib/domain";
import type { ReactNode } from "react";
import App from "./App";
const auth = vi.hoisted(() => ({
  getCurrentAppSession: vi.fn().mockResolvedValue({
    displayName: "Společný přístup",
    role: "member",
    accessMode: "shared",
  }),
  subscribeToAuth: vi.fn((callback: (session: SessionUser | null) => void) => {
    void callback;
    return () => {};
  }),
  signOut: vi.fn().mockResolvedValue(undefined),
  verifyEmailOtp: vi.fn().mockResolvedValue({
    displayName: "Člen",
    role: "member",
    accessMode: "member",
    memberId: "a",
    email: "synthetic@example.invalid",
  }),
  requestEmailLogin: vi.fn(),
  signInWithSharedCode: vi.fn(),
}));
vi.mock("./lib/auth", () => auth);
vi.mock("./lib/supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("./components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("./pages/EventDetailPage", () => ({
  EventDetailPage: ({ onPersonalLogin }: { onPersonalLogin: () => void }) => (
    <>
      <h1>Detail akce</h1>
      <button onClick={onPersonalLogin}>Přihlásit se osobně</button>
    </>
  ),
}));
vi.mock("./pages/LoginPage", () => ({
  LoginPage: ({
    onEmailOtpLogin,
  }: {
    onEmailOtpLogin: (email: string, token: string) => Promise<void>;
  }) => (
    <button
      onClick={() =>
        void onEmailOtpLogin("synthetic@example.invalid", "123456")
      }
    >
      Ověřit kód
    </button>
  ),
}));
afterEach(cleanup);
it("returns to the same event after changing shared access to personal login", async () => {
  window.history.replaceState(null, "", "#/udalosti/e");
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: "Přihlásit se osobně" }),
  );
  await user.click(await screen.findByRole("button", { name: "Ověřit kód" }));
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Detail akce" }),
    ).toBeInTheDocument(),
  );
  expect(auth.signOut).toHaveBeenCalledOnce();
  expect(auth.verifyEmailOtp).toHaveBeenCalledWith(
    "synthetic@example.invalid",
    "123456",
  );
  expect(window.location.hash).toBe("#/udalosti/e");
});

it("keeps a newer verified session when initial verification fails late", async () => {
  window.history.replaceState(null, "", "#/udalosti/e");
  let rejectInitial: (reason: unknown) => void = () => {};
  auth.getCurrentAppSession.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectInitial = reject;
      }),
  );
  let received: (session: SessionUser | null) => void = () => {};
  auth.subscribeToAuth.mockImplementationOnce((callback) => {
    received = callback;
    return () => {};
  });
  render(<App />);
  await act(async () =>
    received({
      displayName: "Člen",
      role: "member",
      accessMode: "member",
      memberId: "a",
    }),
  );
  await act(async () => rejectInitial({ message: "Stale verification" }));
  expect(
    screen.getByRole("heading", { name: "Detail akce" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
