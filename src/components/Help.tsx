import type { ReactNode } from "react";
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
        Body vznikají ze skutečné účasti na uzavřených akcích. Plná účast
        získá váhu akce, částečná váha × procento / 100. Například 75 % z
        akce za 2 body znamená 1,5 bodu. Odpověď „Přijdu“ sama body
        nepřiděluje.
      </p>
      <p>
        Každá akce patří do jedné sezóny. Koledy mají samostatné body. Nová
        sezóna začíná od nuly, historie zůstává. Filtr období mění pouze
        zobrazený součet.
      </p>
    </Help>
  );
}
