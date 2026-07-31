import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentAppSession,
  getEmailAuthErrorMessage,
  requestEmailLogin,
  verifyEmailOtp,
} from "./auth";

const supabaseMock = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    signInWithOtp: vi.fn(),
    signOut: vi.fn(),
    verifyOtp: vi.fn(),
  },
  from: vi.fn(),
  profileQuery: {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  },
  rpc: vi.fn(),
}));

vi.mock("./supabase", () => ({
  isSupabaseConfigured: true,
  requireSupabase: () => supabaseMock,
  supabase: supabaseMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.profileQuery.select.mockReturnValue(supabaseMock.profileQuery);
  supabaseMock.profileQuery.eq.mockReturnValue(supabaseMock.profileQuery);
  supabaseMock.profileQuery.maybeSingle.mockResolvedValue({
    data: { member_id: "member-1", display_name: "Člen Jeden" },
    error: null,
  });
  supabaseMock.from.mockReturnValue(supabaseMock.profileQuery);
  supabaseMock.rpc.mockResolvedValue({ data: ["member"], error: null });
  supabaseMock.auth.signOut.mockResolvedValue({ error: null });
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
});

describe("getEmailAuthErrorMessage", () => {
  it("shows the remaining seconds for the per-address send cooldown", () => {
    expect(
      getEmailAuthErrorMessage(
        {
          code: "over_email_send_rate_limit",
          message: "For security purposes, you can only request this after 47 seconds",
          status: 429,
        },
        "request",
      ),
    ).toBe("Nový e-mail lze poslat za 47 sekund.");
  });

  it("explains an exhausted hourly email quota", () => {
    expect(
      getEmailAuthErrorMessage(
        {
          code: "over_email_send_rate_limit",
          message: "Email rate limit exceeded",
          status: 429,
        },
        "request",
      ),
    ).toBe(
      "Limit e-mailů je dočasně vyčerpaný. Zkuste to přibližně za hodinu.",
    );
  });

  it("uses SMTP recovery advice for Gmail and provider failures", () => {
    expect(
      getEmailAuthErrorMessage(
        { code: "unexpected_failure", message: "SMTP sending quota exceeded" },
        "request",
      ),
    ).toBe(
      "Odesílání je dočasně nedostupné. Zkuste to později; při denním limitu následující den.",
    );
  });

  it("explains invalid or expired one-time codes", () => {
    expect(
      getEmailAuthErrorMessage(
        { code: "otp_expired", message: "Token has expired or is invalid" },
        "verify",
      ),
    ).toBe("Kód není platný nebo už vypršel. Pošlete si nový e-mail.");
  });
});

describe("email auth requests", () => {
  it("requests one message that can contain both a magic link and an OTP", async () => {
    supabaseMock.auth.signInWithOtp.mockResolvedValue({ error: null });

    await requestEmailLogin(" Clen@Example.cz ");

    expect(supabaseMock.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "clen@example.cz",
      options: {
        emailRedirectTo: "http://localhost:3000/",
        shouldCreateUser: true,
      },
    });
  });

  it("verifies a normalized six-digit token with the email OTP type", async () => {
    const error = Object.assign(new Error("Token expired"), {
      code: "otp_expired",
    });
    supabaseMock.auth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error,
    });

    await expect(
      verifyEmailOtp(" Clen@Example.cz ", "12 34-56"),
    ).rejects.toBe(error);
    expect(supabaseMock.auth.verifyOtp).toHaveBeenCalledWith({
      email: "clen@example.cz",
      token: "123456",
      type: "email",
    });
  });

  it("does not reveal an address rejected by the enrollment hook", async () => {
    supabaseMock.auth.signInWithOtp.mockResolvedValue({
      error: {
        message:
          "Přihlášení se nepodařilo. Zkontrolujte e-mail nebo to zkuste později.",
        status: 403,
      },
    });

    await expect(requestEmailLogin("unknown@example.cz")).resolves.toBeUndefined();
  });

  it("consumes a cross-device token-hash magic link and removes it from history", async () => {
    window.history.replaceState(
      {},
      "",
      "/nsp-akce/?token_hash=one-time-hash&type=email#/udalosti",
    );
    supabaseMock.auth.verifyOtp.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "user-1",
            email: "clen@example.cz",
            is_anonymous: false,
            user_metadata: {},
          },
        },
      },
      error: null,
    });

    await expect(getCurrentAppSession()).resolves.toEqual(
      expect.objectContaining({
        accessMode: "member",
        memberId: "member-1",
        role: "member",
      }),
    );
    expect(supabaseMock.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "one-time-hash",
      type: "email",
    });
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#/udalosti");
  });
});
