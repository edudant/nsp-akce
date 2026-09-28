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
  Select,
} from "../components/Ui";
import { Help, ScoringHelp } from "../components/Help";
import { AttendancePanel, ResponseEditor } from "../components/AttendancePanel";
import { EventForm } from "../components/EventForm";
import { EventProgramEditor } from "../components/EventProgramEditor";
import { SongSeriesPanel } from "../components/SongSeriesPanel";
import { AppLink } from "../components/Router";
import { compatibleMembers } from "../lib/ensembleRules";
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
  if (!event) return <p>Událost nebyla nalezena.</p>;
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
  const [wishes, setWishes] = useState(
    (db.partnerWishes ?? [])
      .filter((w) => w.eventId === event.id && w.memberId === db.myMemberId)
      .map((w) => w.partnerId),
  );
  const refresh = async () => {
    await query.invalidateQueries({ queryKey: databaseQueryKey });
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
      <AppLink to="/udalosti">← Události</AppLink>
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
              Upravit událost
            </Button>
            {event.status !== "cancelled" && (
              <Select
                aria-label="Stav události"
                disabled={status.isPending}
                value={event.status}
                onChange={(e) => status.mutate(e.target.value as EventStatus)}
              >
                <option value="draft">Návrh</option>
                <option value="open">Otevřená</option>
                {event.type === "performance" && (
                  <option value="confirmed">Potvrzená</option>
                )}
                <option value="closed">Uzavřená</option>
                <option value="cancelled">Zrušená</option>
              </Select>
            )}
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
      <Help title="Stavy události a odpovědi">
        <p>
          {event.type === "rehearsal"
            ? "Na zkoušku odpovídáte ano/ne, dokud ji admin neuzavře. Při uzavření po začátku se skutečná účast předvyplní podle odpovědí; admin ji může opravit."
            : "Na vystoupení odpovídáte ano/ne/zatím nevím s povinnou poznámkou. Po termínu pro vyjádření se událost automaticky potvrdí a odpovědi smí měnit jen admin. Před potvrzením vidíte vlastní odpověď, potom odpovědi ostatních."}
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
      {member && myRecord && !admin && (
        <Card className="feature-card">
          <h2>Moje odpověď</h2>
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
                  zařazení. Přání je doporučení pro generátor; jeho splnění může
                  bránit zákaz dvojice, jiná přání nebo nedostatek partnerů.
                  Vyšší body mohou zvýšit váhu vašeho přání.
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
      {event.attendanceScope === "all" ? (
        <AttendancePanel db={db} event={event} admin={admin} />
      ) : (
        <p>Seznam odpovědí ostatních bude dostupný po potvrzení události.</p>
      )}
      <Card className="feature-card">
        <h2>Body za účast</h2>
        <p>Plná účast: {event.weight} bodů.</p>
        <ScoringHelp />
      </Card>
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
                  Zveřejněný návrh ještě není skutečná historie. Po vystoupení
                  upravte sestavu a skutečnou účast, poté potvrďte, kdo skutečně
                  tančil. Páry pod čarou se nepotvrzují automaticky. Zkouškové
                  sady se do historie nikdy nezapočítávají.
                </p>
              </Help>
            </>
          )}
        </Card>
      )}
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
      {event.singing && <SongSeriesPanel db={db} event={event} admin={admin} />}
      {event.note && (
        <Card className="feature-card">
          <h2>Poznámka</h2>
          <p>{event.note}</p>
        </Card>
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
          title="Upravit událost"
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
