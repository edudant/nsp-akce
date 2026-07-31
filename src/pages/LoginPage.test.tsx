import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

function renderLogin(
  overrides: Partial<React.ComponentProps<typeof LoginPage>> = {},
) {
  const props: React.ComponentProps<typeof LoginPage> = {
    onEmailLogin: vi.fn().mockResolvedValue(undefined),
    onEmailOtpLogin: vi.fn().mockResolvedValue(undefined),
    onSharedCodeLogin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<LoginPage {...props} />);
  return props;
}

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("moves from email request to six-digit verification", async () => {
    const props = renderLogin();

    fireEvent.change(screen.getByLabelText("E-mailová adresa"), {
      target: { value: " Clen@Example.cz " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Poslat odkaz a kód" }));

    await waitFor(() =>
      expect(props.onEmailLogin).toHaveBeenCalledWith("clen@example.cz"),
    );
    expect(screen.getByText("clen@example.cz")).toBeInTheDocument();
    expect(screen.getByText(/odkaz i šestimístný kód/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Kód z e-mailu"), {
      target: { value: "12a3456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ověřit a přihlásit" }));

    await waitFor(() =>
      expect(props.onEmailOtpLogin).toHaveBeenCalledWith(
        "clen@example.cz",
        "123456",
      ),
    );
  });

  it("keeps resend disabled for sixty seconds and then allows a new email", async () => {
    vi.useFakeTimers();
    const onEmailLogin = vi.fn().mockResolvedValue(undefined);
    renderLogin({ onEmailLogin });

    fireEvent.change(screen.getByLabelText("E-mailová adresa"), {
      target: { value: "clen@example.cz" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Poslat odkaz a kód" }),
      );
    });

    expect(
      screen.getByRole("button", { name: /Poslat znovu za 60 s/ }),
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const resend = screen.getByRole("button", { name: "Poslat nový kód" });
    expect(resend).toBeEnabled();
    await act(async () => {
      fireEvent.click(resend);
    });
    expect(onEmailLogin).toHaveBeenCalledTimes(2);
  });

  it("shows a recoverable message for an expired code", async () => {
    const onEmailOtpLogin = vi
      .fn()
      .mockRejectedValue({ code: "otp_expired", message: "Token expired" });
    renderLogin({ onEmailOtpLogin });

    fireEvent.change(screen.getByLabelText("E-mailová adresa"), {
      target: { value: "clen@example.cz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Poslat odkaz a kód" }));
    await screen.findByLabelText("Kód z e-mailu");
    fireEvent.change(screen.getByLabelText("Kód z e-mailu"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ověřit a přihlásit" }));

    expect(
      await screen.findByText(
        "Kód není platný nebo už vypršel. Pošlete si nový e-mail.",
      ),
    ).toBeInTheDocument();
  });

  it("preserves the shared-code login", async () => {
    const props = renderLogin();
    fireEvent.click(screen.getByRole("tab", { name: "Kód souboru" }));
    fireEvent.change(screen.getByLabelText("Společný přístupový kód"), {
      target: { value: " 03661997 " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Otevřít členský přehled" }),
    );

    await waitFor(() =>
      expect(props.onSharedCodeLogin).toHaveBeenCalledWith("03661997"),
    );
  });
});
