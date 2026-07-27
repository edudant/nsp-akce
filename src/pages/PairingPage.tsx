import {
  AlertTriangle,
  Check,
  ChevronDown,
  Info,
  Lock,
  LockOpen,
  RefreshCcw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserMinus,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import {
  type DancePair,
  type EnsembleEvent,
  type Member,
  type PairPreference,
} from "../lib/demoData";
import {
  generatePairings,
  type LockedPair,
  type PairingResult,
} from "../lib/pairing";
import { databaseQueryKey, useDatabase } from "../components/DataContext";
import { ErrorState, LoadingState } from "../components/DataStates";
import { formatDate, todayInPrague } from "../components/formatters";
import { PageHeader } from "../components/PageHeader";
import { getHashSearchParams } from "../components/Router";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EventTypeBadge,
  ExperienceBadge,
  Select,
  Toggle,
} from "../components/Ui";

function pairKey(round: number, firstId: string, secondId: string) {
  return `${round}:${[firstId, secondId].sort().join(":")}`;
}

export function PairingPage({ canEdit }: { canEdit: boolean }) {
  const database = useDatabase();
  const queryClient = useQueryClient();
  const queryEventId = getHashSearchParams().get("event");
  const [eventId, setEventId] = useState(queryEventId ?? "");
  const [selection, setSelection] = useState<{
    eventId: string;
    ids: Set<string>;
  } | null>(null);
  const [rounds, setRounds] = useState(1);
  const [variant, setVariant] = useState(0);
  const [result, setResult] = useState<PairingResult | null>(null);
  const [lockedPairs, setLockedPairs] = useState<LockedPair[]>([]);
  const [respectPreferences, setRespectPreferences] = useState(true);
  const [mixExperience, setMixExperience] = useState(true);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [saved, setSaved] = useState("");
  const availableEvents = database.data?.events ?? [];
  const selectableEvents = availableEvents.filter(
    (event) => event.status !== "cancelled",
  );
  const fallbackEvent =
    [...selectableEvents]
      .sort((first, second) => first.date.localeCompare(second.date))
      .find((event) => event.date >= todayInPrague()) ??
    [...selectableEvents].sort((first, second) =>
      second.date.localeCompare(first.date),
    )[0] ??
    availableEvents[0];
  const resolvedEventId = availableEvents.some(
    (event) => event.id === eventId,
  )
    ? eventId
    : (fallbackEvent?.id ?? eventId);
  const eventQueryKey = ["event", resolvedEventId] as const;
  const publishedEventQuery = useQuery({
    queryKey: eventQueryKey,
    queryFn: () => appApi.getEvent(resolvedEventId),
    enabled: !canEdit && Boolean(resolvedEventId),
    staleTime: 20_000,
  });

  const saveMutation = useMutation({
    mutationFn: ({ pairs, publish }: { pairs: DancePair[]; publish: boolean }) =>
      appApi.savePairs(resolvedEventId, pairs, publish),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: databaseQueryKey });
      setSaved(variables.publish ? "Páry jsou zveřejněné" : "Návrh je uložený");
      window.setTimeout(() => setSaved(""), 2200);
    },
  });
  const preferenceMutation = useMutation({
    mutationFn: (input: Omit<PairPreference, "id">) =>
      appApi.addPreference(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: databaseQueryKey });
    },
  });
  const deletePreferenceMutation = useMutation({
    mutationFn: ({
      memberAId,
      memberBId,
    }: {
      memberAId: string;
      memberBId: string;
    }) => appApi.deletePreference(memberAId, memberBId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: databaseQueryKey });
    },
  });

  const selectedEvent = canEdit
    ? database.data?.events.find((event) => event.id === resolvedEventId)
    : (publishedEventQuery.data ??
      database.data?.events.find((event) => event.id === resolvedEventId));
  const activeMembers = useMemo(
    () => database.data?.members.filter((member) => member.active) ?? [],
    [database.data],
  );

  const defaultSelectedIds = useMemo(
    () =>
      new Set(
        (selectedEvent?.attendance ?? [])
      .filter(
        (record) =>
          record.selected ||
          record.interest === "yes" ||
          record.status === "present" ||
          record.status === "partial",
      )
          .map((record) => record.memberId),
      ),
    [selectedEvent],
  );
  const selectedIds =
    selection?.eventId === resolvedEventId
      ? selection.ids
      : defaultSelectedIds;

  if (database.isLoading || (!canEdit && publishedEventQuery.isLoading)) {
    return (
      <LoadingState
        label={canEdit ? "Připravuji generátor párů…" : "Načítám zveřejněné páry…"}
      />
    );
  }
  if (database.isError || !database.data || publishedEventQuery.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void database.refetch();
          if (!canEdit) void publishedEventQuery.refetch();
        }}
      />
    );
  }

  if (!canEdit) {
    return (
      <PublishedPairsView
        event={publishedEventQuery.data ?? null}
        eventId={resolvedEventId}
        events={database.data.events}
        members={database.data.members}
        onEventChange={setEventId}
      />
    );
  }

  const selectedMembers = activeMembers.filter((member) =>
    selectedIds.has(member.id),
  );
  const leaderCount = selectedMembers.filter(
    (member) => member.role === "leader",
  ).length;
  const followerCount = selectedMembers.filter(
    (member) => member.role === "follower",
  ).length;

  const buildResult = (nextVariant: number) => {
    if (!selectedEvent) return;
    const history = database.data.events
      .filter((event) => event.id !== selectedEvent.id)
      .flatMap((event) =>
        event.pairs.map((pair) => ({
          memberAId: pair.leaderId,
          memberBId: pair.followerId,
          occurredAt: event.date,
          actual: Boolean(pair.actual),
        })),
      );

    const next = generatePairings({
      members: selectedMembers.map((member) => ({
        id: member.id,
        displayName: member.fullName,
        role: member.role,
        experienceLevel: member.experience,
        active: member.active,
        available: true,
      })),
      compatibleRolePairs: [["leader", "follower"]],
      preferences: respectPreferences
        ? database.data.preferences
        : database.data.preferences.filter(
            (preference) => preference.kind === "forbidden",
          ),
      history,
      lockedPairs,
      rounds,
      seed: selectedEvent.id,
      variant: nextVariant,
      asOf: selectedEvent.date,
      weights: mixExperience
        ? undefined
        : { beginnerBeginner: 0, beginnerExperiencedBonus: 0 },
    });
    setResult(next);
    setVariant(nextVariant);
  };

  const generatedDancePairs = (): DancePair[] => {
    if (!result) return [];
    return result.rounds.flatMap((round) =>
      round.pairs.map((pair, index) => {
        const memberA = activeMembers.find(
          (member) => member.id === pair.memberAId,
        );
        const leaderId =
          memberA?.role === "leader" ? pair.memberAId : pair.memberBId;
        const followerId =
          memberA?.role === "leader" ? pair.memberBId : pair.memberAId;
        return {
          id: `generated-${round.round}-${index}-${leaderId}-${followerId}`,
          leaderId,
          followerId,
          round: round.round,
          locked: pair.locked,
          reason: pair.explanation,
        };
      }),
    );
  };

  return (
    <div className="page">
      <PageHeader
        description="Algoritmus střídá dvojice, propojuje začátečníky se zkušenějšími a respektuje omezení."
        eyebrow="Chytrý pomocník"
        title="Generátor tanečních párů"
      />

      <div className="pairing-layout">
        <aside className="pairing-sidebar">
          <Card className="pairing-setup">
            <div className="card-heading">
              <div>
                <span className="eyebrow">1. Nastavení</span>
                <h2>Pro koho páry chystáme?</h2>
              </div>
            </div>

            <label className="field">
              <span className="field__label">Událost</span>
              <Select
                onChange={(event) => {
                  setEventId(event.target.value);
                  setSelection(null);
                  setResult(null);
                  setLockedPairs([]);
                  setVariant(0);
                }}
                value={resolvedEventId}
              >
                {[...database.data.events]
                  .sort((first, second) => first.date.localeCompare(second.date))
                  .map((event) => (
                    <option key={event.id} value={event.id}>
                      {formatDate(event.date, "d. M.")} · {event.title}
                    </option>
                  ))}
              </Select>
            </label>

            {selectedEvent ? (
              <div className="selected-event-summary">
                <EventTypeBadge type={selectedEvent.type} />
                <strong>{selectedEvent.title}</strong>
                <span>
                  {formatDate(selectedEvent.date)} · {selectedEvent.location}
                </span>
              </div>
            ) : null}

            <div className="field">
              <span className="field__label">Počet tanečních kol</span>
              <div className="round-picker">
                {[1, 2, 3].map((round) => (
                  <button
                    aria-pressed={rounds === round}
                    className={rounds === round ? "is-active" : ""}
                    key={round}
                    onClick={() => {
                      setRounds(round);
                      setResult(null);
                    }}
                    type="button"
                  >
                    {round}
                  </button>
                ))}
              </div>
            </div>

            <div className="pairing-rules">
              <Toggle
                checked={mixExperience}
                description="Začátečník dostane přednostně zkušeného parťáka."
                label="Vyrovnávat zkušenost"
                onChange={(checked) => {
                  setMixExperience(checked);
                  setResult(null);
                }}
              />
              <Toggle
                checked={respectPreferences}
                description="Přání ovlivní pořadí; zákazy platí vždy."
                label="Zohlednit přání"
                onChange={(checked) => {
                  setRespectPreferences(checked);
                  setResult(null);
                }}
              />
            </div>

            <Button
              disabled={!canEdit || selectedMembers.length < 2}
              onClick={() => buildResult(variant)}
              size="large"
            >
              <WandSparkles aria-hidden="true" />
              Vygenerovat návrh
            </Button>
          </Card>

          {canEdit ? (
            <PreferenceManager
              deleting={deletePreferenceMutation.isPending}
              error={
                preferenceMutation.error?.message ??
                deletePreferenceMutation.error?.message
              }
              loading={preferenceMutation.isPending}
              members={activeMembers}
              onAdd={(input) => preferenceMutation.mutate(input)}
              onDelete={(memberAId, memberBId) =>
                deletePreferenceMutation.mutate({ memberAId, memberBId })
              }
              preferences={database.data.preferences}
            />
          ) : null}

          <CandidatePicker
            members={activeMembers}
            search={candidateSearch}
            selectedIds={selectedIds}
            setSearch={setCandidateSearch}
            setSelectedIds={(ids) => {
              setSelection({ eventId: resolvedEventId, ids });
              setResult(null);
            }}
          />
        </aside>

        <section className="pairing-results">
          <Card className="pairing-balance">
            <div>
              <span className="balance-icon balance-icon--leader">
                <UsersRound aria-hidden="true" />
              </span>
              <span>
                <small>Tanečníci</small>
                <strong>{leaderCount}</strong>
              </span>
            </div>
            <span className={leaderCount === followerCount ? "is-balanced" : ""}>
              {leaderCount === followerCount ? (
                <>
                  <Check aria-hidden="true" />
                  Role jsou vyrovnané
                </>
              ) : (
                <>
                  <AlertTriangle aria-hidden="true" />
                  Rozdíl {Math.abs(leaderCount - followerCount)}
                </>
              )}
            </span>
            <div>
              <span className="balance-icon balance-icon--follower">
                <UsersRound aria-hidden="true" />
              </span>
              <span>
                <small>Tanečnice</small>
                <strong>{followerCount}</strong>
              </span>
            </div>
          </Card>

          {!result ? (
            <Card className="pairing-empty">
              <span className="pairing-empty__art" aria-hidden="true">
                <Sparkles />
                <UsersRound />
              </span>
              <span className="eyebrow">Připraveno ke generování</span>
              <h2>Nechte aplikaci navrhnout spravedlivé páry</h2>
              <p>
                Vyberte účastníky, nastavte počet kol a spusťte generátor. Návrh
                můžete zamykat a nechat přepočítat.
              </p>
              <ul>
                <li>
                  <Check aria-hidden="true" />
                  Méně opakovaných dvojic
                </li>
                <li>
                  <Check aria-hidden="true" />
                  Vyrovnaná zkušenost
                </li>
                <li>
                  <Check aria-hidden="true" />
                  Citlivá omezení v bezpečí
                </li>
              </ul>
            </Card>
          ) : (
            <>
              <Card className="generated-header">
                <div>
                  <span className="eyebrow">2. Návrh párů</span>
                  <h2>
                    {result.rounds.reduce(
                      (sum, round) => sum + round.pairs.length,
                      0,
                    )}{" "}
                    dvojic v {result.rounds.length}{" "}
                    {result.rounds.length === 1 ? "kole" : "kolech"}
                  </h2>
                  <p>Varianta {result.variant + 1} · algoritmus {result.algorithmVersion}</p>
                </div>
                <div className="generated-header__actions">
                  <Button
                    onClick={() => buildResult(variant + 1)}
                    size="small"
                    variant="secondary"
                  >
                    <RefreshCcw aria-hidden="true" />
                    Jiná varianta
                  </Button>
                </div>
              </Card>

              {result.warnings.length ? (
                <div className="pairing-warning" role="alert">
                  <AlertTriangle aria-hidden="true" />
                  <div>
                    <strong>Návrh potřebuje pozornost</strong>
                    {result.warnings.slice(0, 3).map((warning) => (
                      <p key={`${warning.code}-${warning.memberIds.join("-")}`}>
                        {warning.message}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.rounds.map((round) => (
                <Card className="pair-round" key={round.round}>
                  <header>
                    <div>
                      <span>Kolo {round.round}</span>
                      <h3>
                        {round.pairs.length}{" "}
                        {round.pairs.length === 1 ? "pár" : "párů"}
                      </h3>
                    </div>
                    <Badge tone={round.complete ? "green" : "amber"}>
                      {round.complete ? "Kompletní" : "S volným členem"}
                    </Badge>
                  </header>
                  <div className="generated-pairs">
                    {round.pairs.map((pair, index) => {
                      const first = activeMembers.find(
                        (member) => member.id === pair.memberAId,
                      );
                      const second = activeMembers.find(
                        (member) => member.id === pair.memberBId,
                      );
                      if (!first || !second) return null;
                      const key = pairKey(
                        round.round,
                        pair.memberAId,
                        pair.memberBId,
                      );
                      const isLocked = lockedPairs.some(
                        (lock) =>
                          pairKey(
                            lock.round ?? 1,
                            lock.memberAId,
                            lock.memberBId,
                          ) === key,
                      );
                      return (
                        <PairCard
                          first={first}
                          index={index}
                          key={key}
                          locked={isLocked || pair.locked}
                          onToggleLock={() => {
                            setLockedPairs((current) =>
                              isLocked
                                ? current.filter(
                                    (lock) =>
                                      pairKey(
                                        lock.round ?? 1,
                                        lock.memberAId,
                                        lock.memberBId,
                                      ) !== key,
                                  )
                                : [
                                    ...current,
                                    {
                                      memberAId: pair.memberAId,
                                      memberBId: pair.memberBId,
                                      round: round.round,
                                    },
                                  ],
                            );
                          }}
                          pairExplanation={pair.explanation}
                          second={second}
                        />
                      );
                    })}
                    {round.byes.map((bye) => {
                      const member = activeMembers.find(
                        (item) => item.id === bye.memberId,
                      );
                      if (!member) return null;
                      return (
                        <div className="bye-card" key={bye.memberId}>
                          <UserMinus aria-hidden="true" />
                          <Avatar member={member} size="small" />
                          <span>
                            <strong>{member.fullName}</strong>
                            <small>{bye.explanation}</small>
                          </span>
                          <Badge tone="amber">Volno v kole</Badge>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}

              <Card className="pairing-save">
                <div>
                  <Save aria-hidden="true" />
                  <span>
                    <strong>Jste s návrhem spokojeni?</strong>
                    <small>
                      Uložený návrh můžete ještě upravit. Zveřejněný uvidí i
                      členové.
                    </small>
                  </span>
                </div>
                {saved ? (
                  <span aria-live="polite" className="save-indicator">
                    <Check aria-hidden="true" />
                    {saved}
                  </span>
                ) : null}
                <div>
                  <Button
                    loading={saveMutation.isPending}
                    onClick={() =>
                      saveMutation.mutate({
                        pairs: generatedDancePairs(),
                        publish: false,
                      })
                    }
                    variant="secondary"
                  >
                    <Save aria-hidden="true" />
                    Uložit návrh
                  </Button>
                  <Button
                    loading={saveMutation.isPending}
                    onClick={() =>
                      saveMutation.mutate({
                        pairs: generatedDancePairs(),
                        publish: true,
                      })
                    }
                  >
                    <Send aria-hidden="true" />
                    Uložit a zveřejnit
                  </Button>
                </div>
              </Card>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function PublishedPairsView({
  events,
  members,
  event,
  eventId,
  onEventChange,
}: {
  events: EnsembleEvent[];
  members: Member[];
  event: EnsembleEvent | null;
  eventId: string;
  onEventChange: (eventId: string) => void;
}) {
  const selectedEvent =
    event ?? events.find((availableEvent) => availableEvent.id === eventId);
  const publishedPairs =
    selectedEvent?.pairsPublished === true ? selectedEvent.pairs : [];
  const rounds = [...new Set(publishedPairs.map((pair) => pair.round))].sort(
    (first, second) => first - second,
  );

  return (
    <div className="page">
      <PageHeader
        description="Vyberte událost a podívejte se na dvojice zveřejněné vedením souboru."
        eyebrow="Členský přehled"
        title="Zveřejněné taneční páry"
      />

      <Card className="pairing-setup published-pairs-filter">
        <label className="field">
          <span className="field__label">Událost</span>
          <Select
            onChange={(event) => onEventChange(event.target.value)}
            value={eventId}
          >
            {[...events]
              .filter((event) => event.status !== "cancelled")
              .sort((first, second) => second.date.localeCompare(first.date))
              .map((event) => (
                <option key={event.id} value={event.id}>
                  {formatDate(event.date, "d. M.")} · {event.title}
                </option>
              ))}
          </Select>
        </label>

        {selectedEvent ? (
          <div className="selected-event-summary">
            <EventTypeBadge type={selectedEvent.type} />
            <strong>{selectedEvent.title}</strong>
            <span>
              {formatDate(selectedEvent.date)} · {selectedEvent.location}
            </span>
          </div>
        ) : null}
      </Card>

      {publishedPairs.length > 0 ? (
        <section className="pairing-results" aria-label="Zveřejněné páry">
          {rounds.map((round) => {
            const roundPairs = publishedPairs.filter(
              (pair) => pair.round === round,
            );
            return (
              <Card className="pair-round" key={round}>
                <header>
                  <div>
                    <span>Kolo {round}</span>
                    <h2>
                      {roundPairs.length}{" "}
                      {roundPairs.length === 1 ? "pár" : "párů"}
                    </h2>
                  </div>
                  <Badge tone="green">Zveřejněno</Badge>
                </header>
                <div className="generated-pairs">
                  {roundPairs.map((pair, index) => {
                    const leader = members.find(
                      (member) => member.id === pair.leaderId,
                    );
                    const follower = members.find(
                      (member) => member.id === pair.followerId,
                    );
                    if (!leader || !follower) return null;
                    return (
                      <PublishedPairCard
                        actual={Boolean(pair.actual)}
                        follower={follower}
                        index={index}
                        key={pair.id}
                        leader={leader}
                      />
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </section>
      ) : (
        <Card className="pairing-empty">
          <span className="pairing-empty__art" aria-hidden="true">
            <Sparkles />
            <UsersRound />
          </span>
          <span className="eyebrow">Zatím bez zveřejněných párů</span>
          <h2>Vedení souboru páry pro tuto událost ještě nezveřejnilo</h2>
          <p>
            Jakmile bude návrh připravený, objeví se na této stránce automaticky.
          </p>
        </Card>
      )}
    </div>
  );
}

function PublishedPairCard({
  leader,
  follower,
  index,
  actual,
}: {
  leader: Member;
  follower: Member;
  index: number;
  actual: boolean;
}) {
  return (
    <article className="pair-card pair-card--published">
      <span className="pair-number">{index + 1}</span>
      <div className="pair-person">
        <Avatar member={leader} />
        <span>
          <strong>{leader.fullName}</strong>
          <small>
            Tanečník · <ExperienceBadge level={leader.experience} />
          </small>
        </span>
      </div>
      <span className="pair-join" aria-hidden="true">
        <Sparkles />
      </span>
      <div className="pair-person">
        <Avatar member={follower} />
        <span>
          <strong>{follower.fullName}</strong>
          <small>
            Tanečnice · <ExperienceBadge level={follower.experience} />
          </small>
        </span>
      </div>
      <Badge tone={actual ? "green" : "amber"}>
        {actual ? "Odtančeno" : "Naplánováno"}
      </Badge>
    </article>
  );
}

function PreferenceManager({
  members,
  preferences,
  loading,
  deleting,
  error,
  onAdd,
  onDelete,
}: {
  members: Member[];
  preferences: PairPreference[];
  loading: boolean;
  deleting: boolean;
  error?: string;
  onAdd: (input: Omit<PairPreference, "id">) => void;
  onDelete: (memberAId: string, memberBId: string) => void;
}) {
  const leaders = members.filter((member) => member.role === "leader");
  const followers = members.filter((member) => member.role === "follower");
  const [leaderId, setLeaderId] = useState("");
  const [followerId, setFollowerId] = useState("");
  const [kind, setKind] = useState<PairPreference["kind"]>("forbidden");
  const [reason, setReason] = useState("");
  const resolvedLeaderId = leaders.some((member) => member.id === leaderId)
    ? leaderId
    : (leaders[0]?.id ?? "");
  const resolvedFollowerId = followers.some(
    (member) => member.id === followerId,
  )
    ? followerId
    : (followers[0]?.id ?? "");
  const kindLabels: Record<PairPreference["kind"], string> = {
    forbidden: "Nesmí spolu",
    discouraged: "Raději nestřídat",
    preferred: "Rádi spolu",
  };

  return (
    <Card className="preference-manager">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Citlivá pravidla</span>
          <h2>Preference párů</h2>
        </div>
      </div>
      <div className="preference-manager__form">
        <Select
          aria-label="Tanečník"
          onChange={(event) => setLeaderId(event.target.value)}
          value={resolvedLeaderId}
        >
          {leaders.map((member) => (
            <option key={member.id} value={member.id}>
              {member.fullName}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Tanečnice"
          onChange={(event) => setFollowerId(event.target.value)}
          value={resolvedFollowerId}
        >
          {followers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.fullName}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Typ preference"
          onChange={(event) =>
            setKind(event.target.value as PairPreference["kind"])
          }
          value={kind}
        >
          {Object.entries(kindLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <input
          aria-label="Soukromá poznámka"
          onChange={(event) => setReason(event.target.value)}
          placeholder="Soukromý důvod (volitelné)"
          value={reason}
        />
        <Button
          disabled={!resolvedLeaderId || !resolvedFollowerId}
          loading={loading}
          onClick={() =>
            onAdd({
              memberAId: resolvedLeaderId,
              memberBId: resolvedFollowerId,
              kind,
              strength: 3,
              privateReason: reason.trim() || undefined,
            })
          }
          size="small"
        >
          Uložit pravidlo
        </Button>
      </div>
      {error ? (
        <p className="inline-error" role="alert">
          Pravidlo se nepodařilo uložit.
        </p>
      ) : null}
      <div className="preference-manager__list">
        {preferences.map((preference) => {
          const first = members.find(
            (member) => member.id === preference.memberAId,
          );
          const second = members.find(
            (member) => member.id === preference.memberBId,
          );
          return (
            <div key={preference.id}>
              <span>
                <strong>
                  {first?.shortName ?? "Neznámý"} +{" "}
                  {second?.shortName ?? "neznámá"}
                </strong>
                <small>{kindLabels[preference.kind]}</small>
              </span>
              <button
                aria-label="Odstranit pravidlo"
                disabled={deleting}
                onClick={() =>
                  onDelete(preference.memberAId, preference.memberBId)
                }
                type="button"
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CandidatePicker({
  members,
  selectedIds,
  search,
  setSearch,
  setSelectedIds,
}: {
  members: Member[];
  selectedIds: Set<string>;
  search: string;
  setSearch: (value: string) => void;
  setSelectedIds: (ids: Set<string>) => void;
}) {
  const filtered = members.filter((member) =>
    member.fullName
      .toLocaleLowerCase("cs")
      .includes(search.trim().toLocaleLowerCase("cs")),
  );

  return (
    <Card className="candidate-picker">
      <header>
        <div>
          <span className="eyebrow">Účastníci</span>
          <h2>Vybráno {selectedIds.size} členů</h2>
        </div>
        <button
          onClick={() =>
            setSelectedIds(
              selectedIds.size === members.length
                ? new Set()
                : new Set(members.map((member) => member.id)),
            )
          }
          type="button"
        >
          {selectedIds.size === members.length ? "Zrušit vše" : "Vybrat vše"}
        </button>
      </header>
      <label className="search-field">
        <Search aria-hidden="true" />
        <span className="sr-only">Hledat účastníka</span>
        <input
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Hledat člena…"
          type="search"
          value={search}
        />
      </label>
      <div className="candidate-list">
        {filtered.map((member) => (
          <label key={member.id}>
            <input
              checked={selectedIds.has(member.id)}
              onChange={(event) => {
                const next = new Set(selectedIds);
                if (event.target.checked) next.add(member.id);
                else next.delete(member.id);
                setSelectedIds(next);
              }}
              type="checkbox"
            />
            <Avatar member={member} size="small" />
            <span>
              <strong>{member.shortName}</strong>
              <small>
                {member.role === "leader" ? "Tanečník" : "Tanečnice"}
              </small>
            </span>
            <ExperienceBadge level={member.experience} />
          </label>
        ))}
      </div>
    </Card>
  );
}

function PairCard({
  first,
  second,
  index,
  pairExplanation,
  locked,
  onToggleLock,
}: {
  first: Member;
  second: Member;
  index: number;
  pairExplanation: string;
  locked: boolean;
  onToggleLock: () => void;
}) {
  const leader = first.role === "leader" ? first : second;
  const follower = first.role === "follower" ? first : second;
  return (
    <article className={`pair-card ${locked ? "is-locked" : ""}`}>
      <span className="pair-number">{index + 1}</span>
      <div className="pair-person">
        <Avatar member={leader} />
        <span>
          <strong>{leader.fullName}</strong>
          <small>
            Tanečník · <ExperienceBadge level={leader.experience} />
          </small>
        </span>
      </div>
      <span className="pair-join" aria-hidden="true">
        <Sparkles />
      </span>
      <div className="pair-person">
        <Avatar member={follower} />
        <span>
          <strong>{follower.fullName}</strong>
          <small>
            Tanečnice · <ExperienceBadge level={follower.experience} />
          </small>
        </span>
      </div>
      <button
        aria-label={locked ? "Odemknout pár" : "Uzamknout pár"}
        aria-pressed={locked}
        className="lock-button"
        onClick={onToggleLock}
        title={locked ? "Pár zůstane při přepočtu" : "Uzamknout pár"}
        type="button"
      >
        {locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
        <span>{locked ? "Uzamčeno" : "Uzamknout"}</span>
      </button>
      <details className="pair-reason">
        <summary>
          <Info aria-hidden="true" />
          Proč tento pár?
          <ChevronDown aria-hidden="true" />
        </summary>
        <p>{pairExplanation}</p>
      </details>
    </article>
  );
}
