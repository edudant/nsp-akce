import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  MapPin,
  Search,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import {
  addDays,
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
import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import { type EnsembleEvent, type EventType } from "../lib/demoData";
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
  Field,
  Select,
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
                {database.data.events.filter(
                  (event) => value === "all" || event.type === value,
                ).length}
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
        />
      ) : null}
    </div>
  );
}

function EventRow({ event }: { event: EnsembleEvent }) {
  const yes = event.attendance.filter((record) => record.interest === "yes").length;
  const recorded = event.attendance.filter(
    (record) => record.status !== "unknown",
  ).length;
  const total = event.attendance.length;
  const closed = event.status === "closed";
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
          {total > 0 ? (
            <>
              <strong>{visibleCount}</strong> / {total}
            </>
          ) : (
            <strong>—</strong>
          )}
        </span>
        <small>
          {total > 0
            ? closed
              ? "zapsaná docházka"
              : "potvrzený zájem"
            : "souhrn není zveřejněný"}
        </small>
        <span className="progress">
          <span style={{ width: `${progress}%` }} />
        </span>
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

type CreateEventInput = Omit<EnsembleEvent, "id" | "attendance" | "pairs">;

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
  onCreate: (event: CreateEventInput) => void;
}) {
  const [type, setType] = useState<EventType>("rehearsal");
  const [title, setTitle] = useState("Čtvrteční zkouška");
  const [date, setDate] = useState(() =>
    format(addDays(parseISO(todayInPrague()), 7), "yyyy-MM-dd"),
  );
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");
  const [location, setLocation] = useState("Sokolovna Postřekov");
  const [program, setProgram] = useState("");
  const [weight, setWeight] = useState("1");
  const [capacity, setCapacity] = useState("8");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onCreate({
      title,
      type,
      date,
      startTime,
      endTime,
      location,
      status: "open",
      weight: Number(weight),
      capacityPairs: Number(capacity),
      program: program || undefined,
      note: undefined,
      responseDeadline:
        type === "performance"
          ? format(parseISO(date), "yyyy-MM-dd")
          : undefined,
      pairsPublished: false,
    });
  };

  return (
    <Dialog
      description="Termín i pravidla můžete později upravit."
      onClose={onClose}
      open={open}
      title="Přidat událost"
    >
      <form className="dialog-form" onSubmit={handleSubmit}>
        <div className="event-type-picker">
          <button
            aria-pressed={type === "rehearsal"}
            className={type === "rehearsal" ? "is-active" : ""}
            onClick={() => {
              setType("rehearsal");
              setTitle("Čtvrteční zkouška");
              setWeight("1");
            }}
            type="button"
          >
            <CalendarDays aria-hidden="true" />
            <span>
              <strong>Zkouška</strong>
              <small>Běžná nebo generální</small>
            </span>
            {type === "rehearsal" ? <Check aria-hidden="true" /> : null}
          </button>
          <button
            aria-pressed={type === "performance"}
            className={type === "performance" ? "is-active" : ""}
            onClick={() => {
              setType("performance");
              setTitle("");
              setWeight("2");
            }}
            type="button"
          >
            <UsersRound aria-hidden="true" />
            <span>
              <strong>Vystoupení</strong>
              <small>Se zájmem a výběrem</small>
            </span>
            {type === "performance" ? <Check aria-hidden="true" /> : null}
          </button>
        </div>
        <Field htmlFor="event-title" label="Název">
          <input
            autoFocus
            id="event-title"
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </Field>
        <div className="form-grid form-grid--3">
          <Field htmlFor="event-date" label="Datum">
            <input
              id="event-date"
              onChange={(event) => setDate(event.target.value)}
              required
              type="date"
              value={date}
            />
          </Field>
          <Field htmlFor="event-start" label="Začátek">
            <input
              id="event-start"
              onChange={(event) => setStartTime(event.target.value)}
              required
              type="time"
              value={startTime}
            />
          </Field>
          <Field htmlFor="event-end" label="Konec">
            <input
              id="event-end"
              onChange={(event) => setEndTime(event.target.value)}
              required
              type="time"
              value={endTime}
            />
          </Field>
        </div>
        <Field htmlFor="event-location" label="Místo">
          <div className="input-with-icon">
            <MapPin aria-hidden="true" />
            <input
              id="event-location"
              onChange={(event) => setLocation(event.target.value)}
              required
              value={location}
            />
          </div>
        </Field>
        <Field htmlFor="event-program" label="Program / pásmo">
          <input
            id="event-program"
            onChange={(event) => setProgram(event.target.value)}
            placeholder="Volitelné"
            value={program}
          />
        </Field>
        <div className="form-grid">
          <Field htmlFor="event-weight" label="Bodová váha">
            <Select
              id="event-weight"
              onChange={(event) => setWeight(event.target.value)}
              value={weight}
            >
              <option value="0.5">0,5 bodu</option>
              <option value="1">1 bod</option>
              <option value="1.5">1,5 bodu</option>
              <option value="2">2 body</option>
            </Select>
          </Field>
          <Field htmlFor="event-capacity" label="Počet párů">
            <div className="input-with-icon">
              <SlidersHorizontal aria-hidden="true" />
              <input
                id="event-capacity"
                max="20"
                min="1"
                onChange={(event) => setCapacity(event.target.value)}
                type="number"
                value={capacity}
              />
            </div>
          </Field>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <footer className="dialog-actions">
          <Button onClick={onClose} type="button" variant="ghost">
            Zrušit
          </Button>
          <Button loading={loading} type="submit">
            <CalendarPlus aria-hidden="true" />
            Vytvořit událost
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
