import {
  Clock3,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import {
  ageGroupLabel,
  ageGroupLabels,
  attendanceLabels,
  calculateScores,
  eventTypeLabels,
  experienceLabels,
  interestLabels,
  roleLabels,
  type AgeGroup,
  type AppRole,
  type ExperienceLevel,
  type Member,
  type MemberHistoryEntry,
  type PairingRole,
  type ScoreRow,
} from "../lib/domain";
import {
  filterMembers,
  type MemberAgeGroupFilter,
} from "../lib/memberFilters";
import { databaseQueryKey, useDatabase } from "../components/DataContext";
import { DateWithYearInput } from "../components/DateWithYearInput";
import { EmptyState, ErrorState, LoadingState } from "../components/DataStates";
import {
  formatDate,
  formatPoints,
  todayInPrague,
} from "../components/formatters";
import { PageHeader } from "../components/PageHeader";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  ExperienceBadge,
  Field,
  IconButton,
  Select,
  Toggle,
} from "../components/Ui";

interface MemberEditorInput {
  profile: Omit<Member, "id" | "account">;
  account: {
    email: string | null;
    role: AppRole;
  };
}

export function MembersPage({ canEdit }: { canEdit: boolean }) {
  const database = useDatabase();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "all" | "inactive">("active");
  const [role, setRole] = useState<"all" | PairingRole>("all");
  const [ageGroup, setAgeGroup] = useState<MemberAgeGroupFilter>("all");
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const editingMemberId =
    editing !== null && editing !== "new" ? editing.id : null;

  const memberHistoryQuery = useQuery({
    queryKey: ["member-history", editingMemberId],
    queryFn: () =>
      editingMemberId ? appApi.getMemberHistory(editingMemberId) : [],
    enabled: Boolean(canEdit && editingMemberId),
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      target,
      input,
    }: {
      target: Member | "new";
      input: MemberEditorInput;
    }) => {
      const savedMember =
        target === "new"
          ? await appApi.addMember(input.profile)
          : await appApi.updateMember(target.id, input.profile);

      const existingAccount = target === "new" ? undefined : target.account;
      if (input.account.email || existingAccount) {
        await appApi.updateMemberAccount(
          savedMember.id,
          input.account.email,
          input.account.role,
        );
      }

      return savedMember;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: databaseQueryKey });
      setEditing(null);
    },
  });
  const invitationMutation = useMutation({
    mutationFn: appApi.sendMemberInvitation,
    onSuccess: async (account) => {
      setEditing((current) =>
        current !== null &&
        current !== "new" &&
        current.id === account.memberId
          ? { ...current, account }
          : current,
      );
      await queryClient.invalidateQueries({ queryKey: databaseQueryKey });
    },
  });

  const openEditor = (member: Member | "new") => {
    saveMutation.reset();
    invitationMutation.reset();
    setEditing(member);
  };

  const closeEditor = () => {
    saveMutation.reset();
    invitationMutation.reset();
    setEditing(null);
  };

  const filteredMembers = useMemo(() => {
    if (!database.data) return [];
    return filterMembers(database.data.members, {
      ageGroup,
      role,
      search,
      status,
    });
  }, [ageGroup, database.data, role, search, status]);

  if (database.isLoading) return <LoadingState label="Načítám členy…" />;
  if (database.isError || !database.data) {
    return <ErrorState onRetry={() => void database.refetch()} />;
  }

  const activeMembers = database.data.members.filter((member) => member.active);
  const unassignedMembers = database.data.members.filter(
    (member) => member.ageGroup === null,
  ).length;
  const beginners = activeMembers.filter(
    (member) => member.experience === "beginner",
  ).length;
  const fallbackHistory =
    editingMemberId === database.data.myMemberId
      ? database.data.myHistory
      : undefined;
  const memberHistory = memberHistoryQuery.data ?? fallbackHistory;
  const memberScore = editingMemberId
    ? calculateScores(database.data).find(
        (score) => score.member.id === editingMemberId,
      )
    : undefined;

  return (
    <div className="page">
      <PageHeader
        actions={
          canEdit ? (
            <Button onClick={() => openEditor("new")}>
              <UserPlus aria-hidden="true" />
              Přidat člena
            </Button>
          ) : null
        }
        description="Zařazení usnadňuje přehled a filtrování; párovací role a zkušenost používá generátor párů."
        eyebrow="Správa souboru"
        title="Členové"
      />

      <section className="member-stats">
        <Card>
          <span className="member-stat-icon">
            <UsersRound aria-hidden="true" />
          </span>
          <span>
            <small>Aktivních členů</small>
            <strong>{activeMembers.length}</strong>
          </span>
        </Card>
        <Card>
          <span className="member-stat-icon member-stat-icon--red">
            <UserCheck aria-hidden="true" />
          </span>
          <span>
            <small>Tanečníci / tanečnice</small>
            <strong>
              {activeMembers.filter((member) => member.role === "leader").length}
              {" / "}
              {activeMembers.filter((member) => member.role === "follower").length}
            </strong>
          </span>
        </Card>
        <Card>
          <span className="member-stat-icon member-stat-icon--amber">
            <ShieldCheck aria-hidden="true" />
          </span>
          <span>
            <small>Začátečníci</small>
            <strong>{beginners}</strong>
          </span>
        </Card>
      </section>

      <Card className="members-card">
        <header className="members-card__header">
          <div className="filter-tabs" role="tablist" aria-label="Stav členství">
            {(
              [
                ["active", "Aktivní"],
                ["all", "Všichni"],
                ["inactive", "Neaktivní"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-selected={status === value}
                className={status === value ? "is-active" : ""}
                key={value}
                onClick={() => setStatus(value)}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="members-filters">
            <label className="search-field">
              <Search aria-hidden="true" />
              <span className="sr-only">Hledat člena</span>
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Hledat jméno nebo zařazení…"
                type="search"
                value={search}
              />
            </label>
            <Select
              aria-label="Filtrovat roli"
              onChange={(event) =>
                setRole(event.target.value as "all" | PairingRole)
              }
              value={role}
            >
              <option value="all">Všechny role</option>
              <option value="leader">Tanečníci</option>
              <option value="follower">Tanečnice</option>
            </Select>
            <Select
              aria-label="Filtrovat zařazení"
              onChange={(event) =>
                setAgeGroup(event.target.value as MemberAgeGroupFilter)
              }
              value={ageGroup}
            >
              <option value="all">Všechna zařazení</option>
              <option value="young">Mladí</option>
              <option value="old">Staří</option>
              <option value="unassigned">
                Nezařazeno ({unassignedMembers})
              </option>
            </Select>
          </div>
        </header>

        {filteredMembers.length ? (
          <div className="responsive-table">
            <table className="members-table">
              <thead>
                <tr>
                  <th scope="col">Člen</th>
                  <th scope="col">Párovací role</th>
                  <th scope="col">Zkušenost</th>
                  <th scope="col">Zařazení</th>
                  <th scope="col">Členem od</th>
                  <th scope="col">Stav</th>
                  <th scope="col">Účet</th>
                  <th scope="col">
                    <span className="sr-only">Akce</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr
                    aria-label={
                      canEdit
                        ? `Otevřít detail člena ${member.fullName}`
                        : undefined
                    }
                    className={canEdit ? "is-clickable" : undefined}
                    key={member.id}
                    onClick={() => {
                      if (canEdit) openEditor(member);
                    }}
                    onKeyDown={(event) => {
                      if (
                        canEdit &&
                        event.target === event.currentTarget &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        openEditor(member);
                      }
                    }}
                    tabIndex={canEdit ? 0 : undefined}
                  >
                    <td>
                      <div className="member-cell">
                        <Avatar member={member} />
                        <span>
                          <strong>{member.fullName}</strong>
                          <small>{member.shortName}</small>
                        </span>
                      </div>
                    </td>
                    <td data-label="Role">{roleLabels[member.role]}</td>
                    <td data-label="Zkušenost">
                      <ExperienceBadge level={member.experience} />
                    </td>
                    <td data-label="Zařazení">
                      <MemberAgeGroupBadge ageGroup={member.ageGroup} />
                    </td>
                    <td data-label="Členem od">
                      {formatDate(member.joinedAt, "MMMM yyyy")}
                    </td>
                    <td data-label="Stav">
                      <Badge tone={member.active ? "green" : "neutral"}>
                        {member.active ? "Aktivní" : "Neaktivní"}
                      </Badge>
                    </td>
                    <td data-label="Účet">
                      <MemberAccountStatus member={member} />
                    </td>
                    <td>
                      {canEdit ? (
                        <IconButton
                          label={`Upravit člena ${member.fullName}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditor(member);
                          }}
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </IconButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            description="Zkuste změnit hledaný výraz nebo filtr."
            title="Žádní členové neodpovídají filtru"
          />
        )}
      </Card>

      <MemberDialog
        error={saveMutation.error?.message}
        history={memberHistory}
        historyError={
          !fallbackHistory && memberHistoryQuery.isError
            ? memberHistoryQuery.error.message
            : undefined
        }
        historyLoading={memberHistoryQuery.isLoading && !fallbackHistory}
        invitationError={invitationMutation.error?.message}
        invitationLoading={invitationMutation.isPending}
        loading={saveMutation.isPending}
        member={editing}
        score={memberScore}
        onClose={closeEditor}
        onInvite={(memberId) => invitationMutation.mutate(memberId)}
        onSave={(input) => {
          if (editing) saveMutation.mutate({ target: editing, input });
        }}
      />
    </div>
  );
}

function MemberAgeGroupBadge({
  ageGroup,
}: {
  ageGroup: AgeGroup | null;
}) {
  const tone =
    ageGroup === "young" ? "blue" : ageGroup === "old" ? "purple" : "neutral";
  return (
    <Badge tone={tone}>{ageGroupLabel(ageGroup)}</Badge>
  );
}

function MemberAccountStatus({ member }: { member: Member }) {
  const account = member.account;

  return (
    <div className="member-account-status">
      {account?.activatedAt ? (
        <Badge tone="green">Účet aktivní</Badge>
      ) : account?.email ? (
        <Badge tone="amber">Čeká na přihlášení</Badge>
      ) : (
        <Badge tone="neutral">Bez e-mailu</Badge>
      )}
      {account?.email ? (
        <small title={account.email}>{account.email}</small>
      ) : null}
      {account?.email ? (
        <small>{account.role === "admin" ? "Správce" : "Uživatel"}</small>
      ) : null}
    </div>
  );
}

function MemberDialog({
  member,
  score,
  loading,
  error,
  invitationLoading,
  invitationError,
  history,
  historyLoading,
  historyError,
  onClose,
  onInvite,
  onSave,
}: {
  member: Member | "new" | null;
  score?: ScoreRow;
  loading: boolean;
  error?: string;
  invitationLoading: boolean;
  invitationError?: string;
  history?: MemberHistoryEntry[];
  historyLoading: boolean;
  historyError?: string;
  onClose: () => void;
  onInvite: (memberId: string) => void;
  onSave: (input: MemberEditorInput) => void;
}) {
  return (
    <Dialog
      description={
        member === "new"
          ? "Údaje lze kdykoli později změnit."
          : "Změny ovlivní budoucí návrhy párů."
      }
      onClose={onClose}
      open={member !== null}
      size="large"
      title={member === "new" ? "Přidat člena" : "Upravit člena"}
    >
      {member ? (
        <MemberForm
          error={error}
          history={history}
          historyError={historyError}
          historyLoading={historyLoading}
          invitationError={invitationError}
          invitationLoading={invitationLoading}
          key={member === "new" ? "new" : member.id}
          loading={loading}
          member={member === "new" ? undefined : member}
          score={score}
          onCancel={onClose}
          onInvite={onInvite}
          onSave={onSave}
        />
      ) : null}
    </Dialog>
  );
}

function MemberForm({
  member,
  score,
  loading,
  error,
  invitationLoading,
  invitationError,
  history,
  historyLoading,
  historyError,
  onCancel,
  onInvite,
  onSave,
}: {
  member?: Member;
  score?: ScoreRow;
  loading: boolean;
  error?: string;
  invitationLoading: boolean;
  invitationError?: string;
  history?: MemberHistoryEntry[];
  historyLoading: boolean;
  historyError?: string;
  onCancel: () => void;
  onInvite: (memberId: string) => void;
  onSave: (input: MemberEditorInput) => void;
}) {
  const [fullName, setFullName] = useState(member?.fullName ?? "");
  const [shortName, setShortName] = useState(member?.shortName ?? "");
  const [role, setRole] = useState<PairingRole>(member?.role ?? "leader");
  const [experience, setExperience] = useState<ExperienceLevel>(
    member?.experience ?? "beginner",
  );
  const [ageGroup, setAgeGroup] = useState<AgeGroup | "">(
    member?.ageGroup ?? "",
  );
  const [joinedAt, setJoinedAt] = useState(
    member?.joinedAt ?? todayInPrague(),
  );
  const [active, setActive] = useState(member?.active ?? true);
  const [note, setNote] = useState(member?.note ?? "");
  const [email, setEmail] = useState(member?.account?.email ?? "");
  const [accountRole, setAccountRole] = useState<AppRole>(
    member?.account?.role ?? "member",
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      profile: {
        fullName,
        shortName: shortName || fullName,
        role,
        experience,
        ageGroup: ageGroup || null,
        joinedAt,
        active,
        note: note || undefined,
      },
      account: {
        email: normalizeEmail(email) || null,
        role: accountRole,
      },
    });
  };

  const savedEmail = normalizeEmail(member?.account?.email ?? "");
  const emailChanged = normalizeEmail(email) !== savedEmail;
  const accountActive = Boolean(member?.account?.activatedAt);

  return (
    <form className="dialog-form" onSubmit={submit}>
      <div className="form-grid">
        <Field htmlFor="member-name" label="Celé jméno">
          <input
            autoFocus
            id="member-name"
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Jan Novák"
            required
            value={fullName}
          />
        </Field>
        <Field htmlFor="member-short-name" label="Zkrácené jméno">
          <input
            id="member-short-name"
            onChange={(event) => setShortName(event.target.value)}
            placeholder="Jan N."
            value={shortName}
          />
        </Field>
      </div>
      <div className="form-grid form-grid--3">
        <Field htmlFor="member-role" label="Párovací role">
          <Select
            id="member-role"
            onChange={(event) => setRole(event.target.value as PairingRole)}
            value={role}
          >
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field htmlFor="member-experience" label="Zkušenost">
          <Select
            id="member-experience"
            onChange={(event) =>
              setExperience(event.target.value as ExperienceLevel)
            }
            value={experience}
          >
            {Object.entries(experienceLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          hint="Slouží pro přehled a filtrování; neovlivňuje párování."
          htmlFor="member-age-group"
          label="Zařazení"
        >
          <Select
            id="member-age-group"
            onChange={(event) =>
              setAgeGroup(event.target.value as AgeGroup | "")
            }
            value={ageGroup}
          >
            <option value="">Nezařazeno</option>
            {Object.entries(ageGroupLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        hint="Rok můžete napsat rovnou, bez proklikávání kalendáře."
        htmlFor="member-joined"
        label="Členem od"
      >
        <DateWithYearInput
          id="member-joined"
          onChange={setJoinedAt}
          value={joinedAt}
        />
      </Field>
      <Field htmlFor="member-note" label="Interní poznámka">
        <textarea
          id="member-note"
          onChange={(event) => setNote(event.target.value)}
          placeholder="Vidí pouze správci."
          rows={3}
          value={note}
        />
      </Field>
      <Toggle
        checked={active}
        description="Neaktivní člen se nezařadí do docházky ani generátoru."
        label="Aktivní člen"
        onChange={setActive}
      />

      <section className="member-account-editor">
        <header>
          <span className="member-account-editor__icon">
            <Mail aria-hidden="true" />
          </span>
          <span>
            <strong>Přístup do aplikace</strong>
            <small>E-mail slouží pro přihlášení odkazem i kódem.</small>
          </span>
        </header>

        <div className="form-grid">
          <Field
            hint="Bez uloženého e-mailu se člen nemůže přihlásit."
            htmlFor="member-email"
            label="Přihlašovací e-mail"
          >
            <input
              autoComplete="email"
              id="member-email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="clen@example.cz"
              type="email"
              value={email}
            />
          </Field>
          <Field
            hint="Správce může měnit členy, docházku a nastavení."
            htmlFor="member-account-role"
            label="Role účtu"
          >
            <Select
              id="member-account-role"
              onChange={(event) =>
                setAccountRole(event.target.value as AppRole)
              }
              value={accountRole}
            >
              <option value="member">Uživatel</option>
              <option value="admin">Správce</option>
            </Select>
          </Field>
        </div>

        {member ? (
          <div className="member-account-editor__state">
            <div>
              {accountActive ? (
                <Badge tone="green">Účet aktivní</Badge>
              ) : savedEmail ? (
                <Badge tone="amber">Čeká na první přihlášení</Badge>
              ) : (
                <Badge tone="neutral">E-mail zatím není uložen</Badge>
              )}
              <AccountTimestamps member={member} />
            </div>
            {savedEmail && !accountActive ? (
              <Button
                disabled={emailChanged || loading}
                loading={invitationLoading}
                onClick={() => onInvite(member.id)}
                type="button"
                variant="secondary"
              >
                <Send aria-hidden="true" />
                Poslat pozvánku
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="member-account-editor__hint">
            Pozvánku bude možné poslat po prvním uložení člena.
          </p>
        )}
        {emailChanged && savedEmail && !accountActive ? (
          <p className="member-account-editor__hint">
            Před odesláním pozvánky nejdřív uložte změnu e-mailu.
          </p>
        ) : null}
        {invitationError ? (
          <p className="form-error">{invitationError}</p>
        ) : null}
      </section>

      {member ? (
        <>
          <MemberScoreSummary score={score} />
          <MemberHistory
            error={historyError}
            history={history}
            loading={historyLoading}
          />
        </>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <footer className="dialog-actions">
        <Button onClick={onCancel} type="button" variant="ghost">
          Zrušit
        </Button>
        <Button loading={loading} type="submit">
          {member ? (
            "Uložit změny"
          ) : (
            <>
              <Plus aria-hidden="true" />
              Přidat člena
            </>
          )}
        </Button>
      </footer>
    </form>
  );
}

function AccountTimestamps({ member }: { member: Member }) {
  const account = member.account;
  if (!account?.lastInvitationSentAt && !account?.lastSignInAt) return null;

  return (
    <span className="member-account-timestamps">
      <Clock3 aria-hidden="true" />
      <span>
        {account.lastInvitationSentAt ? (
          <small>
            Poslední pozvánka{" "}
            {formatAccountTimestamp(account.lastInvitationSentAt)}
          </small>
        ) : null}
        {account.lastSignInAt ? (
          <small>
            Poslední přihlášení {formatAccountTimestamp(account.lastSignInAt)}
          </small>
        ) : null}
      </span>
    </span>
  );
}

function MemberScoreSummary({ score }: { score?: ScoreRow }) {
  return (
    <section className="member-admin-score">
      <header>
        <span>
          <strong>Souhrn bodů</strong>
          <small>Body a účast podle uzavřených událostí.</small>
        </span>
      </header>
      <dl>
        <div className="member-admin-score__total">
          <dt>Celkem</dt>
          <dd>{formatPoints(score?.total ?? 0)} b.</dd>
        </div>
        <div>
          <dt>Účast</dt>
          <dd>{Math.round(score?.attendanceRate ?? 0)} %</dd>
        </div>
        <div>
          <dt>Zkoušky</dt>
          <dd>{formatPoints(score?.rehearsal ?? 0)} b.</dd>
        </div>
        <div>
          <dt>Vystoupení</dt>
          <dd>{formatPoints(score?.performance ?? 0)} b.</dd>
        </div>
      </dl>
    </section>
  );
}

function MemberHistory({
  history,
  loading,
  error,
}: {
  history?: MemberHistoryEntry[];
  loading: boolean;
  error?: string;
}) {
  const orderedHistory = [...(history ?? [])].sort((first, second) =>
    second.date.localeCompare(first.date),
  );

  return (
    <section className="member-admin-history">
      <header>
        <span>
          <strong>Historie člena</strong>
          <small>Účast, odpovědi, body a potvrzené taneční páry.</small>
        </span>
      </header>
      {loading ? (
        <p aria-live="polite" className="member-admin-history__empty">
          Načítám historii…
        </p>
      ) : error ? (
        <p className="form-error">
          Historii se nepodařilo načíst. {error}
        </p>
      ) : orderedHistory.length ? (
        <div className="member-admin-history__list">
          {orderedHistory.map((entry) => (
            <article key={entry.eventId}>
              <div className="member-admin-history__title">
                <span>
                  <strong>{entry.title}</strong>
                  <small>
                    {formatDate(entry.date)} · {eventTypeLabels[entry.type]}
                  </small>
                </span>
                <strong>{formatPoints(entry.points)} b.</strong>
              </div>
              <div className="member-admin-history__facts">
                <span>Odpověď: {interestLabels[entry.response]}</span>
                <span>Docházka: {attendanceLabels[entry.attendance]}</span>
              </div>
              {entry.pairs.length ? (
                <ul>
                  {entry.pairs.map((pair, index) => (
                    <li
                      key={`${entry.eventId}-${pair.partnerId}-${pair.blockName ?? index}`}
                    >
                      {pair.partnerName}
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
        </div>
      ) : (
        <p className="member-admin-history__empty">Zatím bez historie.</p>
      )}
    </section>
  );
}

function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase("cs");
}

function formatAccountTimestamp(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
