import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  KeyRound,
  Mail,
  RefreshCw,
  Sparkles,
  Trophy,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { Button, Field } from "../components/Ui";
import {
  EMAIL_RESEND_SECONDS,
  getEmailAuthErrorMessage,
} from "../lib/auth";

export interface LoginPageProps {
  onEmailLogin: (email: string) => Promise<void>;
  onEmailOtpLogin: (email: string, token: string) => Promise<void>;
  onSharedCodeLogin: (code: string) => Promise<void>;
}

export function LoginPage({
  onEmailLogin,
  onEmailOtpLogin,
  onSharedCodeLogin,
}: LoginPageProps) {
  const [mode, setMode] = useState<"email" | "shared">("email");
  const [emailStep, setEmailStep] = useState<"request" | "verify">(
    "request",
  );
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sharedCode, setSharedCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(
    null,
  );
  const [resendRemaining, setResendRemaining] = useState(0);

  useEffect(() => {
    if (resendAvailableAt === null) return;

    const updateRemaining = () => {
      const remaining = Math.max(
        0,
        Math.ceil((resendAvailableAt - Date.now()) / 1000),
      );
      setResendRemaining(remaining);
      if (remaining === 0) setResendAvailableAt(null);
    };

    updateRemaining();
    const interval = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(interval);
  }, [resendAvailableAt]);

  const startResendCooldown = () => {
    setResendRemaining(EMAIL_RESEND_SECONDS);
    setResendAvailableAt(Date.now() + EMAIL_RESEND_SECONDS * 1000);
  };

  const requestLoginEmail = async (address: string, resend = false) => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await onEmailLogin(address);
      setSentEmail(address);
      setEmailStep("verify");
      setOtp("");
      startResendCooldown();
      setMessage(
        resend
          ? "Poslali jsme nový přihlašovací e-mail. Platí vždy jen nejnovější kód."
          : "Pokud je adresa evidovaná, poslali jsme na ni odkaz i šestimístný kód.",
      );
    } catch (caughtError) {
      setError(getEmailAuthErrorMessage(caughtError, "request"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (mode === "email") {
      if (emailStep === "request") {
        const normalizedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          setError("Zadejte platnou e-mailovou adresu.");
          return;
        }
        await requestLoginEmail(normalizedEmail);
        return;
      }

      const normalizedOtp = otp.replace(/\D/g, "");
      if (normalizedOtp.length !== 6) {
        setError("Zadejte všech šest číslic z e-mailu.");
        return;
      }
      setLoading(true);
      try {
        await onEmailOtpLogin(sentEmail, normalizedOtp);
      } catch (caughtError) {
        setError(getEmailAuthErrorMessage(caughtError, "verify"));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (sharedCode.trim().length < 4) {
      setError("Přístupový kód má alespoň 4 znaky.");
      return;
    }
    setLoading(true);
    try {
      await onSharedCodeLogin(sharedCode.trim());
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Přihlášení se nepodařilo. Zkuste to prosím znovu.",
      );
    } finally {
      setLoading(false);
    }
  };

  const changeMode = (nextMode: "email" | "shared") => {
    setMode(nextMode);
    setError("");
    setMessage("");
  };

  const changeEmail = () => {
    setEmailStep("request");
    setOtp("");
    setMessage("");
    setError("");
  };

  return (
    <main className="login-page">
      <section className="login-story" aria-label="O aplikaci">
        <div className="login-story__content">
          <div className="login-brand">
            <BrandMark className="brand-mark--light" />
            <div>
              <strong>Národopisný soubor Postřekov</strong>
              <span>Docházka a taneční páry</span>
            </div>
          </div>

          <div className="login-story__headline">
            <span className="eyebrow eyebrow--light">Co je nového v souboru</span>
            <h1>Akce, účast i taneční páry pěkně pohromadě.</h1>
            <p>
              Mrkněte, co se chystá a kdo kde bude. Aplikace pomůže poskládat
              páry na jednotlivé akce a za každou účast přihodí body. Kdo jich
              má na konci nejvíc, odnese si odměnu ;)
            </p>
          </div>

          <ul className="login-benefits">
            <li>
              <CalendarCheck aria-hidden="true" />
              <span>
                <strong>Všechny akce po ruce</strong>
                Zkoušky, vystoupení i přehled, kdo dorazí.
              </span>
            </li>
            <li>
              <Sparkles aria-hidden="true" />
              <span>
                <strong>Páry bez věčného opakování</strong>
                Pomůže tanečníky střídat férově a s rozumem.
              </span>
            </li>
            <li>
              <Trophy aria-hidden="true" />
              <span>
                <strong>Body za každou účast</strong>
                Chodíte, sbíráte body a hrajete o odměnu ;)
              </span>
            </li>
          </ul>
        </div>
        <div className="folk-border" aria-hidden="true" />
      </section>

      <section className="login-panel">
        <div className="mobile-login-hero" aria-hidden="true">
          <span>Akce, účast a páry</span>
          <strong>Národopisný soubor Postřekov</strong>
        </div>
        <div className="login-card">
          <div className="login-card__heading">
            <BrandMark className="mobile-login-logo" />
            <span className="eyebrow">Tak jdeme na to</span>
            <h2>Přihlášení do aplikace</h2>
            <p>Přihlaste se e-mailem nebo společným kódem souboru.</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Způsob přihlášení">
            <button
              aria-selected={mode === "email"}
              className={mode === "email" ? "is-active" : ""}
              onClick={() => changeMode("email")}
              role="tab"
              type="button"
            >
              <Mail aria-hidden="true" />
              E-mail
            </button>
            <button
              aria-selected={mode === "shared"}
              className={mode === "shared" ? "is-active" : ""}
              onClick={() => changeMode("shared")}
              role="tab"
              type="button"
            >
              <KeyRound aria-hidden="true" />
              Kód souboru
            </button>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {message ? (
              <div className="form-message form-message--success" role="status">
                <CheckCircle2 aria-hidden="true" />
                {message}
              </div>
            ) : null}
            {mode === "email" && emailStep === "request" ? (
              <>
                <Field
                  error={error}
                  hint="Pro členy, kteří mají u svého profilu evidovaný e-mail."
                  htmlFor="login-email"
                  label="E-mailová adresa"
                >
                  <div className="input-with-icon">
                    <Mail aria-hidden="true" />
                    <input
                      autoComplete="email"
                      id="login-email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="vedouci@postrekovo.cz"
                      type="email"
                      value={email}
                    />
                  </div>
                </Field>
                <Button loading={loading} size="large" type="submit">
                  Poslat odkaz a kód
                  <ArrowRight aria-hidden="true" />
                </Button>
                <p className="auth-help">
                  Zpráva obsahuje magic link i šestimístný kód. Můžete použít
                  jednodušší variantu.
                </p>
              </>
            ) : mode === "email" ? (
              <div className="email-login-step">
                <div className="email-login-step__address">
                  <span>Kód jsme poslali na</span>
                  <strong>{sentEmail}</strong>
                </div>
                <Field
                  error={error}
                  hint="Kód má šest číslic a omezenou platnost."
                  htmlFor="login-otp"
                  label="Kód z e-mailu"
                >
                  <div className="input-with-icon otp-input">
                    <KeyRound aria-hidden="true" />
                    <input
                      autoComplete="one-time-code"
                      autoFocus
                      id="login-otp"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) =>
                        setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      pattern="[0-9]{6}"
                      placeholder="000000"
                      type="text"
                      value={otp}
                    />
                  </div>
                </Field>
                <Button loading={loading} size="large" type="submit">
                  Ověřit a přihlásit
                  <ArrowRight aria-hidden="true" />
                </Button>
                <p className="auth-help">
                  Můžete také otevřít tlačítko v e-mailu. Když se odkaz otevře
                  v okně pošty, vraťte se sem a opište kód.
                </p>
                <div className="email-login-actions">
                  <Button
                    disabled={loading || resendRemaining > 0}
                    onClick={() => void requestLoginEmail(sentEmail, true)}
                    size="small"
                    type="button"
                    variant="secondary"
                  >
                    <RefreshCw aria-hidden="true" />
                    {resendRemaining > 0
                      ? `Poslat znovu za ${resendRemaining} s`
                      : "Poslat nový kód"}
                  </Button>
                  <button
                    className="email-change-button"
                    onClick={changeEmail}
                    type="button"
                  >
                    <ArrowLeft aria-hidden="true" />
                    Změnit e-mail
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Field
                  error={error}
                  hint="Kód vám sdělí vedoucí souboru."
                  htmlFor="login-code"
                  label="Společný přístupový kód"
                >
                  <div className="input-with-icon">
                    <KeyRound aria-hidden="true" />
                    <input
                      autoComplete="off"
                      id="login-code"
                      onChange={(event) => setSharedCode(event.target.value)}
                      placeholder="••••••••"
                      type="password"
                      value={sharedCode}
                    />
                  </div>
                </Field>
                <Button loading={loading} size="large" type="submit">
                  Otevřít členský přehled
                  <ArrowRight aria-hidden="true" />
                </Button>
                <p className="auth-help">
                  Členský přístup umožňuje prohlížet termíny a zveřejněné páry.
                </p>
              </>
            )}
          </form>
        </div>
        <p className="login-footer">
          © 2026 Národopisný soubor Postřekov · Interní aplikace
        </p>
      </section>
    </main>
  );
}
