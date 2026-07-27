import {
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import {
  experienceLabels,
  roleLabels,
  type ExperienceLevel,
  type Member,
  type PairingRole,
} from "../lib/demoData";
import { databaseQueryKey, useDatabase } from "../components/DataContext";
import { EmptyState, ErrorState, LoadingState } from "../components/DataStates";
import { todayInPrague } from "../components/formatters";
import { formatDate } from "../components/formatters";
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

export function MembersPage({ canEdit }: { canEdit: boolean }) {
  const database = useDatabase();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "all" | "inactive">("active");
  const [role, setRole] = useState<"all" | PairingRole>("all");
  const [editing, setEditing] = useState<Member | "new" | null>(null);

  const addMutation = useMutation({
    mutationFn: appApi.addMember,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: databaseQueryKey });
      setEditing(null);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Member> }) =>
      appApi.updateMember(id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: databaseQueryKey });
      setEditing(null);
    },
  });

  const filteredMembers = useMemo(() => {
    if (!database.data) return [];
    const term = search.trim().toLocaleLowerCase("cs");
    return database.data.members
      .filter((member) => {
        if (status === "active") return member.active;
        if (status === "inactive") return !member.active;
        return true;
      })
      .filter((member) => role === "all" || member.role === role)
      .filter((member) =>
        `${member.fullName} ${member.shortName}`
          .toLocaleLowerCase("cs")
          .includes(term),
      )
      .sort((first, second) =>
        first.fullName.localeCompare(second.fullName, "cs"),
      );
  }, [database.data, role, search, status]);

  if (database.isLoading) return <LoadingState label="Načítám členy…" />;
  if (database.isError || !database.data) {
    return <ErrorState onRetry={() => void database.refetch()} />;
  }

  const activeMembers = database.data.members.filter((member) => member.active);
  const beginners = activeMembers.filter(
    (member) => member.experience === "beginner",
  ).length;

  return (
    <div className="page">
      <PageHeader
        actions={
          canEdit ? (
            <Button onClick={() => setEditing("new")}>
              <UserPlus aria-hidden="true" />
              Přidat člena
            </Button>
          ) : null
        }
        description="Párovací role a zkušenost používá generátor k vyváženým návrhům."
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
                placeholder="Hledat jméno…"
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
                  <th scope="col">Členem od</th>
                  <th scope="col">Stav</th>
                  <th scope="col">
                    <span className="sr-only">Akce</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id}>
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
                    <td data-label="Členem od">
                      {formatDate(member.joinedAt, "MMMM yyyy")}
                    </td>
                    <td data-label="Stav">
                      <Badge tone={member.active ? "green" : "neutral"}>
                        {member.active ? "Aktivní" : "Neaktivní"}
                      </Badge>
                    </td>
                    <td>
                      {canEdit ? (
                        <IconButton
                          label={`Upravit člena ${member.fullName}`}
                          onClick={() => setEditing(member)}
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
        error={addMutation.error?.message ?? updateMutation.error?.message}
        loading={addMutation.isPending || updateMutation.isPending}
        member={editing}
        onClose={() => setEditing(null)}
        onSave={(input) => {
          if (editing === "new") addMutation.mutate(input);
          else if (editing) {
            updateMutation.mutate({ id: editing.id, patch: input });
          }
        }}
      />
    </div>
  );
}

function MemberDialog({
  member,
  loading,
  error,
  onClose,
  onSave,
}: {
  member: Member | "new" | null;
  loading: boolean;
  error?: string;
  onClose: () => void;
  onSave: (input: Omit<Member, "id">) => void;
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
      title={member === "new" ? "Přidat člena" : "Upravit člena"}
    >
      {member ? (
        <MemberForm
          error={error}
          key={member === "new" ? "new" : member.id}
          loading={loading}
          member={member === "new" ? undefined : member}
          onCancel={onClose}
          onSave={onSave}
        />
      ) : null}
    </Dialog>
  );
}

function MemberForm({
  member,
  loading,
  error,
  onCancel,
  onSave,
}: {
  member?: Member;
  loading: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (input: Omit<Member, "id">) => void;
}) {
  const [fullName, setFullName] = useState(member?.fullName ?? "");
  const [shortName, setShortName] = useState(member?.shortName ?? "");
  const [role, setRole] = useState<PairingRole>(member?.role ?? "leader");
  const [experience, setExperience] = useState<ExperienceLevel>(
    member?.experience ?? "beginner",
  );
  const [joinedAt, setJoinedAt] = useState(
    member?.joinedAt ?? todayInPrague(),
  );
  const [active, setActive] = useState(member?.active ?? true);
  const [note, setNote] = useState(member?.note ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      fullName,
      shortName: shortName || fullName,
      role,
      experience,
      joinedAt,
      active,
      note: note || undefined,
    });
  };

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
      <div className="form-grid">
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
      </div>
      <Field htmlFor="member-joined" label="Členem od">
        <input
          id="member-joined"
          onChange={(event) => setJoinedAt(event.target.value)}
          type="date"
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
