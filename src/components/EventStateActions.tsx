import { useState } from "react";
import type { EnsembleEvent, EventStatus } from "../lib/domain";
import { Button, Dialog } from "./Ui";

const descriptions: Record<EventStatus, string> = {
  draft: "Návrh je viditelný pouze správci.",
  open: "Akce se zpřístupní členům a mohou zadat svou účast. U vystoupení platí termín pro vyjádření; po jeho uplynutí se odpovědi znovu neotevřou.",
  confirmed:
    "Odpovědi se uzamknou pro členy a účast na vystoupení se zpřístupní ostatním. Správce může odpovědi dál upravovat. Potvrzení ještě nezapisuje skutečnou účast ani body.",
  closed:
    "Nezapsaná skutečná účast se převezme z odpovědí Ano/Ne. Ručně zadaná účast se zachová. Zatím nevím a chybějící odpověď zůstanou nezapsané. Body se započítají podle skutečné účasti a procent; správce může vše dál opravovat. Akci lze uzavřít až po začátku.",
  cancelled:
    "Akce se zruší a body za ni se nezapočítají. Odpovědi, účast i audit zůstanou zachované.",
};
const titles: Record<EventStatus, string> = {
  draft: "Vrátit do návrhu",
  open: "Otevřít akci",
  confirmed: "Potvrdit akci",
  closed: "Uzavřít akci",
  cancelled: "Zrušit akci",
};
export function EventStateActions({
  event,
  pending,
  onChange,
}: {
  event: EnsembleEvent;
  pending: boolean;
  onChange: (status: EventStatus) => void;
}) {
  const [target, setTarget] = useState<EventStatus | null>(null);
  const next: EventStatus =
    event.status === "draft"
      ? "open"
      : event.status === "open" && event.type === "performance"
        ? "confirmed"
        : event.status === "open" || event.status === "confirmed"
          ? "closed"
          : "open";
  return (
    <>
      <Button
        disabled={pending || (next === "closed" && event.canClose === false)}
        onClick={() => setTarget(next)}
      >
        {event.status === "closed" || event.status === "cancelled"
          ? "Znovu otevřít akci"
          : titles[next]}
      </Button>
      {event.status !== "cancelled" && (
        <Button
          size="small"
          variant="ghost"
          disabled={pending}
          onClick={() => setTarget("cancelled")}
        >
          Zrušit akci
        </Button>
      )}
      {next === "closed" && event.canClose === false && (
        <small>Uzavření je dostupné po začátku akce.</small>
      )}
      <Dialog
        open={target !== null}
        title={target ? titles[target] : "Změna stavu"}
        onClose={() => setTarget(null)}
      >
        <p>{target && descriptions[target]}</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setTarget(null)}>
            Zpět
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              if (target) onChange(target);
              setTarget(null);
            }}
          >
            {target && titles[target]}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
