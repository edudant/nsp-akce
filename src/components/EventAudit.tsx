import { formatAuditTime } from "./formatters";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import { useViewMode } from "./DataContext";
import type { EventAuditEntry } from "../lib/domain";
import { Help } from "./Help";

const labels: Record<string, string> = {
  yes: "Ano",
  no: "Ne",
  maybe: "Zatím nevím",
  unanswered: "Bez odpovědi",
  full: "Přítomen",
  partial: "Částečně",
  absent: "Nepřítomen",
  excused: "Omluven",
  unrecorded: "Nezapsáno",
  selected: "Ve výběru",
  invited: "Mimo výběr",
  draft: "Návrh",
  open: "Otevřená",
  confirmed: "Potvrzená",
  closed: "Uzavřená",
  cancelled: "Zrušená",
};
function values(entry: EventAuditEntry, value: EventAuditEntry["after"]) {
  if (!value) return "—";
  if (entry.kind === "response")
    return `${labels[String(value.response)] ?? value.response}${value.note ? ` · ${value.note}` : ""}`;
  if (entry.kind === "attendance")
    return `${labels[String(value.status)] ?? value.status}${value.status === "partial" ? ` ${value.attendance_percent} %` : ""}`;
  if (entry.kind === "selection")
    return `${labels[String(value.status)] ?? value.status}${value.standing ? " · má stát" : ""}${value.actual_standing ? " · skutečně stál" : ""}`;
  return labels[String(value.status)] ?? String(value.status);
}
export function EventAudit({
  eventId,
  memberId,
}: {
  eventId: string;
  memberId?: string;
}) {
  const { memberPreview, scope } = useViewMode();
  const audit = useQuery({
    queryKey: ["event-audit", scope, memberPreview, eventId, memberId],
    queryFn: () => appApi.getEventAudit(eventId, memberId, memberPreview),
  });
  return (
    <section className="event-audit">
      <h3>Historie změn</h3>
      <Help title="Co obsahuje audit">
        <p>
          Odpověď člena se v historii zachová i po opravě správce. Záznam
          obsahuje čas, autora a hodnoty před změnou a po ní. Automatické
          převzetí při uzavření je označené zvlášť. U starších záznamů nebyla
          role autora ukládána; je označena jako dřívější změna.
        </p>
      </Help>
      {audit.isPending && <p role="status">Načítám audit…</p>}
      {audit.error && <p role="alert">{audit.error.message}</p>}
      {audit.data?.length === 0 && <p>Zatím žádné změny.</p>}
      <ol className="audit-list">
        {audit.data?.map((entry) => (
          <li key={entry.id}>
            <header>
              <strong>
                {entry.actorKind === "admin"
                  ? "Správce"
                  : entry.actorKind === "member"
                    ? "Člen"
                    : entry.actorKind === "system"
                      ? "Systém"
                      : "Dřívější změna"}
                {entry.actorKind !== "legacy" && ` · ${entry.actorName}`}
              </strong>
              <time dateTime={entry.at}>{formatAuditTime(entry.at)}</time>
            </header>
            <span>
              {entry.kind === "response"
                ? "Odpověď"
                : entry.kind === "attendance"
                  ? "Skutečná účast"
                  : entry.kind === "status"
                    ? "Stav akce"
                    : "Výběr účastníka"}
              {entry.source === "closure" && " · převzato při uzavření"}
            </span>
            <p>
              {values(entry, entry.before)} →{" "}
              <strong>{values(entry, entry.after)}</strong>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AuditDisclosure({
  eventId,
  memberId,
  title = "Audit akce",
}: {
  eventId: string;
  memberId?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="audit-disclosure"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{title}</summary>
      {open && <EventAudit eventId={eventId} memberId={memberId} />}
    </details>
  );
}
