import { ChevronRight, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Ui";

export function ListHeader({
  title,
  onAdd,
  addLabel,
}: {
  title: string;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <header className="compact-list__header">
      <h2>{title}</h2>
      {onAdd && (
        <Button size="small" onClick={onAdd}>
          <Plus aria-hidden="true" />
          {addLabel ?? "Přidat"}
        </Button>
      )}
    </header>
  );
}
export function ListRow({
  title,
  subtitle,
  meta,
  onOpen,
  children,
  disabled,
}: {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  onOpen: () => void;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="compact-row">
      <button
        className="compact-row__open"
        type="button"
        onClick={onOpen}
        disabled={disabled}
        aria-label={`Detail: ${title}`}
      >
        <span>
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
        {meta && <span className="compact-row__meta">{meta}</span>}
        <ChevronRight aria-hidden="true" />
      </button>
      {children && <div className="compact-row__quick">{children}</div>}
    </div>
  );
}
