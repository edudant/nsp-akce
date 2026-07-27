import {
  AlertCircle,
  Check,
  ChevronDown,
  LoaderCircle,
  X,
} from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import {
  attendanceLabels,
  eventStatusLabels,
  eventTypeLabels,
  experienceLabels,
  type AttendanceStatus,
  type EventStatus,
  type EventType,
  type ExperienceLevel,
  type Member,
} from "../lib/demoData";

export function Button({
  variant = "primary",
  size = "medium",
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "medium" | "large";
  loading?: boolean;
}) {
  return (
    <button
      className={`button button--${variant} button--${size} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="spin" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className={`icon-button ${className}`}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

export function Avatar({
  member,
  size = "medium",
}: {
  member: Pick<Member, "fullName" | "role">;
  size?: "small" | "medium" | "large";
}) {
  const initials = member.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return (
    <span
      aria-hidden="true"
      className={`avatar avatar--${size} avatar--${member.role}`}
    >
      {initials}
    </span>
  );
}

type BadgeTone =
  | "neutral"
  | "green"
  | "red"
  | "amber"
  | "blue"
  | "purple";

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`badge badge--${tone} ${className}`}>{children}</span>
  );
}

export function EventTypeBadge({ type }: { type: EventType }) {
  return (
    <Badge tone={type === "performance" ? "red" : "green"}>
      {eventTypeLabels[type]}
    </Badge>
  );
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const tones: Record<EventStatus, BadgeTone> = {
    draft: "neutral",
    open: "blue",
    closed: "green",
    cancelled: "red",
  };
  return <Badge tone={tones[status]}>{eventStatusLabels[status]}</Badge>;
}

export function ExperienceBadge({ level }: { level: ExperienceLevel }) {
  const tones: Record<ExperienceLevel, BadgeTone> = {
    beginner: "amber",
    advanced: "blue",
    experienced: "green",
  };
  return <Badge tone={tones[level]}>{experienceLabels[level]}</Badge>;
}

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const tones: Record<AttendanceStatus, BadgeTone> = {
    present: "green",
    partial: "amber",
    absent: "red",
    excused: "blue",
    unknown: "neutral",
  };
  return <Badge tone={tones[status]}>{attendanceLabels[status]}</Badge>;
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? <span className="field__hint">{hint}</span> : null}
      {error ? (
        <span className="field__error">
          <AlertCircle aria-hidden="true" />
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Select({
  children,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`select-wrap ${className}`}>
      <select {...props}>{children}</select>
      <ChevronDown aria-hidden="true" />
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className={`toggle-row ${disabled ? "is-disabled" : ""}`} htmlFor={id}>
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="toggle">
        <input
          checked={checked}
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span aria-hidden="true" className="toggle__track">
          <span className="toggle__thumb">
            {checked ? <Check aria-hidden="true" /> : null}
          </span>
        </span>
      </span>
    </label>
  );
}

export function Dialog({
  open,
  title,
  description,
  children,
  onClose,
  size = "medium",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  size?: "small" | "medium" | "large";
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      aria-label="Zavřít dialog"
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="presentation"
    >
      <div
        aria-describedby={description ? "dialog-description" : undefined}
        aria-modal="true"
        className={`dialog dialog--${size}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="dialog__header">
          <div>
            <span className="eyebrow">Národopisný soubor Postřekov</span>
            <h2>{title}</h2>
            {description ? (
              <p id="dialog-description">{description}</p>
            ) : null}
          </div>
          <IconButton label="Zavřít" onClick={onClose}>
            <X aria-hidden="true" />
          </IconButton>
        </header>
        <div className="dialog__body">{children}</div>
      </div>
    </div>
  );
}

export function Card({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section className={`card ${className}`} {...props}>
      {children}
    </section>
  );
}

