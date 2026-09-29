import { Info } from "lucide-react";
import { useId, useState, useRef, useEffect, type ReactNode } from "react";
export function Help({
  title = "Jak to funguje",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <details className="context-help">
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}
export function ScoringHelp() {
  return (
    <Help title="Jak se počítají body">
      <p>
        Body vznikají ze skutečné účasti na uzavřených akcích. Plná účast získá
        váhu akce, částečná váha × procento / 100. Například 75 % z akce za 2
        body znamená 1,5 bodu. Odpověď „Přijdu“ sama body nepřiděluje.
      </p>
      <p>
        Každá akce patří do jedné sezóny. Koledy mají samostatné body. Nová
        sezóna začíná od nuly, historie zůstává. Filtr období mění pouze
        zobrazený součet.
      </p>
    </Help>
  );
}

export function InfoHelp({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId(),
    ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [hover, setHover] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div
      ref={ref}
      className="info-help"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          setHover(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open || hover ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Info aria-hidden="true" />
      </button>
      {(open || hover) && (
        <div id={id} role="tooltip" className="info-help__content">
          {children}
        </div>
      )}
    </div>
  );
}
export function PointsTag({ points }: { points: number }) {
  const form = new Intl.PluralRules("cs").select(points);
  const label = `${points.toLocaleString("cs-CZ")} ${form === "one" ? "bod" : form === "few" ? "body" : form === "many" ? "bodu" : "bodů"}`;
  return (
    <div className="points-tag">
      <span className="badge badge--amber">{label}</span>
      <InfoHelp label="Jak se počítají body">
        <p>
          Body se připisují za skutečnou účast na uzavřené akci. Plná účast
          získá {label}, částečná účast tuto hodnotu krátí procentem. Například
          50 % znamená polovinu bodů. Samotná odpověď body nepřiděluje.
        </p>
        <p>Body patří do sezóny akce; koledy se hodnotí samostatně.</p>
      </InfoHelp>
    </div>
  );
}
