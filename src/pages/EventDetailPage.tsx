import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import { useDatabase, databaseQueryKey } from "../components/DataContext";
import { ErrorState, LoadingState } from "../components/DataStates";
import { PageHeader } from "../components/PageHeader";
import {
  Button,
  Card,
  Dialog,
  EventStatusBadge,
  EventTypeBadge,
} from "../components/Ui";
import { AuditDisclosure } from "../components/EventAudit";
import { EventStateActions } from "../components/EventStateActions";
import { Help, ScoringHelp } from "../components/Help";
import { AttendancePanel, ResponseEditor } from "../components/AttendancePanel";
import { EventForm } from "../components/EventForm";
import { EventProgramEditor } from "../components/EventProgramEditor";
import { SongSeriesPanel } from "../components/SongSeriesPanel";
import { AppLink } from "../components/Router";
import { compatibleMembers } from "../lib/ensembleRules";
import { attendanceLabels, interestLabels } from "../lib/domain";
import type {
  AppDatabase,
  EnsembleEvent,
  InterestStatus,
  EventStatus,
  EventProgramUpdateItem,
  DancePair,
} from "../lib/domain";
export function EventDetailPage({
  eventId,
  canAdmin,
  canPair,
}: {
  eventId: string;
  canEdit: boolean;
  canAdmin: boolean;
  canPair: boolean;
}) {
  const db = useDatabase();
  if (db.isLoading) return <LoadingState />;
  if (db.isError || !db.data)
    return <ErrorState onRetry={() => void db.refetch()} />;
  const event = db.data.events.find((e) => e.id === eventId);
  if (!event) return <p>Akce nebyla nalezena.</p>;
  return (
    <EventContent
      key={eventId}
      db={db.data}
      event={event}
      admin={canAdmin}
      canPair={canPair}
    />
  );
}
function EventContent({
  db,
  event,
  admin,
  canPair,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  admin: boolean;
  canPair: boolean;
}) {
  const query = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState<
    "detail" | "participants" | "pairs" | "program"
  >("detail");
  const [wishes, setWishes] = useState(
    (db.partnerWishes ?? [])
      .filter((w) => w.eventId === event.id && w.memberId === db.myMemberId)
      .map((w) => w.partnerId),
  );
  const refresh = async () => {
    await Promise.all([
      query.invalidateQueries({ queryKey: databaseQueryKey }),
      query.invalidateQueries({ queryKey: ["event-audit"] }),
      query.invalidateQueries({ queryKey: ["scores"] }),
    ]);
  };
  const status = useMutation({
    mutationFn: (value: EventStatus) =>
      appApi.updateEventStatus(event.id, value),
    onSuccess: refresh,
  });
  const response = useMutation({
    mutationFn: ({
      interest,
      note,
    }: {
      interest: InterestStatus;
      note: string;
    }) => appApi.updateMyResponse(event.id, interest, note),
    onSuccess: refresh,
  });
  const saveWishes = useMutation({
    mutationFn: () => appApi.setMyPartnerWishes(event.id, wishes),
    onSuccess: refresh,
  });
  const saveEvent = useMutation({
    mutationFn: (patch: Partial<EnsembleEvent>) =>
      appApi.updateEvent(event.id, patch),
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
  });
  const confirm = useMutation({
    mutationFn: () => appApi.confirmActualPairs(event.id),
    onSuccess: refresh,
  });
  const program = useMutation({
    mutationFn: (items: EventProgramUpdateItem[]) =>
      appApi.updateEventProgram(event.id, items),
    onSuccess: refresh,
  });
  const member = db.members.find((m) => m.id === db.myMemberId);
  const myRecord = event.attendance.find((r) => r.memberId === db.myMemberId);
  const dance = event.seasonKind !== "carols";
  return (
    <div className="page">
      <AppLink to="/udalosti">← Akce</AppLink>
      <PageHeader
        title={event.title}
        description={`${event.date} · ${event.startTime}–${event.endTime} · ${event.location}`}
      />
      <div className="feature-toolbar">
        <EventTypeBadge type={event.type} />
        <EventStatusBadge status={event.status} />
        <span>{db.seasons?.find((s) => s.id === event.seasonId)?.name}</span>
        {admin && (
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Upravit akci
            </Button>
            <EventStateActions
              event={event}
              pending={status.isPending}
              onChange={(value) => status.mutate(value)}
            />
          </>
        )}
        {canPair && dance && (
          <AppLink
            className="button button--secondary"
            to={`/pary?event=${event.id}`}
          >
            Generátor párů
          </AppLink>
        )}
      </div>
      <div className="event-sections" role="tablist" aria-label="Sekce akce">
        {(
          [
            { id: "detail", label: "Detail a moje účast" },
            { id: "participants", label: "Účastníci" },
            ...(dance ? [{ id: "pairs", label: "Páry" }] : []),
            { id: "program", label: "Pásma" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-controls={`panel-${item.id}`}
            aria-selected={section === item.id}
            onClick={() => setSection(item.id as typeof section)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {section === "detail" && (
        <section role="tabpanel" id="panel-detail" aria-labelledby="tab-detail">
          <Help title="Stavy akce a odpovědi">
            <p>
              {event.type === "rehearsal"
                ? "Na zkoušku odpovídáte ano/ne, dokud ji admin neuzavře. Při uzavření po začátku se skutečná účast předvyplní podle odpovědí; admin ji může opravit."
                : "Na vystoupení odpovídáte ano/ne/zatím nevím s povinnou poznámkou. Po termínu pro vyjádření se akce automaticky potvrdí a odpovědi smí měnit jen admin. Před potvrzením vidíte vlastní odpověď, potom odpovědi ostatních."}
            </p>
          </Help>
          {event.responseDeadline && (
            <p>
              Termín pro vyjádření:{" "}
              {new Intl.DateTimeFormat("cs-CZ", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Prague",
              }).format(new Date(event.responseDeadline))}
            </p>
          )}
          {member && myRecord && (
            <Card className="feature-card">
              <h2>Moje účast</h2>
              <p>
                Skutečná účast: {attendanceLabels[myRecord.status]}
                {myRecord.status === "partial" &&
                  ` ${myRecord.attendancePercent} %`}
                {event.status === "closed" &&
                  ` · ${myRecord.earnedPoints ?? 0} bodů`}
              </p>
              {myRecord.memberResponse && (
                <p>
                  Vaše poslední odpověď:{" "}
                  {interestLabels[myRecord.memberResponse.interest]}
                </p>
              )}
              <h3>Moje odpověď</h3>
              <ResponseEditor
                key={`${myRecord.interest}:${myRecord.note}`}
                event={event}
                record={myRecord}
                pending={response.isPending}
                onSave={(interest, note) => response.mutate({ interest, note })}
              />
              {!event.canRespond && (
                <p>Odpovědi jsou uzamčené. Změnu zadá admin.</p>
              )}
              {event.type === "performance" && dance && (
                <>
                  <Help title="Přání partnerů">
                    <p>
                      Vyberte kompatibilní partnery: opačnou roli a společné
                      zařazení. Přání je doporučení pro generátor; jeho splnění
                      může bránit zákaz dvojice, jiná přání nebo nedostatek
                      partnerů. Vyšší body mohou zvýšit váhu vašeho přání.
                    </p>
                  </Help>
                  <div className="standing-picker">
                    {db.members
                      .filter(
                        (m) =>
                          m.active &&
                          compatibleMembers(member, m) &&
                          (event.partnerOptions?.includes(m.id) ?? true),
                      )
                      .map((m) => (
                        <label key={m.id}>
                          <input
                            type="checkbox"
                            disabled={!event.canRespond}
                            checked={wishes.includes(m.id)}
                            onChange={(e) =>
                              setWishes(
                                e.target.checked
                                  ? [...wishes, m.id]
                                  : wishes.filter((id) => id !== m.id),
                              )
                            }
                          />
                          {m.fullName}
                        </label>
                      ))}
                  </div>
                  <Button
                    disabled={!event.canRespond}
                    loading={saveWishes.isPending}
                    onClick={() => saveWishes.mutate()}
                  >
                    Uložit přání
                  </Button>
                </>
              )}
            </Card>
          )}
          <Card className="feature-card">
            <h2>Body za účast</h2>
            <p>Plná účast: {event.weight} bodů.</p>
            <ScoringHelp />
          </Card>
          {event.note && (
            <Card className="feature-card">
              <h2>Poznámka</h2>
              <p>{event.note}</p>
            </Card>
          )}
          {(admin || db.myMemberId) && (
            <AuditDisclosure
              eventId={event.id}
              title={admin ? "Audit akce" : "Moje historie změn"}
            />
          )}
        </section>
      )}
      {section === "participants" && (
        <section
          role="tabpanel"
          id="panel-participants"
          aria-labelledby="tab-participants"
        >
          {event.attendanceScope === "all" ? (
            <AttendancePanel db={db} event={event} admin={admin} />
          ) : (
            <p>Seznam odpovědí ostatních bude dostupný po potvrzení akce.</p>
          )}
        </section>
      )}
      {section === "pairs" && dance && (
        <section role="tabpanel" id="panel-pairs" aria-labelledby="tab-pairs">
          {dance && (
            <Card className="feature-card">
              <h2>
                {event.type === "rehearsal"
                  ? "Uložené sady párů"
                  : "Páry pro vystoupení"}
              </h2>
              {event.type === "rehearsal" ? (
                <>
                  {event.pairSets?.map((set) => (
                    <section key={set.id}>
                      <h3>
                        {set.name} · {set.published ? "Zveřejněná" : "Návrh"}
                      </h3>
                      <PairsList pairs={set.pairs} db={db} />
                    </section>
                  ))}
                  {!event.pairSets?.length && <p>Zatím žádná sada.</p>}
                </>
              ) : (
                <>
                  <PairsList pairs={event.pairs} db={db} />
                  {admin &&
                    event.status === "closed" &&
                    event.pairsPublished &&
                    event.pairs.length > 0 && (
                      <Button
                        loading={confirm.isPending}
                        onClick={() => confirm.mutate()}
                      >
                        Potvrdit skutečné páry
                      </Button>
                    )}
                  <Help title="Skutečně odtančené páry">
                    <p>
                      Zveřejněný návrh ještě není skutečná historie. Po
                      vystoupení upravte sestavu a skutečnou účast, poté
                      potvrďte, kdo skutečně tančil. Páry pod čarou se
                      nepotvrzují automaticky. Zkouškové sady se do historie
                      nikdy nezapočítávají.
                    </p>
                  </Help>
                </>
              )}
            </Card>
          )}
        </section>
      )}
      {section === "program" && (
        <section
          role="tabpanel"
          id="panel-program"
          aria-labelledby="tab-program"
        >
          {event.type === "performance" && dance && (
            <Card className="feature-card">
              <h2>Program</h2>
              {admin ? (
                <EventProgramEditor
                  key={JSON.stringify(event.programItems)}
                  items={event.programItems ?? []}
                  catalog={db.programCatalog ?? []}
                  eventBlocks={[]}
                  pairsPublished={event.pairsPublished}
                  loading={program.isPending}
                  error={program.error?.message}
                  onSave={(items) => program.mutate(items)}
                />
              ) : (
                <p>
                  {event.programItems?.map((p) => p.name).join(", ") ||
                    event.program ||
                    "Neuveden"}
                </p>
              )}
            </Card>
          )}
          {event.singing && (
            <SongSeriesPanel db={db} event={event} admin={admin} />
          )}
          {!(event.type === "performance" && dance) && !event.singing && (
            <p>Na této akci není program ani zpívání.</p>
          )}
        </section>
      )}
      {(status.error ||
        response.error ||
        saveWishes.error ||
        confirm.error) && (
        <p role="alert" className="form-error">
          {status.error?.message ??
            response.error?.message ??
            saveWishes.error?.message ??
            confirm.error?.message}
        </p>
      )}
      {admin && (
        <Dialog
          open={editing}
          onClose={() => setEditing(false)}
          title="Upravit akci"
        >
          <EventForm
            event={event}
            loading={saveEvent.isPending}
            error={saveEvent.error?.message}
            onSave={(input) => saveEvent.mutate(input)}
          />
        </Dialog>
      )}
    </div>
  );
}
function PairsList({ pairs, db }: { pairs: DancePair[]; db: AppDatabase }) {
  return (
    <div className="feature-list">
      {pairs.map((pair) => (
        <div key={pair.id}>
          {db.members.find((m) => m.id === pair.leaderId)?.fullName} +{" "}
          {db.members.find((m) => m.id === pair.followerId)?.fullName} ·{" "}
          {pair.ageGroup === "young" ? "Mladý" : "Starý"}
          {pair.belowLine ? " · Pod čarou" : ""}
          {pair.actual ? " · Skutečně tančili" : ""}
        </div>
      ))}
      {pairs.length === 0 && <p>Páry zatím nejsou zveřejněné.</p>}
    </div>
  );
}
