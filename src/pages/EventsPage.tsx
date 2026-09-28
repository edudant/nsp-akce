import { EventForm, type EventFormInput } from "../components/EventForm";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  MapPin,
  Search,
  UsersRound,
} from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { cs } from "date-fns/locale";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import {
  attendanceLabels,
  interestLabels,
  type EnsembleEvent,
  type EventType,
  type ProgramCatalogItem,
} from "../lib/domain";
import { databaseQueryKey, useDatabase } from "../components/DataContext";
import { EmptyState, ErrorState, LoadingState } from "../components/DataStates";
import { formatDate, todayInPrague } from "../components/formatters";
import { PageHeader } from "../components/PageHeader";
import { AppLink, navigate } from "../components/Router";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EventStatusBadge,
  EventTypeBadge,
} from "../components/Ui";

type EventFilter = "all" | EventType;

export function EventsPage({ canEdit }: { canEdit: boolean }) {
  const database = useDatabase();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<EventFilter>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    parseISO(todayInPrague()),
  );

  const createMutation = useMutation({
    mutationFn: appApi.addEvent,
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: databaseQueryKey });
      setCreateOpen(false);
      navigate(`/udalosti/${event.id}`);
    },
  });

  const filteredEvents = useMemo(() => {
    if (!database.data) return [];
    return [...database.data.events]
      .filter((event) => filter === "all" || event.type === filter)
      .filter((event) => {
        const term = search.trim().toLocaleLowerCase("cs");
        if (!term) return true;
        return `${event.title} ${event.location} ${event.program ?? ""}`
          .toLocaleLowerCase("cs")
          .includes(term);
      })
      .sort((first, second) => second.date.localeCompare(first.date));
  }, [database.data, filter, search]);

  if (database.isLoading) return <LoadingState label="Načítám události…" />;
  if (database.isError || !database.data) {
    return <ErrorState onRetry={() => void database.refetch()} />;
  }

  const today = todayInPrague();
  const future = filteredEvents.filter((event) => event.date >= today);
  const past = filteredEvents.filter((event) => event.date < today);

  return (
    <div className="page">
      <PageHeader
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <CalendarPlus aria-hidden="true" />
              Nová událost
            </Button>
          ) : null
        }
        description="Plánujte zkoušky a vystoupení, sbírejte zájem a zapisujte účast."
        eyebrow="Letní sezona 2026"
        title="Události"
      />

      <Card className="toolbar-card">
        <div className="filter-tabs" role="tablist" aria-label="Typ události">
          {(
            [
              ["all", "Všechny"],
              ["rehearsal", "Zkoušky"],
              ["performance", "Vystoupení"],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-selected={filter === value}
              className={filter === value ? "is-active" : ""}
              key={value}
              onClick={() => setFilter(value)}
              role="tab"
              type="button"
            >
              {label}
              <span>
                {
                  database.data.events.filter(
                    (event) => value === "all" || event.type === value,
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="toolbar-card__controls">
          <label className="search-field">
            <Search aria-hidden="true" />
            <span className="sr-only">Hledat událost</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Hledat událost…"
              type="search"
              value={search}
            />
          </label>
          <div className="view-switch" aria-label="Zobrazení">
            <button
              aria-label="Seznam"
              aria-pressed={view === "list"}
              className={view === "list" ? "is-active" : ""}
              onClick={() => setView("list")}
              type="button"
            >
              <List aria-hidden="true" />
            </button>
            <button
              aria-label="Kalendář"
              aria-pressed={view === "calendar"}
              className={view === "calendar" ? "is-active" : ""}
              onClick={() => setView("calendar")}
              type="button"
            >
              <CalendarDays aria-hidden="true" />
            </button>
          </div>
        </div>
      </Card>

      {filteredEvents.length === 0 ? (
        <EmptyState
          action={
            canEdit ? (
              <Button onClick={() => setCreateOpen(true)} size="small">
                <CalendarPlus aria-hidden="true" />
                Přidat událost
              </Button>
            ) : undefined
          }
          description="Zkuste upravit filtr nebo založte novou událost."
          title="Žádné události jsme nenašli"
        />
      ) : view === "calendar" ? (
        <EventCalendar
          events={filteredEvents}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
        />
      ) : (
        <div className="event-sections">
          {future.length ? (
            <section>
              <div className="section-heading">
                <h2>Nadcházející</h2>
                <Badge tone="blue">{future.length}</Badge>
              </div>
              <div className="events-list">
                {future.map((event) => (
                  <EventRow event={event} key={event.id} />
                ))}
              </div>
            </section>
          ) : null}
          {past.length ? (
            <section>
              <div className="section-heading">
                <h2>Proběhlé</h2>
                <Badge>{past.length}</Badge>
              </div>
              <div className="events-list">
                {past.map((event) => (
                  <EventRow event={event} key={event.id} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {canEdit ? (
        <CreateEventDialog
          error={createMutation.error?.message}
          loading={createMutation.isPending}
          onClose={() => setCreateOpen(false)}
          onCreate={(input) => createMutation.mutate(input)}
          open={createOpen}
          programCatalog={database.data.programCatalog ?? []}
        />
      ) : null}
    </div>
  );
}

function EventRow({ event }: { event: EnsembleEvent }) {
  const yes = event.attendance.filter(
    (record) => record.interest === "yes",
  ).length;
  const recorded = event.attendance.filter(
    (record) => record.status !== "unknown",
  ).length;
  const total = event.attendance.length;
  const closed = event.status === "closed";
  const personalRecord =
    event.attendanceScope === "self" ? event.attendance[0] : undefined;
  const visibleCount = closed ? recorded : yes;
  const progress = total > 0 ? (100 * visibleCount) / total : 0;

  return (
    <AppLink className="event-row card" to={`/udalosti/${event.id}`}>
      <span className={`event-date event-date--${event.type}`}>
        <strong>{formatDate(event.date, "d")}</strong>
        <small>{formatDate(event.date, "MMM")}</small>
        <em>{formatDate(event.date, "EEE")}</em>
      </span>
      <span className="event-row__main">
        <span className="event-row__badges">
          <EventTypeBadge type={event.type} />
          <EventStatusBadge status={event.status} />
        </span>
        <strong>{event.title}</strong>
        <span className="event-meta">
          <span>
            <Clock3 aria-hidden="true" />
            {event.startTime}–{event.endTime}
          </span>
          <span>
            <MapPin aria-hidden="true" />
            {event.location}
          </span>
        </span>
      </span>
      <span className="event-row__program">
        <small>Program</small>
        <strong>{event.program || "Bude doplněno"}</strong>
      </span>
      <span className="event-row__attendance">
        <span>
          <UsersRound aria-hidden="true" />
          {personalRecord ? (
            <strong>
              {closed
                ? attendanceLabels[personalRecord.status]
                : interestLabels[personalRecord.interest]}
            </strong>
          ) : total > 0 ? (
            <>
              <strong>{visibleCount}</strong> / {total}
            </>
          ) : (
            <strong>—</strong>
          )}
        </span>
        <small>
          {personalRecord
            ? closed
              ? "moje docházka"
              : "moje odpověď"
            : total > 0
              ? closed
                ? "zapsaná docházka"
                : "potvrzený zájem"
              : "souhrn není zveřejněný"}
        </small>
        {!personalRecord ? (
          <span className="progress">
            <span style={{ width: `${progress}%` }} />
          </span>
        ) : null}
      </span>
      <span className="event-row__arrow">
        <ChevronRight aria-hidden="true" />
      </span>
    </AppLink>
  );
}

function EventCalendar({
  events,
  month,
  onMonthChange,
}: {
  events: EnsembleEvent[];
  month: Date;
  onMonthChange: (date: Date) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });

  return (
    <Card className="calendar-card">
      <header className="calendar-card__header">
        <div>
          <span className="eyebrow">Kalendář</span>
          <h2>{format(month, "LLLL yyyy", { locale: cs })}</h2>
        </div>
        <div>
          <button
            aria-label="Předchozí měsíc"
            onClick={() => onMonthChange(subMonths(month, 1))}
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            onClick={() => onMonthChange(parseISO(todayInPrague()))}
            type="button"
          >
            Dnes
          </button>
          <button
            aria-label="Další měsíc"
            onClick={() => onMonthChange(addMonths(month, 1))}
            type="button"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="calendar-weekdays" aria-hidden="true">
        {["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayEvents = events.filter((event) => event.date === key);
          return (
            <div
              className={`${isSameMonth(day, month) ? "" : "is-outside"} ${
                key === todayInPrague() ? "is-today" : ""
              }`}
              key={key}
            >
              <span>{format(day, "d")}</span>
              <div>
                {dayEvents.map((event) => (
                  <AppLink
                    className={`calendar-event calendar-event--${event.type}`}
                    key={event.id}
                    title={`${event.startTime} ${event.title}`}
                    to={`/udalosti/${event.id}`}
                  >
                    <i aria-hidden="true" />
                    <span>{event.startTime}</span>
                    <strong>{event.title}</strong>
                  </AppLink>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CreateEventDialog({
  open,
  loading,
  error,
  onClose,
  onCreate,
}: {
  open: boolean;
  loading: boolean;
  error?: string;
  onClose: () => void;
  onCreate: (event: EventFormInput) => void;
  programCatalog: ProgramCatalogItem[];
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Přidat událost">
      <EventForm loading={loading} error={error} onSave={onCreate} />
    </Dialog>
  );
}
