import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { Button, Field } from "../components/Ui";

export function LoginPage({
  onEmailLogin,
  onSharedCodeLogin,
  onDemoLogin,
}: {
  onEmailLogin: (email: string) => Promise<void>;
  onSharedCodeLogin: (code: string) => Promise<void>;
  onDemoLogin?: () => void;
}) {
  const [mode, setMode] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (mode === "email" && !email.includes("@")) {
      setError("Zadejte platnou e-mailovou adresu.");
      return;
    }
    if (mode === "code" && code.trim().length < 4) {
      setError("Přístupový kód má alespoň 4 znaky.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "email") {
        await onEmailLogin(email.trim());
        setMessage(
          "Přihlašovací odkaz jsme poslali do e-mailu. Můžete zavřít tuto stránku a otevřít odkaz.",
        );
      } else {
        await onSharedCodeLogin(code.trim());
      }
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
            <span className="eyebrow eyebrow--light">Tradice, která nás spojuje</span>
            <h1>Mějte zkoušky, body i páry na jednom místě.</h1>
            <p>
              Jednoduchý přehled pro vedení souboru i členy. Dostupný z mobilu
              přímo během zkoušky.
            </p>
          </div>

          <ul className="login-benefits">
            <li>
              <CalendarCheck aria-hidden="true" />
              <span>
                <strong>Docházka během chvilky</strong>
                Jedno klepnutí pro každého člena.
              </span>
            </li>
            <li>
              <Sparkles aria-hidden="true" />
              <span>
                <strong>Spravedlivé střídání párů</strong>
                Návrh zohlední zkušenost i historii.
              </span>
            </li>
            <li>
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong>Citlivé údaje zůstávají uvnitř</strong>
                Každý vidí jen to, co potřebuje.
              </span>
            </li>
          </ul>
        </div>
        <div className="folk-border" aria-hidden="true" />
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-card__heading">
            <BrandMark className="mobile-login-logo" />
            <span className="eyebrow">Vítejte zpět</span>
            <h2>Přihlášení do aplikace</h2>
            <p>Zvolte způsob přístupu podle své role.</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Způsob přihlášení">
            <button
              aria-selected={mode === "email"}
              className={mode === "email" ? "is-active" : ""}
              onClick={() => {
                setMode("email");
                setError("");
              }}
              role="tab"
              type="button"
            >
              <Mail aria-hidden="true" />
              E-mail
            </button>
            <button
              aria-selected={mode === "code"}
              className={mode === "code" ? "is-active" : ""}
              onClick={() => {
                setMode("code");
                setError("");
              }}
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
            {mode === "email" ? (
              <>
                <Field
                  error={error}
                  hint="Pro správce a zapisovatele."
                  htmlFor="login-email"
                  label="E-mailová adresa"
                >
                  <div className="input-with-icon">
                    <Mail aria-hidden="true" />
                    <input
                      autoComplete="email"
                      autoFocus
                      id="login-email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="vedouci@postrekovo.cz"
                      type="email"
                      value={email}
                    />
                  </div>
                </Field>
                <Button loading={loading} size="large" type="submit">
                  Poslat přihlašovací odkaz
                  <ArrowRight aria-hidden="true" />
                </Button>
                <p className="auth-help">
                  Odkaz přijde do e-mailu a má omezenou platnost.
                </p>
              </>
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
                      autoComplete="one-time-code"
                      autoFocus
                      id="login-code"
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="••••••••"
                      type="password"
                      value={code}
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

          {onDemoLogin ? (
            <div className="demo-access">
              <span>
                <CheckCircle2 aria-hidden="true" />
                Lokální ukázkový režim
              </span>
              <Button
                onClick={onDemoLogin}
                size="small"
                variant="secondary"
              >
                Vstoupit do ukázky
              </Button>
            </div>
          ) : null}
        </div>
        <p className="login-footer">
          © 2026 Národopisný soubor Postřekov · Interní aplikace
        </p>
      </section>
    </main>
  );
}
