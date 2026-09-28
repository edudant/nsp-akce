import { useMutation } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import { Button } from "./Ui";
import { Help } from "./Help";
export function MemberLoginCode({
  memberId,
  disabled,
}: {
  memberId: string;
  disabled?: boolean;
}) {
  const generate = useMutation({
    mutationFn: () => appApi.generateMemberLoginCode(memberId),
  });
  return (
    <section className="feature-card">
      <Help title="Pomoc s přihlášením">
        <p>
          Vygenerujte jednorázový kód pro evidovaný e-mail a předejte ho
          členovi. Člen nemusí otevřít schránku. Pro přihlášení za člena
          použijte jiný prohlížeč nebo anonymní okno, abyste zachovali svou
          admin session. Kód má platnost 15 minut a jde použít pouze jednou;
          nový kód zneplatní předchozí.
        </p>
      </Help>
      <Button
        disabled={disabled}
        loading={generate.isPending}
        onClick={() => generate.mutate()}
        variant="secondary"
      >
        Vygenerovat přihlašovací kód
      </Button>
      {generate.data && (
        <p role="status">
          {generate.data.email}:{" "}
          <strong className="login-code">{generate.data.code}</strong>
        </p>
      )}
      {generate.error && (
        <p role="alert" className="form-error">
          {generate.error.message}
        </p>
      )}
    </section>
  );
}
