import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  HeartHandshake,
  Info,
  MapPin,
  MessageCircleQuestion,
  Minus,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UserCheck,
  UserMinus,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import {
  attendanceLabels,
  experienceLabels,
  getAttendancePoints,
  interestLabels,
  type AttendanceRecord,
  type AttendanceStatus,
  type EnsembleEvent,
  type EventProgramItem,
  type EventProgramUpdateItem,
  type InterestStatus,
  type Member,
  type PairingBlock,
  type ProgramCatalogItem,
} from "../lib/domain";
import {
  canRespondToEvent,
  displayedAttendancePoints,
  groupEventPairs,
} from "../lib/memberPortal";
import { databaseQueryKey, useDatabase } from "../components/DataContext";
import { EmptyState, ErrorState, LoadingState } from "../components/DataStates";
import {
  formatDate,
  formatPoints,
  formatWeekday,
  todayInPrague,
} from "../components/formatters";
import { AppLink } from "../components/Router";
import {
  AttendanceBadge,
  Avatar,
  Badge,
  Button,
  Card,
  EventStatusBadge,
  EventTypeBadge,
  IconButton,
  Select,
} from "../components/Ui";

type DetailTab = "attendance" | "pairs" | "information";
type RosterMode = "attendance" | "interest";

const attendanceActions: Array<{
  value: AttendanceStatus;
  label: string;
  icon: typeof Check;
}> = [
  { value: "present", label: "Přítomen", icon: Check },
  { value: "partial", label: "Částečně", icon: Minus },
  { value: "excused", label: "Omluven", icon: MessageCircleQuestion },
  { value: "absent", label: "Chybí", icon: X },
];

const interestActions: Array<{
  value: InterestStatus;
  label: string;
  icon: typeof Check;
}> = [
  { value: "yes", label: "Ano", icon: Check },
  { value: "maybe", label: "Nevím", icon: MessageCircleQuestion },
  { value: "substitute", label: "Náhradník", icon: UserMinus },
  { value: "no", label: "Nemůže", icon: X },
];

export function EventDetailPage({
  eventId,
  canEdit,
  canAdmin,
  canPair,
}: {
  eventId: string;
  canEdit: boolean;
  canAdmin: boolean;
  canPair: boolean;
}) {
  const database = useDatabase();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DetailTab>("attendance");
  const [rosterMode, setRosterMode] = useState<RosterMode>("attendance");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "leader" | "follower">(
    "all",
  );
  const [savedMessage, setSavedMessage] = useState("");
  const eventQueryKey = ["event", eventId] as const;
  const eventQuery = useQuery({
    queryKey: eventQueryKey,
    queryFn: () => appApi.getEvent(eventId),
    staleTime: 20_000,
  });

  const attendanceMutation = useMutation({
    mutationFn: ({
      memberId,
      patch,
    }: {
      memberId: string;
      patch: Partial<AttendanceRecord>;
    }) => appApi.updateAttendance(eventId, memberId, patch),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: databaseQueryKey }),
        queryClient.invalidateQueries({ queryKey: eventQueryKey }),
      ]);
      setSavedMessage("Změna je uložená");
      window.setTimeout(() => setSavedMessage(""), 1600);
    },
  });

  const allMutation = useMutation({
    mutationFn: (status: AttendanceStatus) =>
      appApi.updateAllAttendance(eventId, status),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: databaseQueryKey }),
        queryClient.invalidateQueries({ queryKey: eventQueryKey }),
      ]);
      setSavedMessage("Docházka je uložená");
      window.setTimeout(() => setSavedMessage(""), 1600);
    },
  });
  const confirmPairsMutation = useMutation({
    mutationFn: () => appApi.confirmActualPairs(eventId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: databaseQueryKey }),
        queryClient.invalidateQueries({ queryKey: eventQueryKey }),
      ]);
      setSavedMessage("Skutečné páry jsou potvrzené v historii");
      window.setTimeout(() => setSavedMessage(""), 2200);
    },
  });
  const statusMutation = useMutation({
    mutationFn: (status: "open" | "closed") =>
      appApi.updateEventStatus(eventId, status),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: databaseQueryKey }),
        queryClient.invalidateQueries({ queryKey: eventQueryKey }),
      ]);
      setSavedMessage("Stav události je uložený");
      window.setTimeout(() => setSavedMessage(""), 1800);
    },
  });
  const myResponseMutation = useMutation({
    mutationFn: (response: InterestStatus) =>
      appApi.updateMyResponse(eventId, response),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: databaseQueryKey }),
        queryClient.invalidateQueries({ queryKey: eventQueryKey }),
      ]);
      setSavedMessage("Vaše odpověď je uložená");
      window.setTimeout(() => setSavedMessage(""), 1800);
    },
  });
  const wishesMutation = useMutation({
    mutationFn: (partnerIds: string[]) =>
      appApi.setMyPartnerWishes(eventId, partnerIds),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: databaseQueryKey }),
        queryClient.invalidateQueries({ queryKey: eventQueryKey }),
      ]);
      setSavedMessage("Přání partnerů je uložené");
      window.setTimeout(() => setSavedMessage(""), 1800);
    },
  });
  const programMutation = useMutation({
    mutationFn: (items: EventProgramUpdateItem[]) =>
      appApi.updateEventProgram(eventId, items),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: databaseQueryKey }),
        queryClient.invalidateQueries({ queryKey: eventQueryKey }),
      ]);
      setSavedMessage("Program události je uložený");
      window.setTimeout(() => setSavedMessage(""), 1800);
    },
  });

  const event = eventQuery.data;
  const members = useMemo(
    () => database.data?.members ?? [],
    [database.data?.members],
  );

  const roster = useMemo(() => {
    if (!event) return [];
    return event.attendance
      .map((record) => ({
        record,
        member: members.find((member) => member.id === record.memberId),
      }))
      .filter(
        (
          item,
        ): item is {
          record: AttendanceRecord;
          member: NonNullable<typeof item.member>;
        } => Boolean(item.member),
      )
      .filter(({ member }) => roleFilter === "all" || member.role === roleFilter)
      .filter(({ member }) =>
        member.fullName
          .toLocaleLowerCase("cs")
          .includes(search.trim().toLocaleLowerCase("cs")),
      )
      .sort((first, second) =>
        first.member.fullName.localeCompare(second.member.fullName, "cs"),
      );
  }, [event, members, roleFilter, search]);

  if (database.isLoading || eventQuery.isLoading) {
    return <LoadingState label="Načítám událost…" />;
  }
  if (database.isError || eventQuery.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void database.refetch();
          void eventQuery.refetch();
        }}
      />
    );
  }
  if (!event || !database.data) {
    return (
      <EmptyState
        action={
          <AppLink className="button button--secondary button--small" to="/udalosti">
            Zpět na události
          </AppLink>
        }
        description="Možná byla odstraněna nebo je odkaz neplatný."
        title="Událost nebyla nalezena"
      />
    );
  }

  const recorded = event.attendance.filter(
    (record) => record.status !== "unknown",
  ).length;
  const present = event.attendance.filter(
    (record) => record.status === "present" || record.status === "partial",
  ).length;
  const interested = event.attendance.filter(
    (record) => record.interest === "yes",
  ).length;
  const responseCount = event.attendance.filter(
    (record) => record.interest !== "unset",
  ).length;
  const personalMember = database.data.accessMode === "member";
  const myMember = database.data.members.find(
    (member) => member.id === database.data.myMemberId,
  );
  const myRecord = event.attendance.find(
    (record) => record.memberId === database.data.myMemberId,
  );
  const myWishIds = (database.data.partnerWishes ?? [])
    .filter(
      (wish) =>
        wish.eventId === event.id && wish.memberId === database.data.myMemberId,
    )
    .map((wish) => wish.partnerId);
  const attendanceScope = event.attendanceScope ?? "all";
  const eventDetailsAvailable = event.eventDetailsAvailable !== false;
  const pairGroups = groupEventPairs(event);

  return (
    <div className="page page--detail">
      <AppLink className="back-link" to="/udalosti">
        <ArrowLeft aria-hidden="true" />
        Zpět na události
      </AppLink>

      <header className="event-detail-header">
        <div className={`event-detail-date event-detail-date--${event.type}`}>
          <span>{formatWeekday(event.date)}</span>
          <strong>{formatDate(event.date, "d")}</strong>
          <small>{formatDate(event.date, "MMMM yyyy")}</small>
        </div>
        <div className="event-detail-header__copy">
          <div>
            <EventTypeBadge type={event.type} />
            <EventStatusBadge status={event.status} />
          </div>
          <h1>{event.title}</h1>
          <p className="event-meta">
            <span>
              <Clock3 aria-hidden="true" />
              {event.startTime}–{event.endTime}
            </span>
            <span>
              <MapPin aria-hidden="true" />
              {event.location}
            </span>
            {event.program ? (
              <span>
                <CalendarDays aria-hidden="true" />
                {event.program}
              </span>
            ) : null}
          </p>
        </div>
        {canAdmin || canPair ? (
          <div className="event-detail-header__actions">
            {canAdmin && event.status !== "closed" ? (
              <Button
                loading={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate(
                    event.status === "draft" ? "open" : "closed",
                  )
                }
                variant="secondary"
              >
                <CheckCircle2 aria-hidden="true" />
                {event.status === "draft"
                  ? "Otevřít událost"
                  : "Uzavřít událost"}
              </Button>
            ) : null}
            {canPair ? (
              <AppLink
                className="button button--secondary button--medium"
                to={`/pary?event=${event.id}`}
              >
                <Sparkles aria-hidden="true" />
                Navrhnout páry
              </AppLink>
            ) : null}
          </div>
        ) : null}
      </header>

      <section className="event-summary-grid">
        {attendanceScope === "all" ? (
          <>
            <Card className="event-summary-item">
              <span className="summary-icon summary-icon--green">
                <UserCheck aria-hidden="true" />
              </span>
              <span>
                <small>
                  {event.status === "closed" ? "Přítomno" : "Má zájem"}
                </small>
                <strong>{event.status === "closed" ? present : interested}</strong>
                <em>z {event.attendance.length} aktivních</em>
              </span>
            </Card>
            <Card className="event-summary-item">
              <span className="summary-icon summary-icon--blue">
                <CheckCircle2 aria-hidden="true" />
              </span>
              <span>
                <small>
                  {event.status === "closed"
                    ? "Docházka zapsána"
                    : "Odpovědělo"}
                </small>
                <strong>
                  {event.status === "closed" ? recorded : responseCount}
                </strong>
                <em>
                  {event.attendance.length -
                    (event.status === "closed" ? recorded : responseCount)}{" "}
                  zbývá
                </em>
              </span>
            </Card>
          </>
        ) : null}
        {eventDetailsAvailable ? (
          <Card className="event-summary-item">
            <span className="summary-icon summary-icon--amber">
              <UsersRound aria-hidden="true" />
            </span>
            <span>
              <small>Plánovaná kapacita</small>
              <strong>{event.capacityPairs}</strong>
              <em>tanečních párů</em>
            </span>
          </Card>
        ) : null}
        <Card className="event-summary-item">
          <span className="summary-icon summary-icon--red">
            <Sparkles aria-hidden="true" />
          </span>
          <span>
            <small>Páry</small>
            <strong>{event.pairs.length || "—"}</strong>
            <em>{event.pairsPublished ? "zveřejněné" : "nezveřejněné"}</em>
          </span>
        </Card>
      </section>

      <nav className="detail-tabs" aria-label="Detail události">
        <button
          aria-selected={tab === "attendance"}
          className={tab === "attendance" ? "is-active" : ""}
          onClick={() => setTab("attendance")}
          role="tab"
          type="button"
        >
          <UserCheck aria-hidden="true" />
          Docházka a zájem
        </button>
        <button
          aria-selected={tab === "pairs"}
          className={tab === "pairs" ? "is-active" : ""}
          onClick={() => setTab("pairs")}
          role="tab"
          type="button"
        >
          <UsersRound aria-hidden="true" />
          Taneční páry
          {event.pairs.length ? <Badge tone="green">{event.pairs.length}</Badge> : null}
        </button>
        <button
          aria-selected={tab === "information"}
          className={tab === "information" ? "is-active" : ""}
          onClick={() => setTab("information")}
          role="tab"
          type="button"
        >
          <Info aria-hidden="true" />
          Informace
        </button>
      </nav>

      {tab === "attendance" && personalMember && myMember && myRecord ? (
        <MemberParticipationPanel
          canRespond={
            canRespondToEvent(event, todayInPrague())
          }
          error={
            myResponseMutation.error?.message ?? wishesMutation.error?.message
          }
          event={event}
          key={`${event.id}:${myWishIds.join(",")}`}
          loading={myResponseMutation.isPending || wishesMutation.isPending}
          member={myMember}
          members={members}
          onResponse={(response) => myResponseMutation.mutate(response)}
          onSaveWishes={(partnerIds) => wishesMutation.mutate(partnerIds)}
          record={myRecord}
          wishIds={myWishIds}
        />
      ) : null}

      {tab === "attendance" && !personalMember && attendanceScope === "all" ? (
        <Card className="roster-card">
          <header className="roster-card__header">
            <div>
              <span className="eyebrow">Seznam členů</span>
              <h2>Rychlý zápis</h2>
              <p>Změny se ukládají automaticky po každém klepnutí.</p>
            </div>
            {savedMessage ? (
              <span aria-live="polite" className="save-indicator">
                <CheckCircle2 aria-hidden="true" />
                {savedMessage}
              </span>
            ) : null}
          </header>

          <div className="roster-toolbar">
            <div className="roster-mode-switch">
              <button
                aria-pressed={rosterMode === "attendance"}
                className={rosterMode === "attendance" ? "is-active" : ""}
                onClick={() => setRosterMode("attendance")}
                type="button"
              >
                Skutečná docházka
              </button>
              <button
                aria-pressed={rosterMode === "interest"}
                className={rosterMode === "interest" ? "is-active" : ""}
                onClick={() => setRosterMode("interest")}
                type="button"
              >
                Zájem před akcí
              </button>
            </div>
            <div className="roster-filters">
              <input
                aria-label="Hledat člena"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Hledat jméno…"
                type="search"
                value={search}
              />
              <Select
                aria-label="Filtrovat roli"
                onChange={(event) =>
                  setRoleFilter(
                    event.target.value as "all" | "leader" | "follower",
                  )
                }
                value={roleFilter}
              >
                <option value="all">Všechny role</option>
                <option value="leader">Tanečníci</option>
                <option value="follower">Tanečnice</option>
              </Select>
            </div>
            {canEdit && rosterMode === "attendance" ? (
              <Button
                loading={allMutation.isPending}
                onClick={() => allMutation.mutate("present")}
                size="small"
                variant="secondary"
              >
                <Check aria-hidden="true" />
                Označit všechny přítomné
              </Button>
            ) : null}
          </div>

          {attendanceMutation.isError || allMutation.isError ? (
            <p className="inline-error" role="alert">
              Změnu se nepodařilo uložit. Zkuste to znovu.
            </p>
          ) : null}

          <div className="roster-list">
            <div className="roster-list__heading" aria-hidden="true">
              <span>Člen</span>
              <span>Stav</span>
              <span>{rosterMode === "attendance" ? "Body" : "Výběr"}</span>
            </div>
            {roster.map(({ member, record }) => (
              <div className="roster-row" key={member.id}>
                <div className="roster-member">
                  <Avatar member={member} />
                  <span>
                    <strong>{member.fullName}</strong>
                    <small>
                      {member.role === "leader" ? "Tanečník" : "Tanečnice"} ·{" "}
                      {member.experience === "beginner"
                        ? "začátečník"
                        : member.experience === "advanced"
                          ? "pokročilý"
                          : "zkušený"}
                    </small>
                  </span>
                </div>

                {rosterMode === "attendance" ? (
                  <AttendanceControl
                    canEdit={canEdit}
                    loading={
                      attendanceMutation.isPending &&
                      attendanceMutation.variables?.memberId === member.id
                    }
                    onChange={(status) =>
                      attendanceMutation.mutate({
                        memberId: member.id,
                        patch: {
                          status,
                          attendedMinutes:
                            status === "partial" ? 60 : undefined,
                          selected:
                            status === "present" || status === "partial",
                        },
                      })
                    }
                    status={record.status}
                  />
                ) : (
                  <InterestControl
                    canEdit={canEdit}
                    loading={
                      attendanceMutation.isPending &&
                      attendanceMutation.variables?.memberId === member.id
                    }
                    onChange={(interest) =>
                      attendanceMutation.mutate({
                        memberId: member.id,
                        patch: { interest, selected: interest === "yes" },
                      })
                    }
                    status={record.interest}
                  />
                )}

                <div className="roster-score">
                  {rosterMode === "attendance" ? (
                    <>
                      <strong>{formatPoints(getAttendancePoints(event, record))}</strong>
                      <small>z {formatPoints(event.weight)}</small>
                    </>
                  ) : (
                    <>
                      <input
                        aria-label={`Vybrat člena ${member.fullName}`}
                        checked={record.selected}
                        disabled={!canEdit}
                        onChange={(inputEvent) =>
                          attendanceMutation.mutate({
                            memberId: member.id,
                            patch: { selected: inputEvent.target.checked },
                          })
                        }
                        type="checkbox"
                      />
                      <small>{record.selected ? "vybrán" : "nevybrán"}</small>
                    </>
                  )}
                </div>
                {rosterMode === "attendance" && record.status === "partial" ? (
                  <label className="partial-minutes">
                    <span>Odchozeno</span>
                    <input
                      disabled={!canEdit}
                      max="180"
                      min="0"
                      onBlur={(inputEvent) =>
                        attendanceMutation.mutate({
                          memberId: member.id,
                          patch: {
                            attendedMinutes: Number(inputEvent.target.value),
                          },
                        })
                      }
                      defaultValue={record.attendedMinutes ?? 60}
                      type="number"
                    />
                    <span>min</span>
                  </label>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "attendance" && attendanceScope === "none" ? (
        <Card className="shared-attendance-note">
          <UsersRound aria-hidden="true" />
          <span>
            <strong>Osobní odpovědi tu nezobrazujeme</strong>
            <p>
              Společný přístup ukazuje termíny, body a zveřejněné páry. Svoji
              účast mohou členové potvrdit po přihlášení e-mailem.
            </p>
          </span>
        </Card>
      ) : null}

      {tab === "pairs" ? (
        <Card className="event-pairs-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Taneční páry</span>
              <h2>{event.pairs.length ? "Uložený návrh" : "Páry zatím chybí"}</h2>
              <p>
                {event.pairsPublished
                  ? "Tento seznam už vidí i členové."
                  : "Seznam zatím není zveřejněný členům."}
              </p>
            </div>
            {canPair ? (
              <div className="pair-detail-actions">
                {event.status === "closed" &&
                event.pairsPublished &&
                event.pairs.length > 0 &&
                !event.pairs.every((pair) => pair.actual) ? (
                  <Button
                    loading={confirmPairsMutation.isPending}
                    onClick={() => confirmPairsMutation.mutate()}
                    variant="secondary"
                  >
                    <CheckCircle2 aria-hidden="true" />
                    Potvrdit skutečné páry
                  </Button>
                ) : null}
                <AppLink
                  className="button button--primary button--medium"
                  to={`/pary?event=${event.id}`}
                >
                  <Sparkles aria-hidden="true" />
                  {event.pairs.length ? "Upravit návrh" : "Vygenerovat páry"}
                </AppLink>
              </div>
            ) : null}
          </div>
          {confirmPairsMutation.isError ? (
            <p className="inline-error" role="alert">
              Skutečné páry se nepodařilo potvrdit. Událost musí být uzavřená a
              návrh zveřejněný.
            </p>
          ) : null}
          {event.pairs.length ? (
            <div className="event-pair-groups">
              {pairGroups.map((group) => (
                <section className="event-pair-group" key={group.key}>
                  <header>
                    <span>
                      <strong>{group.name}</strong>
                      <small>
                        {group.programNames.length
                          ? group.programNames.join(" · ")
                          : "Celá událost"}
                      </small>
                    </span>
                    <Badge tone="green">
                      {group.pairs.length} {group.pairs.length === 1 ? "pár" : "párů"}
                    </Badge>
                  </header>
                  <div className="saved-pairs">
                    {group.pairs.map((pair, index) => {
                      const leader = members.find(
                        (member) => member.id === pair.leaderId,
                      );
                      const follower = members.find(
                        (member) => member.id === pair.followerId,
                      );
                      if (!leader || !follower) return null;
                      return (
                        <div key={pair.id}>
                          <span>{index + 1}</span>
                          <Avatar member={leader} size="small" />
                          <strong>{leader.fullName}</strong>
                          <span className="pair-divider">+</span>
                          <Avatar member={follower} size="small" />
                          <strong>{follower.fullName}</strong>
                          {pair.locked ? (
                            <Badge tone="amber">Pevný pár</Badge>
                          ) : null}
                          {pair.actual ? (
                            <Badge tone="green">Skutečně tančili</Badge>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState
              description="Generátor vybere spravedlivou kombinaci podle historie a zkušeností."
              title="Ještě nebyl uložen žádný návrh"
            />
          )}
        </Card>
      ) : null}

      {tab === "information" ? (
        <div className="information-grid">
          <Card>
            <div className="card-heading">
              <div>
                <span className="eyebrow">Základní údaje</span>
                <h2>Informace o události</h2>
              </div>
            </div>
            <dl className="details-list">
              <div>
                <dt>Datum</dt>
                <dd>{formatDate(event.date)}</dd>
              </div>
              <div>
                <dt>Čas</dt>
                <dd>{event.startTime}–{event.endTime}</dd>
              </div>
              <div>
                <dt>Místo</dt>
                <dd>{event.location}</dd>
              </div>
              <div>
                <dt>Program</dt>
                <dd>{event.program || "Neuveden"}</dd>
              </div>
              {eventDetailsAvailable ? (
                <>
                  <div>
                    <dt>Bodová váha</dt>
                    <dd>{formatPoints(event.weight)} bodu</dd>
                  </div>
                  <div>
                    <dt>Počet párů</dt>
                    <dd>{event.capacityPairs}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          </Card>
          <Card>
            <div className="card-heading">
              <div>
                <span className="eyebrow">Pokyny</span>
                <h2>Poznámka pro členy</h2>
              </div>
            </div>
            <p className="event-note">
              {event.note || "K této události zatím není žádná poznámka."}
            </p>
            {event.responseDeadline ? (
              <div className="deadline-note">
                <Clock3 aria-hidden="true" />
                <span>
                  <strong>Odpovědět do</strong>
                  {formatDate(event.responseDeadline)}
                </span>
              </div>
            ) : null}
          </Card>
          {canAdmin ? (
            <EventProgramEditor
              catalog={database.data.programCatalog ?? []}
              error={programMutation.error?.message}
              eventBlocks={event.pairingBlocks ?? []}
              items={event.programItems ?? []}
              key={`${event.id}:${(event.programItems ?? [])
                .map((item) => `${item.id}:${item.sortOrder}`)
                .join("|")}`}
              loading={programMutation.isPending}
              onSave={(items) => programMutation.mutate(items)}
              pairsPublished={event.pairsPublished}
              success={
                savedMessage === "Program události je uložený"
                  ? savedMessage
                  : undefined
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface EditableEventProgramItem {
  key: string;
  persistedId?: string;
  name: string;
  catalogId?: string;
  custom: boolean;
}

function toEditableProgramItem(
  item: EventProgramItem,
): EditableEventProgramItem {
  return {
    key: item.id,
    persistedId: item.id,
    name: item.name,
    catalogId: item.catalogId,
    custom: item.custom,
  };
}

function toProgramUpdateItem(
  item: EditableEventProgramItem,
): EventProgramUpdateItem {
  return item.catalogId
    ? { id: item.persistedId, catalogId: item.catalogId }
    : { id: item.persistedId, customName: item.name };
}

function programUpdateSignature(items: EventProgramUpdateItem[]) {
  return JSON.stringify(
    items.map((item) => ({
      id: item.id ?? null,
      catalogId: item.catalogId ?? null,
      customName: item.customName?.trim() ?? null,
    })),
  );
}

function EventProgramEditor({
  items,
  catalog,
  eventBlocks,
  pairsPublished,
  loading,
  error,
  success,
  onSave,
}: {
  items: EventProgramItem[];
  catalog: ProgramCatalogItem[];
  eventBlocks: PairingBlock[];
  pairsPublished: boolean;
  loading: boolean;
  error?: string;
  success?: string;
  onSave: (items: EventProgramUpdateItem[]) => void;
}) {
  const originalItems = [...items].sort(
    (first, second) => first.sortOrder - second.sortOrder,
  );
  const [draftItems, setDraftItems] = useState<EditableEventProgramItem[]>(() =>
    originalItems.map(toEditableProgramItem),
  );
  const [catalogChoice, setCatalogChoice] = useState("");
  const [customName, setCustomName] = useState("");
  const [validationError, setValidationError] = useState("");

  const selectedCatalogIds = new Set(
    draftItems.flatMap((item) => (item.catalogId ? [item.catalogId] : [])),
  );
  const availableCatalog = catalog
    .filter((item) => item.active && !selectedCatalogIds.has(item.id))
    .sort(
      (first, second) =>
        first.sortOrder - second.sortOrder ||
        first.name.localeCompare(second.name, "cs"),
    );
  const originalSignature = programUpdateSignature(
    originalItems.map(toEditableProgramItem).map(toProgramUpdateItem),
  );
  const updateItems = draftItems.map(toProgramUpdateItem);
  const dirty = programUpdateSignature(updateItems) !== originalSignature;

  const isProtectedByPublishedBlock = (item: EditableEventProgramItem) =>
    Boolean(
      pairsPublished &&
        item.persistedId &&
        eventBlocks.some(
          (block) =>
            block.appliesToAll ||
            block.programItemIds.includes(item.persistedId as string),
        ),
    );

  const addCatalogItem = () => {
    const catalogItem = catalog.find((item) => item.id === catalogChoice);
    if (!catalogItem || selectedCatalogIds.has(catalogItem.id)) return;
    const original = originalItems.find(
      (item) => item.catalogId === catalogItem.id,
    );
    setDraftItems((current) => [
      ...current,
      original
        ? toEditableProgramItem(original)
        : {
            key: `catalog-${catalogItem.id}`,
            name: catalogItem.name,
            catalogId: catalogItem.id,
            custom: false,
          },
    ]);
    setCatalogChoice("");
    setValidationError("");
  };

  const addCustomItem = () => {
    const name = customName.trim();
    if (!name) {
      setValidationError("Zadejte název vlastního pásma.");
      return;
    }
    if (name.length > 120) {
      setValidationError("Název vlastního pásma může mít nejvýše 120 znaků.");
      return;
    }
    if (
      draftItems.some(
        (item) => item.name.trim().toLocaleLowerCase("cs") === name.toLocaleLowerCase("cs"),
      )
    ) {
      setValidationError("Pásmo s tímto názvem už je v programu.");
      return;
    }
    const original = originalItems.find(
      (item) =>
        item.custom &&
        item.name.trim().toLocaleLowerCase("cs") === name.toLocaleLowerCase("cs"),
    );
    setDraftItems((current) => [
      ...current,
      original
        ? toEditableProgramItem(original)
        : {
            key: `custom-${name.toLocaleLowerCase("cs")}`,
            name,
            custom: true,
          },
    ]);
    setCustomName("");
    setValidationError("");
  };

  const moveItem = (index: number, offset: -1 | 1) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= draftItems.length) return;
    setDraftItems((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setValidationError("");
  };

  const removeItem = (item: EditableEventProgramItem) => {
    if (isProtectedByPublishedBlock(item)) return;
    setDraftItems((current) =>
      current.filter((candidate) => candidate.key !== item.key),
    );
    setValidationError("");
  };

  return (
    <Card className="event-program-editor">
      <div className="card-heading event-program-editor__heading">
        <div>
          <span className="eyebrow">Program události</span>
          <h2>Pásma a jejich pořadí</h2>
          <p>
            Vyberte pásma z katalogu nebo přidejte název jen pro tuto událost.
          </p>
        </div>
        <div className="event-program-editor__actions">
          {success ? (
            <span aria-live="polite" className="save-indicator">
              <CheckCircle2 aria-hidden="true" />
              {success}
            </span>
          ) : null}
          <Button
            disabled={!dirty}
            loading={loading}
            onClick={() => onSave(updateItems)}
            size="small"
          >
            <Save aria-hidden="true" />
            Uložit program
          </Button>
        </div>
      </div>

      {draftItems.length ? (
        <ol className="event-program-editor__list">
          {draftItems.map((item, index) => {
            const protectedItem = isProtectedByPublishedBlock(item);
            return (
              <li className="event-program-editor__row" key={item.key}>
                <span className="event-program-editor__order" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="event-program-editor__name">
                  <strong>{item.name}</strong>
                  <span>
                    <Badge tone={item.custom ? "amber" : "green"}>
                      {item.custom ? "Vlastní" : "Katalog"}
                    </Badge>
                    {protectedItem ? (
                      <Badge tone="blue">Použito ve zveřejněných párech</Badge>
                    ) : null}
                  </span>
                </span>
                <span className="event-program-editor__controls">
                  <IconButton
                    disabled={index === 0 || loading}
                    label={`Posunout ${item.name} nahoru`}
                    onClick={() => moveItem(index, -1)}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    disabled={index === draftItems.length - 1 || loading}
                    label={`Posunout ${item.name} dolů`}
                    onClick={() => moveItem(index, 1)}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    className="event-program-editor__remove"
                    disabled={protectedItem || loading}
                    label={
                      protectedItem
                        ? `${item.name} nelze odebrat, protože je použito ve zveřejněných párech`
                        : `Odebrat ${item.name}`
                    }
                    onClick={() => removeItem(item)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="event-program-editor__empty">
          Program je prázdný. Událost se při započítání párů bere jako jeden celek.
        </p>
      )}

      <div className="event-program-editor__additions">
        <div className="event-program-editor__add-row">
          <label htmlFor="event-program-catalog">Přidat z katalogu</label>
          <div>
            <Select
              disabled={!availableCatalog.length || loading}
              id="event-program-catalog"
              onChange={(inputEvent) => setCatalogChoice(inputEvent.target.value)}
              value={catalogChoice}
            >
              <option value="">
                {availableCatalog.length
                  ? "Vyberte pásmo…"
                  : "Všechna aktivní pásma jsou vybraná"}
              </option>
              {availableCatalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Button
              disabled={!catalogChoice}
              onClick={addCatalogItem}
              size="small"
              type="button"
              variant="secondary"
            >
              <Plus aria-hidden="true" />
              Přidat
            </Button>
          </div>
        </div>
        <div className="event-program-editor__add-row">
          <label htmlFor="event-program-custom">Vlastní název pro tuto událost</label>
          <div>
            <input
              disabled={loading}
              id="event-program-custom"
              maxLength={120}
              onChange={(inputEvent) => setCustomName(inputEvent.target.value)}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === "Enter") {
                  keyboardEvent.preventDefault();
                  addCustomItem();
                }
              }}
              placeholder="Např. Překvapení na závěr"
              type="text"
              value={customName}
            />
            <Button
              disabled={!customName.trim()}
              onClick={addCustomItem}
              size="small"
              type="button"
              variant="secondary"
            >
              <Plus aria-hidden="true" />
              Přidat
            </Button>
          </div>
        </div>
      </div>

      {pairsPublished ? (
        <p className="event-program-editor__hint">
          Pásmo použité blokem zveřejněného párování lze přesunout, ale ne odebrat.
        </p>
      ) : null}
      {validationError || error ? (
        <p className="inline-error" role="alert">
          {validationError || error}
        </p>
      ) : null}
    </Card>
  );
}

function MemberParticipationPanel({
  event,
  member,
  members,
  record,
  wishIds,
  canRespond,
  loading,
  error,
  onResponse,
  onSaveWishes,
}: {
  event: EnsembleEvent;
  member: Member;
  members: Member[];
  record: AttendanceRecord;
  wishIds: string[];
  canRespond: boolean;
  loading: boolean;
  error?: string;
  onResponse: (response: InterestStatus) => void;
  onSaveWishes: (partnerIds: string[]) => void;
}) {
  const [selectedWishes, setSelectedWishes] = useState(
    () => new Set(wishIds),
  );
  const eligiblePartners = members
    .filter(
      (candidate) =>
        candidate.active &&
        candidate.id !== member.id &&
        candidate.role !== member.role,
    )
    .sort((first, second) =>
      first.fullName.localeCompare(second.fullName, "cs"),
    );

  return (
    <div className="member-participation">
      <Card className="member-rsvp-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Moje účast</span>
            <h2>Přijdete na tuto událost?</h2>
            <p>
              {canRespond
                ? "Odpověď můžete do termínu kdykoli změnit."
                : "Přijímání odpovědí je už uzavřené."}
            </p>
          </div>
          <Badge
            tone={
              record.interest === "yes"
                ? "green"
                : record.interest === "no"
                  ? "red"
                  : record.interest === "maybe"
                    ? "amber"
                    : "neutral"
            }
          >
            {interestLabels[record.interest]}
          </Badge>
        </div>
        <div className="member-rsvp-actions" aria-label="Moje odpověď">
          {interestActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                aria-pressed={record.interest === action.value}
                className={record.interest === action.value ? "is-active" : ""}
                disabled={!canRespond || loading}
                key={action.value}
                onClick={() => onResponse(action.value)}
                type="button"
              >
                <Icon aria-hidden="true" />
                {action.label}
              </button>
            );
          })}
          <button
            aria-pressed={record.interest === "unset"}
            className={record.interest === "unset" ? "is-active" : ""}
            disabled={!canRespond || loading}
            onClick={() => onResponse("unset")}
            type="button"
          >
            <Minus aria-hidden="true" />
            Bez odpovědi
          </button>
        </div>
        {event.status === "closed" ? (
          <div className="member-attendance-result">
            <UserCheck aria-hidden="true" />
            <span>
              <small>Skutečná docházka</small>
              <strong>{attendanceLabels[record.status]}</strong>
            </span>
            <strong>{formatPoints(displayedAttendancePoints(event, record))} b.</strong>
          </div>
        ) : null}
      </Card>

      <Card className="partner-wishes-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Přání pro generátor</span>
            <h2>S kým byste si chtěli zatančit?</h2>
            <p>
              Můžete označit více jmen. Přání je soukromé a není zárukou
              výsledného páru.
            </p>
          </div>
          <HeartHandshake aria-hidden="true" />
        </div>
        <div className="partner-wish-grid">
          {eligiblePartners.map((partner) => (
            <label key={partner.id}>
              <input
                checked={selectedWishes.has(partner.id)}
                disabled={!canRespond || loading}
                onChange={(input) => {
                  setSelectedWishes((current) => {
                    const next = new Set(current);
                    if (input.target.checked) next.add(partner.id);
                    else next.delete(partner.id);
                    return next;
                  });
                }}
                type="checkbox"
              />
              <Avatar member={partner} size="small" />
              <span>
                <strong>{partner.fullName}</strong>
                {partner.experienceKnown !== false ? (
                  <small>{experienceLabels[partner.experience]}</small>
                ) : null}
              </span>
            </label>
          ))}
        </div>
        <footer className="partner-wishes-footer">
          <small>Vybráno: {selectedWishes.size}</small>
          <Button
            disabled={!canRespond}
            loading={loading}
            onClick={() => onSaveWishes([...selectedWishes])}
            size="small"
          >
            Uložit přání
          </Button>
        </footer>
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function AttendanceControl({
  status,
  canEdit,
  loading,
  onChange,
}: {
  status: AttendanceStatus;
  canEdit: boolean;
  loading: boolean;
  onChange: (status: AttendanceStatus) => void;
}) {
  if (!canEdit) return <AttendanceBadge status={status} />;
  return (
    <div
      aria-busy={loading}
      aria-label={`Docházka: ${attendanceLabels[status]}`}
      className="status-control"
    >
      {attendanceActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            aria-label={action.label}
            aria-pressed={status === action.value}
            className={`status-control__${action.value} ${
              status === action.value ? "is-active" : ""
            }`}
            disabled={loading}
            key={action.value}
            onClick={() => onChange(action.value)}
            title={action.label}
            type="button"
          >
            <Icon aria-hidden="true" />
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function InterestControl({
  status,
  canEdit,
  loading,
  onChange,
}: {
  status: InterestStatus;
  canEdit: boolean;
  loading: boolean;
  onChange: (status: InterestStatus) => void;
}) {
  if (!canEdit) {
    return (
      <Badge
        tone={
          status === "yes"
            ? "green"
            : status === "no"
              ? "red"
              : status === "maybe"
                ? "amber"
                : "neutral"
        }
      >
        {interestLabels[status]}
      </Badge>
    );
  }
  return (
    <div
      aria-busy={loading}
      aria-label={`Zájem: ${interestLabels[status]}`}
      className="status-control status-control--interest"
    >
      {interestActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            aria-label={action.label}
            aria-pressed={status === action.value}
            className={`status-control__${action.value} ${
              status === action.value ? "is-active" : ""
            }`}
            disabled={loading}
            key={action.value}
            onClick={() => onChange(action.value)}
            title={action.label}
            type="button"
          >
            <Icon aria-hidden="true" />
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
