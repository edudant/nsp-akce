import { useState } from "react";
import { Plus } from "lucide-react";
import { EventPairingEditor } from "../components/EventPairingEditor";
import { PairingRoster } from "../components/PairingRoster";
import { ListHeader } from "../components/CompactList";
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
  IconButton,
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
import {
  formatDate,
  formatAuditTime,
  formatSetDate,
} from "../components/formatters";
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
    "detail" | "participants" | "pairs" | "program" | "songs"
  >("detail");
  const [pairing, setPairing] = useState(false);
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
      ? pairSets.length > 0
      : event.pairs.length > 0 || event.pairsPublished);
  const hasProgram = !!(event.programItems?.length || event.program);
  const sections = [
    ...(event.attendanceScope === "all"
      ? [{ id: "participants", label: "Účastníci" }]
      : []),
    ...(hasPairs || (admin && dance) ? [{ id: "pairs", label: "Páry" }] : []),
    ...(admin || hasProgram ? [{ id: "program", label: "Pásma" }] : []),
    ...(admin || event.songSeries?.some((s) => s.confirmed)
      ? [{ id: "songs", label: "Písně" }]
      : []),
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
            description={`${formatDate(event.date)}${activeSection === "pairs" ? "" : ` · ${event.startTime}–${event.endTime}`} · ${event.location}`}
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
          {canPair && admin && (
            <div className="compact-list__header">
              <span />
              {pairing ? (
                <Button variant="secondary" onClick={() => setPairing(false)}>
                  Zpět na sady
                </Button>
              ) : (
                <IconButton
                  label="Přidat sadu párů"
                  onClick={() => setPairing(true)}
                >
                  <Plus aria-hidden="true" />
                </IconButton>
              )}
            </div>
          )}
          {pairing && admin ? (
            <EventPairingEditor
              db={db}
              event={event}
              admin
              onSaved={() => {
                setPairing(false);
                setPairSetId("");
              }}
            />
          ) : (
            <Card className="feature-card">
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
                          {set.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  {selectedPairSet ? (
                    <section>
                      <h3>{selectedPairSet.name}</h3>
                      {selectedPairSet.name !==
                        formatSetDate(selectedPairSet.createdAt) && (
                        <p>
                          <time dateTime={selectedPairSet.createdAt}>
                            {formatSetDate(selectedPairSet.createdAt)}
                          </time>
                        </p>
                      )}
                      <PairingRoster
                        db={db}
                        event={event}
                        pairs={selectedPairSet.pairs}
                        roster={selectedPairSet.roster}
                        admin={false}
                        disabled={false}
                        onChange={() => {}}
                      />
                    </section>
                  ) : (
                    <p>Zatím žádná sada.</p>
                  )}
                </>
              ) : (
                <>
                  {event.pairingName && <h3>{event.pairingName}</h3>}
                  {event.pairingCreatedAt &&
                    event.pairingName !==
                      formatSetDate(event.pairingCreatedAt) && (
                      <p>
                        <time dateTime={event.pairingCreatedAt}>
                          {formatSetDate(event.pairingCreatedAt)}
                        </time>
                      </p>
                    )}
                  <PairingRoster
                    db={db}
                    event={event}
                    pairs={event.pairs}
                    roster={event.pairingRoster}
                    admin={false}
                    disabled={false}
                    onChange={() => {}}
                  />
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
                      Po vystoupení upravte sestavu a skutečnou účast, poté
                      potvrďte, kdo skutečně tančil. Páry pod čarou se
                      nepotvrzují automaticky. Zkouškové sady se do historie
                      nezapočítávají.
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
          {admin ? (
            <EventProgramEditor
              key={JSON.stringify(event.programItems)}
              items={event.programItems ?? []}
              catalog={db.programCatalog ?? []}
              eventBlocks={[]}
              pairsPublished={event.pairsPublished}
              loading={program.isPending}
              error={program.error?.message}
              onSave={(items) => program.mutateAsync(items).then(() => {})}
            />
          ) : (
            <Card className="feature-card">
              <ListHeader title="Pásma" />
              <div className="compact-list">
                {event.programItems?.map((item) => (
                  <div
                    className="compact-row compact-row--readonly"
                    key={item.id}
                  >
                    {item.catalogId ? (
                      <AppLink to={`/pasma/${item.catalogId}`}>
                        {item.name}
                      </AppLink>
                    ) : (
                      item.name
                    )}
                  </div>
                ))}
              </div>
              {!event.programItems?.length && (
                <p>{event.program || "Zatím žádná pásma."}</p>
              )}
            </Card>
          )}
        </section>
      )}
      {activeSection === "songs" && (
        <section role="tabpanel" id="panel-songs" aria-labelledby="tab-songs">
          {(admin || !!event.songSeries?.some((s) => s.confirmed)) && (
            <SongSeriesPanel db={db} event={event} admin={admin} />
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
