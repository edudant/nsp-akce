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
import { AuditDisclosure } from "../components/EventAudit";
import { EventStateActions } from "../components/EventStateActions";
import { Help, InfoHelp, PointsTag } from "../components/Help";
import { AttendancePanel, ResponseEditor } from "../components/AttendancePanel";
import { EventForm } from "../components/EventForm";
import { EventProgramEditor } from "../components/EventProgramEditor";
import { SongSeriesPanel } from "../components/SongSeriesPanel";
import { AppLink } from "../components/Router";
import { compatibleMembers } from "../lib/ensembleRules";
import { formatDate, formatAuditTime } from "../components/formatters";
import { ResponseBadge } from "../components/Participation";
import { canRespondToEvent, eventHasStarted } from "../lib/memberPortal";
import { todayInPrague } from "../components/formatters";
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
  onPersonalLogin,
}: {
  eventId: string;
  canEdit: boolean;
  canAdmin: boolean;
  canPair: boolean;
  onPersonalLogin?: () => void;
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
      onPersonalLogin={onPersonalLogin}
    />
  );
}
function EventContent({
  db,
  event,
  admin,
  canPair,
  onPersonalLogin,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  admin: boolean;
  canPair: boolean;
  onPersonalLogin?: () => void;
}) {
  const query = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState<
    "detail" | "participants" | "pairs" | "program"
  >("detail");
  const [pairSetId, setPairSetId] = useState("");
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
  const myRecord = db.myMemberId
    ? (event.attendance.find((r) => r.memberId === db.myMemberId) ?? {
        memberId: db.myMemberId,
        interest: "unset" as const,
        status: "unknown" as const,
        selected: false,
      })
    : undefined;
  const canRespond = canRespondToEvent(event, todayInPrague());
  const started = eventHasStarted(event);
  const dance = event.seasonKind !== "carols";
  const pairSets = [...(event.pairSets ?? [])]
    .filter((s) => admin || s.published)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedPairSet =
    pairSets.find((s) => s.id === pairSetId) ?? pairSets[0];
  const hasPairs =
    dance &&
    (event.type === "rehearsal"
      ? pairSets.some((s) => s.pairs.length)
      : event.pairs.length > 0);
  const hasProgram = !!(
    event.programItems?.length ||
    event.program ||
    event.songSeries?.some((s) => s.confirmed)
  );
  const sections = [
    ...(event.attendanceScope === "all"
      ? [{ id: "participants", label: "Účastníci" }]
      : []),
    ...(hasPairs || (admin && dance) ? [{ id: "pairs", label: "Páry" }] : []),
    ...(admin || hasProgram ? [{ id: "program", label: "Pásma a písně" }] : []),
  ];
  const activeSection = sections.some((s) => s.id === section)
    ? section
    : sections[0]?.id;
  return (
    <div className="page">
      <AppLink
        className="button button--secondary button--medium event-back"
        to="/udalosti"
      >
        ← Zpět na seznam akcí
      </AppLink>
      <Card className="event-hero">
        <div className={`event-date event-date--${event.type}`}>
          <strong>{formatDate(event.date, "d")}</strong>
          <small>{formatDate(event.date, "MMM")}</small>
          <em>{formatDate(event.date, "EEE")}</em>
        </div>
        <div className="event-hero__copy">
          <PageHeader
            title={event.title}
            description={`${formatDate(event.date)} · ${event.startTime}–${event.endTime} · ${event.location}`}
          />
          {event.note && <p className="event-hero__note">{event.note}</p>}
        </div>
      </Card>
      <div className="feature-toolbar">
        <EventTypeBadge type={event.type} />
        <div className="event-status-info">
          <EventStatusBadge status={event.status} />{" "}
          <InfoHelp label="Stavy akce a odpovědi">
            <p>
              {event.type === "rehearsal"
                ? "Na zkoušku odpovídáte ano/ne/zatím nevím s povinnou poznámkou, dokud ji admin neuzavře. Při uzavření po začátku se skutečná účast předvyplní podle odpovědí; admin ji může opravit."
                : "Na vystoupení odpovídáte ano/ne/zatím nevím s povinnou poznámkou. Po termínu pro vyjádření se akce automaticky potvrdí a odpovědi smí měnit jen admin. Před potvrzením vidíte vlastní odpověď, potom odpovědi ostatních."}
            </p>
          </InfoHelp>
        </div>
        <span>{db.seasons?.find((s) => s.id === event.seasonId)?.name}</span>
        <PointsTag points={event.weight} />

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
      {
        <section className="event-overview" aria-label="Detail a moje účast">
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
          {myRecord && (
            <Card className="feature-card my-attendance-card">
              <h2>Moje účast</h2>
              <ResponseBadge response={myRecord.interest} />
              {(myRecord.adminResponse?.at || myRecord.memberResponse?.at) && (
                <p className="response-timestamp">
                  Poslední odpověď:{" "}
                  {formatAuditTime(
                    [myRecord.adminResponse?.at, myRecord.memberResponse?.at]
                      .filter((v): v is string => !!v)
                      .sort()
                      .at(-1)!,
                  )}
                  {myRecord.adminResponse &&
                  (!myRecord.memberResponse ||
                    myRecord.adminResponse.at > myRecord.memberResponse.at)
                    ? " · zadal správce"
                    : " · vaše odpověď"}
                </p>
              )}
              {started && (
                <p>
                  Skutečná účast: {attendanceLabels[myRecord.status]}
                  {myRecord.status === "partial" &&
                    ` ${myRecord.attendancePercent} %`}
                  {event.status === "closed" &&
                    ` · ${myRecord.earnedPoints ?? 0} bodů`}
                </p>
              )}
              {myRecord.memberResponse &&
                myRecord.memberResponse.interest !== myRecord.interest && (
                  <p>
                    Vaše poslední odpověď:{" "}
                    {interestLabels[myRecord.memberResponse.interest]}
                  </p>
                )}
              {
                <>
                  {" "}
                  <h3>Moje odpověď</h3>
                  <ResponseEditor
                    key={`${myRecord.interest}:${myRecord.note}`}
                    event={event}
                    record={myRecord}
                    pending={response.isPending}
                    onSave={(interest, note) =>
                      response.mutate({ interest, note })
                    }
                  />
                </>
              }
              {myRecord.note && !canRespond && <p>{myRecord.note}</p>}
              {!canRespond && <p>Odpovědi jsou uzamčené. Změnu zadá admin.</p>}
              {member && event.type === "performance" && dance && (
                <>
                  <details className="partner-wishes">
                    <summary>Vybrat přání partnerů</summary>
                    <InfoHelp label="Pravidla přání partnerů">
                      <p>
                        Vyberte kompatibilní partnery: opačnou roli a společné
                        zařazení. Přání je doporučení pro generátor; jeho
                        splnění může bránit zákaz dvojice, jiná přání nebo
                        nedostatek partnerů. Vyšší body mohou zvýšit váhu vašeho
                        přání.
                      </p>
                    </InfoHelp>
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
                              disabled={!canRespond}
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
                      disabled={!canRespond}
                      loading={saveWishes.isPending}
                      onClick={() => saveWishes.mutate()}
                    >
                      Uložit přání
                    </Button>
                  </details>
                </>
              )}
            </Card>
          )}
          {!myRecord && (
            <Card className="feature-card personal-login-card">
              <h2>Moje účast</h2>
              {db.accessMode === "shared" ? (
                <>
                  <p>
                    Společný kód slouží k prohlížení. Pro zobrazení a změnu
                    vlastní odpovědi se přihlaste svým e-mailem.
                  </p>
                  {onPersonalLogin && (
                    <Button onClick={onPersonalLogin}>
                      Přihlásit se osobně
                    </Button>
                  )}
                </>
              ) : (
                <p>
                  Váš účet není propojený s členem. Správce ho může propojit v
                  Nastavení → Přístupy; potom zde uvidíte svou odpověď.
                </p>
              )}
            </Card>
          )}
          {(admin || db.myMemberId) && (
            <AuditDisclosure
              eventId={event.id}
              title={admin ? "Audit akce" : "Moje historie změn"}
            />
          )}
        </section>
      }
      {sections.length > 0 && (
        <div
          className="event-detail-tabs"
          role="tablist"
          aria-label="Sekce akce"
        >
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-controls={`panel-${item.id}`}
              aria-selected={activeSection === item.id}
              onClick={() => setSection(item.id as typeof section)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {activeSection === "participants" && (
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
      {activeSection === "pairs" && dance && (
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
                  {pairSets.length > 1 && (
                    <Select
                      aria-label="Uložená sada párů"
                      value={selectedPairSet?.id ?? ""}
                      onChange={(e) => setPairSetId(e.target.value)}
                    >
                      {pairSets.map((set, index) => (
                        <option key={set.id} value={set.id}>
                          {index === 0 ? "Poslední · " : ""}
                          {set.name} · {formatAuditTime(set.createdAt)}
                        </option>
                      ))}
                    </Select>
                  )}
                  {selectedPairSet && (
                    <section>
                      <h3>
                        {selectedPairSet.name} ·{" "}
                        {formatAuditTime(selectedPairSet.createdAt)}
                      </h3>
                      <PairsList pairs={selectedPairSet.pairs} db={db} />
                    </section>
                  )}
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
      {activeSection === "program" && (
        <section
          role="tabpanel"
          id="panel-program"
          aria-labelledby="tab-program"
        >
          {(admin || !!event.programItems?.length || !!event.program) && (
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
          {event.singing &&
            (admin || !!event.songSeries?.some((s) => s.confirmed)) && (
              <SongSeriesPanel db={db} event={event} admin={admin} />
            )}
          {admin && !event.singing && (
            <Button
              variant="secondary"
              loading={saveEvent.isPending}
              onClick={() => saveEvent.mutate({ singing: true })}
            >
              Zapnout zpívání a série písní
            </Button>
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
