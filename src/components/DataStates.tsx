import { AlertTriangle, Inbox, LoaderCircle, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Ui";

export function LoadingState({
  label = "Načítám data…",
}: {
  label?: string;
}) {
  return (
    <div aria-live="polite" className="data-state">
      <LoaderCircle aria-hidden="true" className="spin" />
      <strong>{label}</strong>
      <span>Chvilku strpení.</span>
    </div>
  );
}

export function ErrorState({
  title = "Data se nepodařilo načíst",
  message = "Zkontrolujte připojení a zkuste to znovu.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="data-state data-state--error" role="alert">
      <AlertTriangle aria-hidden="true" />
      <strong>{title}</strong>
      <span>{message}</span>
      {onRetry ? (
        <Button onClick={onRetry} size="small" variant="secondary">
          <RefreshCcw aria-hidden="true" />
          Zkusit znovu
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="data-state data-state--empty">
      <Inbox aria-hidden="true" />
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  );
}

