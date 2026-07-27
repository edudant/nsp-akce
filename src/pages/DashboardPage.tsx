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
import { calculateScores } from "../lib/demoData";
import { isSupabaseConfigured } from "../lib/supabase";
import { useDatabase } from "../components/DataContext";
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
    <div className="page">
      <PageHeader
        actions={
          canEdit ? (
          <AppLink className="button button--primary button--medium" to="/udalosti">
            <CalendarPlus aria-hidden="true" />
            Přidat událost
          </AppLink>
          ) : null
        }
        description={`${formatWeekday(today)} ${formatDate(today)} · aktuální sezona`}
        eyebrow="Dobrý den"
        title="Co je nového v souboru"
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
              <AppLink
                className="button button--secondary button--medium"
                to={`/udalosti/${nextEvent.id}`}
              >
                Otevřít událost
                <ArrowRight aria-hidden="true" />
              </AppLink>
            </div>
          </Card>
        ) : null}

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
            {upcoming.slice(0, 4).map((event) => (
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
            ))}
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

      <div className="demo-notice" role="note">
        <span>TESTOVACÍ DATA</span>
        {isSupabaseConfigured
          ? " Nasazená databáze nyní obsahuje pouze smyšlená jména a ukázkovou docházku. Změny se ukládají do Supabase."
          : " Pracujete v místním ukázkovém režimu. Změny zůstanou uložené jen v tomto prohlížeči."}
      </div>
    </div>
  );
}
