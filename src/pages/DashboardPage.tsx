import {
  AlertCircle,
  ArrowRight,
  CalendarPlus,
  CalendarRange,
  CheckCircle2,
  Clock3,
  MapPin,
  Medal,
  Sparkles,
  UserCheck,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  attendanceLabels,
  calculateScores,
  eventTypeLabels,
  interestLabels,
  type AppDatabase,
  type EnsembleEvent,
  type InterestStatus,
} from "../lib/domain";
import {
  canRespondToEvent,
  recentAttendanceEntries,
} from "../lib/memberPortal";
import { appApi } from "../lib/dataApi";
import { databaseQueryKey, useDatabase } from "../components/DataContext";
import { ErrorState, LoadingState } from "../components/DataStates";
import {
  formatDate,
  formatPoints,
  formatWeekday,
  todayInPrague,
} from "../components/formatters";
import { AppLink } from "../components/Router";
import { Badge, Card, EventTypeBadge } from "../components/Ui";
import { PageHeader } from "../components/PageHeader";

export function DashboardPage({ canEdit }: { canEdit: boolean }) {
  const database = useDatabase();
  if (database.isLoading) return <LoadingState label="Chystám dnešní přehled…" />;
  if (database.isError || !database.data) {
    return <ErrorState onRetry={() => void database.refetch()} />;
  }

  if (database.data.accessMode === "member") {
    return <MemberDashboard database={database.data} />;
  }

  const today = todayInPrague();
  const upcoming = [...database.data.events]
    .filter((event) => event.date >= today && event.status !== "cancelled")
    .sort((first, second) => first.date.localeCompare(second.date));
  const nextEvent = upcoming[0];
  const scores = calculateScores(database.data);
  const averageScore =
    scores.reduce((total, score) => total + score.total, 0) /
    Math.max(1, scores.length);
  const activeMembers = database.data.members.filter((member) => member.active);
  const missingResponses = upcoming
    .filter((event) => event.type === "performance")
    .reduce(
      (count, event) =>
        count +
        event.attendance.filter((record) => record.interest === "unset").length,
      0,
    );
  const responseEvent = upcoming.find(
    (event) =>
      event.type === "performance" &&
      event.attendance.some((record) => record.interest === "unset"),
  );
  const pairingEvent = upcoming.find((event) => !event.pairsPublished);
  const leadCount = activeMembers.filter(
    (member) => member.role === "leader",
  ).length;
  const followCount = activeMembers.filter(
    (member) => member.role === "follower",
  ).length;

  return (
    <div className="page page--dashboard">
      <PageHeader
        actions={
          canEdit ? (
            <AppLink
              className="button button--primary button--medium"
              to="/udalosti"
            >
              <CalendarPlus aria-hidden="true" />
              Přidat událost
            </AppLink>
          ) : null
        }
        description={`${formatWeekday(today)} ${formatDate(today)} · akce, účast a páry`}
        eyebrow="Přehled souboru"
        title="Co se právě chystá"
      />

      <section
        className={
          canEdit ? "dashboard-grid" : "dashboard-grid dashboard-grid--member"
        }
      >
        {nextEvent ? (
          <Card className="next-event-card">
            <div className="next-event-card__topline">
              <span className="eyebrow">Nejbližší událost</span>
              <EventTypeBadge type={nextEvent.type} />
            </div>
            <div className="next-event-card__main">
              <div className="date-tile">
                <span>{formatWeekday(nextEvent.date).slice(0, 2)}</span>
                <strong>{formatDate(nextEvent.date, "d")}</strong>
                <small>{formatDate(nextEvent.date, "MMM")}</small>
              </div>
              <div className="next-event-card__content">
                <h2>{nextEvent.title}</h2>
                <div className="event-meta">
                  <span>
                    <Clock3 aria-hidden="true" />
                    {nextEvent.startTime}–{nextEvent.endTime}
                  </span>
                  <span>
                    <MapPin aria-hidden="true" />
                    {nextEvent.location}
                  </span>
                </div>
                {nextEvent.note ? <p>{nextEvent.note}</p> : null}
              </div>
            </div>
            <div className="next-event-card__footer">
              {nextEvent.attendanceScope !== "none" ? (
                <div className="response-summary">
                  <span className="avatar-stack" aria-hidden="true">
                    {activeMembers.slice(0, 4).map((member) => (
                      <span key={member.id}>
                        {member.fullName
                          .split(" ")
                          .map((part) => part[0])
                          .join("")}
                      </span>
                    ))}
                  </span>
                  <span>
                    <strong>
                      {
                        nextEvent.attendance.filter(
                          (record) => record.interest === "yes",
                        ).length
                      }{" "}
                      potvrzených
                    </strong>
                    <small>
                      {
                        nextEvent.attendance.filter(
                          (record) => record.interest === "unset",
                        ).length
                      }{" "}
                      bez odpovědi
                    </small>
                  </span>
                </div>
              ) : (
                <div className="response-summary response-summary--private">
                  <UsersRound aria-hidden="true" />
                  <span>
                    <strong>Účast řeší přihlášení členové</strong>
                    <small>
                      Ve společném přehledu se osobní odpovědi neukazují.
                    </small>
                  </span>
                </div>
              )}
              <AppLink
                className="button button--secondary button--medium"
                to={`/udalosti/${nextEvent.id}`}
              >
                Otevřít událost
                <ArrowRight aria-hidden="true" />
              </AppLink>
            </div>
          </Card>
        ) : (
          <Card className="next-event-card next-event-card--empty">
            <span className="next-event-empty__icon" aria-hidden="true">
              <CalendarRange />
            </span>
            <div className="next-event-empty__copy">
              <span className="eyebrow">Další společný termín</span>
              <h2>Zatím není naplánovaná další událost</h2>
              <p>
                Jakmile vedení přidá nový termín, objeví se na tomto místě.
              </p>
            </div>
            <AppLink
              className="button button--secondary button--medium"
              to="/udalosti"
            >
              Projít všechny události
              <ArrowRight aria-hidden="true" />
            </AppLink>
          </Card>
        )}

        {canEdit ? (
          <Card className="attention-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Vyžaduje pozornost</span>
                <h2>Na čem zapracovat</h2>
              </div>
              <Badge tone={missingResponses ? "red" : "green"}>
                {missingResponses || pairingEvent ? "K řešení" : "Hotovo"}
              </Badge>
            </div>
            <div className="attention-list">
              {responseEvent ? (
                <AppLink to={`/udalosti/${responseEvent.id}`}>
                  <span className="attention-icon attention-icon--red">
                    <AlertCircle aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Chybí odpovědi na vystoupení</strong>
                    <small>{missingResponses} členů zatím nepotvrdilo účast</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </AppLink>
              ) : null}
              {pairingEvent ? (
                <AppLink to={`/pary?event=${pairingEvent.id}`}>
                  <span className="attention-icon attention-icon--amber">
                    <UsersRound aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Připravit páry</strong>
                    <small>{pairingEvent.title} zatím nemá zveřejněný návrh</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </AppLink>
              ) : null}
              {!responseEvent && !pairingEvent ? (
                <AppLink to="/udalosti">
                  <span className="attention-icon attention-icon--green">
                    <CheckCircle2 aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Všechno je připravené</strong>
                    <small>Žádný otevřený úkol teď nečeká.</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </AppLink>
              ) : null}
            </div>
          </Card>
        ) : null}
      </section>

      <section className="stat-grid" aria-label="Souhrn sezony">
        <Card className="stat-card">
          <span className="stat-icon stat-icon--green">
            <UserCheck aria-hidden="true" />
          </span>
          <span>
            <small>Aktivních členů</small>
            <strong>{activeMembers.length}</strong>
            <em>{leadCount} tanečníků · {followCount} tanečnic</em>
          </span>
        </Card>
        <Card className="stat-card">
          <span className="stat-icon stat-icon--red">
            <CalendarRange aria-hidden="true" />
          </span>
          <span>
            <small>Událostí v sezoně</small>
            <strong>{database.data.events.length}</strong>
            <em>{upcoming.length} nás ještě čeká</em>
          </span>
        </Card>
        <Card className="stat-card">
          <span className="stat-icon stat-icon--amber">
            <Medal aria-hidden="true" />
          </span>
          <span>
            <small>Průměr bodů</small>
            <strong>{formatPoints(averageScore)}</strong>
            <em>z dosavadních zkoušek</em>
          </span>
        </Card>
      </section>

      <section className="content-grid">
        <Card className="upcoming-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Kalendář</span>
              <h2>Nadcházející události</h2>
            </div>
            <AppLink className="text-link" to="/udalosti">
              Zobrazit všechny <ArrowRight aria-hidden="true" />
            </AppLink>
          </div>
          <div className="upcoming-list">
            {upcoming.length ? upcoming.slice(0, 4).map((event) => (
              <AppLink key={event.id} to={`/udalosti/${event.id}`}>
                <span className={`mini-date mini-date--${event.type}`}>
                  <strong>{formatDate(event.date, "d")}</strong>
                  <small>{formatDate(event.date, "MMM")}</small>
                </span>
                <span className="upcoming-list__copy">
                  <strong>{event.title}</strong>
                  <small>
                    {event.startTime} · {event.location}
                  </small>
                </span>
                <EventTypeBadge type={event.type} />
                <ArrowRight aria-hidden="true" className="row-arrow" />
              </AppLink>
            )) : (
              <div className="upcoming-list__empty">
                <CalendarRange aria-hidden="true" />
                <span>
                  <strong>Kalendář je zatím volný</strong>
                  <small>Nové termíny se tu objeví automaticky.</small>
                </span>
              </div>
            )}
          </div>
        </Card>

        <Card className="quick-actions-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Rychlé volby</span>
              <h2>{canEdit ? "Co chcete udělat?" : "Kam se chcete podívat?"}</h2>
            </div>
          </div>
          <div className="quick-actions">
            <AppLink to={nextEvent ? `/udalosti/${nextEvent.id}` : "/udalosti"}>
              <span><UserCheck aria-hidden="true" /></span>
              {canEdit ? "Zapsat docházku" : "Zobrazit nejbližší událost"}
              <ArrowRight aria-hidden="true" />
            </AppLink>
            <AppLink to="/pary">
              <span><Sparkles aria-hidden="true" /></span>
              {canEdit ? "Vygenerovat páry" : "Zobrazit zveřejněné páry"}
              <ArrowRight aria-hidden="true" />
            </AppLink>
            <AppLink to="/body">
              <span><Medal aria-hidden="true" /></span>
              {canEdit ? "Zkontrolovat body" : "Zobrazit body"}
              <ArrowRight aria-hidden="true" />
            </AppLink>
          </div>
        </Card>
      </section>

    </div>
  );
}

function MemberDashboard({ database }: { database: AppDatabase }) {
  const queryClient = useQueryClient();
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const responseMutation = useMutation({
    mutationFn: ({
      eventId,
      response,
    }: {
      eventId: string;
      response: InterestStatus;
    }) => appApi.updateMyResponse(eventId, response),
    onMutate: ({ eventId }) => setPendingEventId(eventId),
    onSettled: () => setPendingEventId(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: databaseQueryKey });
    },
  });
  const today = todayInPrague();
  const upcoming = database.events
    .filter((event) => event.date >= today && event.status !== "cancelled")
    .sort((first, second) => first.date.localeCompare(second.date));
  const myScore = calculateScores(database).find(
    (score) => score.member.id === database.myMemberId,
  );
  const ordered = [...upcoming].sort((first, second) => {
    const firstResponse = myEventResponse(first, database.myMemberId);
    const secondResponse = myEventResponse(second, database.myMemberId);
    const firstNeedsResponse =
      firstResponse === "unset" && canRespondToEvent(first, today);
    const secondNeedsResponse =
      secondResponse === "unset" && canRespondToEvent(second, today);
    if (firstNeedsResponse !== secondNeedsResponse) {
      return firstNeedsResponse ? -1 : 1;
    }
    return first.date.localeCompare(second.date);
  });
  const history = database.myHistory ?? [];
  const orderedHistory = [...history].sort((first, second) =>
    second.date.localeCompare(first.date),
  );
  const recentAttendance = recentAttendanceEntries(history, today);

  return (
    <div className="page page--dashboard page--member-home">
      <PageHeader
        description={`${formatWeekday(today)} ${formatDate(today)} · vaše akce, účast a body`}
        eyebrow="Můj přehled"
        title="Co vás čeká"
      />

      <section className="member-home-stats">
        <Card className="member-score-card">
          <span className="stat-icon stat-icon--amber">
            <Medal aria-hidden="true" />
          </span>
          <span>
            <small>Moje body</small>
            <strong>{formatPoints(myScore?.total ?? 0)}</strong>
            <em>{Math.round(myScore?.attendanceRate ?? 0)} % účast</em>
          </span>
          <AppLink className="text-link" to="/body">
            Celý přehled <ArrowRight aria-hidden="true" />
          </AppLink>
        </Card>
        <Card>
          <span className="stat-icon stat-icon--green">
            <CheckCircle2 aria-hidden="true" />
          </span>
          <span>
            <small>Čeká na odpověď</small>
            <strong>
              {
                upcoming.filter(
                  (event) =>
                    myEventResponse(event, database.myMemberId) === "unset" &&
                    canRespondToEvent(event, today),
                ).length
              }
            </strong>
            <em>nadcházejících událostí</em>
          </span>
        </Card>
      </section>

      <section className="member-upcoming-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Potvrzení účasti</span>
            <h2>Nadcházející události</h2>
          </div>
        </div>
        <div className="member-event-list">
          {ordered.slice(0, 6).map((event) => {
            const response = myEventResponse(event, database.myMemberId);
            const canRespond = canRespondToEvent(event, today);
            return (
              <Card className="member-event-card" key={event.id}>
                <AppLink to={`/udalosti/${event.id}`}>
                  <span className={`mini-date mini-date--${event.type}`}>
                    <strong>{formatDate(event.date, "d")}</strong>
                    <small>{formatDate(event.date, "MMM")}</small>
                  </span>
                  <span>
                    <EventTypeBadge type={event.type} />
                    <strong>{event.title}</strong>
                    <small>
                      {event.startTime} · {event.location}
                    </small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </AppLink>
                <div className="member-event-rsvp">
                  <Badge
                    tone={
                      response === "yes"
                        ? "green"
                        : response === "no"
                          ? "red"
                          : response === "maybe"
                            ? "amber"
                            : "neutral"
                    }
                  >
                    {interestLabels[response]}
                  </Badge>
                  <div>
                    {(
                      [
                        ["yes", "Ano"],
                        ["no", "Ne"],
                        ["maybe", "Nevím"],
                        ["substitute", "Náhradník"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        aria-pressed={response === value}
                        className={response === value ? "is-active" : ""}
                        disabled={!canRespond || pendingEventId === event.id}
                        key={value}
                        onClick={() =>
                          responseMutation.mutate({
                            eventId: event.id,
                            response: value,
                          })
                        }
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        {responseMutation.isError ? (
          <p className="inline-error" role="alert">
            Odpověď se nepodařilo uložit. Zkuste to prosím znovu.
          </p>
        ) : null}
      </section>

      <Card className="member-history-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Moje historie</span>
            <h2>Poslední účast</h2>
          </div>
        </div>
        <div className="member-history-list">
          {recentAttendance.map((entry) => (
            <AppLink key={entry.eventId} to={`/udalosti/${entry.eventId}`}>
              <span>{formatDate(entry.date)}</span>
              <strong>{entry.title}</strong>
              <Badge
                tone={
                  entry.attendance === "present" ||
                  entry.attendance === "partial"
                    ? "green"
                    : entry.attendance === "absent"
                      ? "red"
                      : "neutral"
                }
              >
                {entry.attendance === "present"
                  ? "Přítomen"
                  : entry.attendance === "partial"
                    ? "Částečně"
                    : entry.attendance === "absent"
                      ? "Nepřítomen"
                      : entry.attendance === "excused"
                        ? "Omluven"
                        : "Nezapsáno"}
              </Badge>
              <strong>{formatPoints(entry.points)} b.</strong>
            </AppLink>
          ))}
          {recentAttendance.length === 0 ? (
            <p>Zatím nemáte uzavřenou událost se zapsanou docházkou.</p>
          ) : null}
        </div>
      </Card>

      <Card className="member-full-history-card">
        <details>
          <summary>
            <span>
              <span className="eyebrow">Moje historie</span>
              <strong>Všechny odpovědi, účast a páry</strong>
            </span>
            <Badge tone="blue">{orderedHistory.length}</Badge>
          </summary>
          <div className="member-full-history-list">
            {orderedHistory.map((entry) => (
              <article key={entry.eventId}>
                <header>
                  <span>
                    <AppLink to={`/udalosti/${entry.eventId}`}>
                      {entry.title}
                    </AppLink>
                    <small>
                      {formatDate(entry.date)} · {eventTypeLabels[entry.type]}
                    </small>
                  </span>
                  <strong>{formatPoints(entry.points)} b.</strong>
                </header>
                <div className="member-full-history-facts">
                  <span>Odpověď: {interestLabels[entry.response]}</span>
                  <span>Docházka: {attendanceLabels[entry.attendance]}</span>
                </div>
                {entry.pairs.length ? (
                  <ul>
                    {entry.pairs.map((pair, index) => (
                      <li
                        key={`${entry.eventId}-${pair.partnerId}-${pair.blockName ?? index}`}
                      >
                        <strong>{pair.partnerName}</strong>
                        {pair.blockName ? ` · ${pair.blockName}` : ""}
                        {pair.programNames.length
                          ? ` · ${pair.programNames.join(", ")}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
            {orderedHistory.length === 0 ? (
              <p>Zatím tu není žádná událost.</p>
            ) : null}
          </div>
        </details>
      </Card>
    </div>
  );
}

function myEventResponse(
  event: EnsembleEvent,
  memberId: string | undefined,
): InterestStatus {
  if (!memberId) return "unset";
  return (
    event.attendance.find((record) => record.memberId === memberId)?.interest ??
    "unset"
  );
}
