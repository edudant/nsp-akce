import {
  Archive,
  Check,
  Clipboard,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCcw,
  Save,
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ProgramCatalogItem,
  SessionUser,
  Member,
  AppRole,
} from "../lib/domain";
import { appApi } from "../lib/dataApi";
import { rotateSharedAccessCode } from "../lib/settingsApi";
import { databaseQueryKey, useDatabase } from "../components/DataContext";
import { ErrorState, LoadingState } from "../components/DataStates";
import { formatDate } from "../components/formatters";
import { PageHeader } from "../components/PageHeader";
import { Badge, Button, Card, Dialog, Field, Select } from "../components/Ui";
import { SeasonsPanel, SongsSettings } from "../components/FeatureSettings";
import { ListHeader, ListRow } from "../components/CompactList";
import { MemberLoginCode } from "../components/MemberLoginCode";
import { Help } from "../components/Help";

const sectionTitles: Record<string, string> = {
  sezony: "Sezóny",
  pasma: "Pásma",
  pisne: "Písně",
  pristupy: "Přístupy",
  data: "Data",
};
export function SettingsPage({
  session,
  canEdit,
  section = "pristupy",
}: {
  session: SessionUser;
  canEdit: boolean;
  section?: string;
}) {
  const database = useDatabase();
  const [codeVisible, setCodeVisible] = useState(false);
  const [sharedCode, setSharedCode] = useState<string | null>(null);
  const rotateCode = useMutation({
    mutationFn: rotateSharedAccessCode,
    onSuccess: (code) => {
      setSharedCode(code);
      setCodeVisible(true);
    },
  });
  if (database.isLoading) return <LoadingState label="Načítám nastavení…" />;
  if (!database.data || database.isError)
    return <ErrorState onRetry={() => void database.refetch()} />;
  const db = database.data;
  return (
    <div className="page">
      <PageHeader
        title={sectionTitles[section] ?? "Přístupy"}
        eyebrow="Nastavení"
        description="Správa souboru. Vyberte položku ze seznamu a otevřete její detail."
      />
      {section === "sezony" && <SeasonsPanel canEdit={canEdit} />}
      {section === "pisne" && <SongsSettings canEdit={canEdit} />}
      {section === "pasma" && (
        <ProgramCatalogSettings
          canEdit={canEdit}
          items={db.programCatalog ?? []}
        />
      )}
      {section === "pristupy" && (
        <>
          <AccountsSettings members={db.members} canEdit={canEdit} />
          <AccessSettings
            canEdit={canEdit}
            session={session}
            code={sharedCode}
            codeVisible={codeVisible}
            loading={rotateCode.isPending}
            error={rotateCode.error?.message}
            onCodeVisible={setCodeVisible}
            onRegenerate={() => rotateCode.mutate()}
          />
        </>
      )}
      {section === "data" && (
        <DataSettings
          memberCount={db.members.length}
          eventCount={db.events.length}
          updatedAt={db.updatedAt}
        />
      )}
    </div>
  );
}
function SettingsCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="settings-card">
      <header>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="settings-card__body">{children}</div>
    </Card>
  );
}
function ProgramCatalogSettings({
  canEdit,
  items,
}: {
  canEdit: boolean;
  items: ProgramCatalogItem[];
}) {
  const query = useQueryClient();
  const initial: Omit<ProgramCatalogItem, "id"> & { id?: string } = {
    name: "",
    active: true,
    sortOrder: Math.max(0, ...items.map((i) => i.sortOrder)) + 10,
  };
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const save = useMutation({
    mutationFn: appApi.saveProgramCatalogItem,
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: databaseQueryKey });
      setEditing(false);
    },
  });
  return (
    <Card className="feature-card">
      <ListHeader
        title="Pásma"
        addLabel="Nové pásmo"
        onAdd={
          canEdit
            ? () => {
                setDraft(initial);
                setEditing(true);
              }
            : undefined
        }
      />
      <Help>
        <p>
          Pásma se nabízejí v programu tanečního vystoupení. Skrytí pásma
          zachová historický program; jednorázový název můžete zadat přímo na
          akci.
        </p>
      </Help>
      <input
        className="list-search"
        aria-label="Hledat pásmo"
        placeholder="Hledat pásmo…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="compact-list">
        {items
          .slice()
          .sort(
            (a, b) =>
              a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "cs"),
          )
          .filter((i) =>
            i.name
              .toLocaleLowerCase("cs")
              .includes(search.toLocaleLowerCase("cs")),
          )
          .map((i) => (
            <ListRow
              key={i.id}
              title={i.name}
              subtitle={`Pořadí ${i.sortOrder}`}
              meta={
                <Badge tone={i.active ? "green" : undefined}>
                  {i.active ? "Aktivní" : "Skryté"}
                </Badge>
              }
              onOpen={() => {
                setDraft(i);
                setEditing(true);
              }}
            />
          ))}
      </div>
      <Dialog
        open={editing}
        title={draft.id ? "Detail pásma" : "Nové pásmo"}
        onClose={() => setEditing(false)}
      >
        <form
          className="dialog-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(draft);
          }}
        >
          <Field label="Název pásma">
            <input
              aria-label="Název pásma"
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Pořadí">
            <input
              aria-label="Pořadí pásma"
              type="number"
              min="0"
              required
              value={draft.sortOrder}
              onChange={(e) =>
                setDraft({ ...draft, sortOrder: Number(e.target.value) })
              }
            />
          </Field>
          <label>
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />{" "}
            Nabízet na nových akcích
          </label>
          <Button type="submit" disabled={!canEdit} loading={save.isPending}>
            <Save aria-hidden="true" />
            Uložit pásmo
          </Button>
          {save.error && (
            <p role="alert" className="form-error">
              {save.error.message}
            </p>
          )}
        </form>
      </Dialog>
    </Card>
  );
}
function AccountsSettings({
  members,
  canEdit,
}: {
  members: Member[];
  canEdit: boolean;
}) {
  const query = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    memberId: "",
    email: "",
    role: "member" as AppRole,
  });
  const save = useMutation({
    mutationFn: () =>
      appApi.updateMemberAccount(
        draft.memberId,
        draft.email.trim() || null,
        draft.role,
      ),
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: databaseQueryKey });
      setEditing(false);
    },
  });
  const target = members.find((m) => m.id === draft.memberId);
  return (
    <Card className="feature-card">
      <ListHeader
        title="Členské přístupy"
        addLabel="Nový přístup"
        onAdd={
          canEdit
            ? () => {
                setDraft({ memberId: "", email: "", role: "member" });
                setEditing(true);
              }
            : undefined
        }
      />
      <Help>
        <p>
          Každý členský přístup je propojený s evidovaným členem a e-mailem.
          Role správce umožní měnit data. Změna e-mailu vyžaduje nové propojení
          účtu; historie člena zůstává.
        </p>
      </Help>
      <input
        className="list-search"
        aria-label="Hledat přístup"
        placeholder="Jméno nebo e-mail…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="compact-list">
        {members
          .filter(
            (m) =>
              m.account &&
              `${m.fullName} ${m.account.email}`
                .toLocaleLowerCase("cs")
                .includes(search.toLocaleLowerCase("cs")),
          )
          .sort((a, b) => a.fullName.localeCompare(b.fullName, "cs"))
          .map((m) => (
            <ListRow
              key={m.id}
              title={m.fullName}
              subtitle={m.account?.email ?? "Bez e-mailu"}
              meta={
                <Badge tone={m.account?.role === "admin" ? "green" : undefined}>
                  {m.account?.role === "admin" ? "Správce" : "Člen"}
                </Badge>
              }
              onOpen={() => {
                setDraft({
                  memberId: m.id,
                  email: m.account?.email ?? "",
                  role: m.account?.role ?? "member",
                });
                setEditing(true);
              }}
            />
          ))}
      </div>
      <Dialog
        open={editing}
        title={target?.account ? `Přístup: ${target.fullName}` : "Nový přístup"}
        onClose={() => setEditing(false)}
      >
        <form
          className="dialog-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Člen">
            <Select
              aria-label="Člen pro přístup"
              required
              value={draft.memberId}
              disabled={!!target?.account}
              onChange={(e) => setDraft({ ...draft, memberId: e.target.value })}
            >
              <option value="">Vyberte člena</option>
              {members
                .filter((m) => !m.account || m.id === draft.memberId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="E-mail">
            <input
              aria-label="E-mail přístupu"
              type="email"
              required
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <Select
              aria-label="Role přístupu"
              value={draft.role}
              onChange={(e) =>
                setDraft({ ...draft, role: e.target.value as AppRole })
              }
            >
              <option value="member">Člen</option>
              <option value="admin">Správce</option>
            </Select>
          </Field>
          {target?.account && (
            <p>
              {target.account.linkedUserId
                ? "Účet je aktivovaný."
                : "Účet čeká na první přihlášení."}
            </p>
          )}
          <Button type="submit" disabled={!canEdit} loading={save.isPending}>
            Uložit přístup
          </Button>
          {save.error && (
            <p role="alert" className="form-error">
              {save.error.message}
            </p>
          )}
        </form>
        {target?.account?.email && (
          <MemberLoginCode memberId={target.id} disabled={!canEdit} />
        )}
      </Dialog>
    </Card>
  );
}

function AccessSettings({
  session,
  canEdit,
  code,
  codeVisible,
  loading,
  error,
  onCodeVisible,
  onRegenerate,
}: {
  session: SessionUser;
  canEdit: boolean;
  code: string | null;
  codeVisible: boolean;
  loading: boolean;
  error?: string;
  onCodeVisible: (visible: boolean) => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <SettingsCard
        description="Správci se přihlašují vlastním e-mailem. Členské účty se spravují v kartách členů."
        eyebrow="Oprávnění"
        title="Uživatelé aplikace"
      >
        <div className="access-user">
          <span className="profile-avatar" aria-hidden="true">
            {session.displayName
              .split(" ")
              .map((word) => word[0])
              .join("")
              .slice(0, 2)}
          </span>
          <span>
            <strong>{session.displayName}</strong>
            <small>{session.email || "E-mail není dostupný"}</small>
          </span>
          <Badge tone="green">Správce</Badge>
        </div>
      </SettingsCard>

      <SettingsCard
        description="Členové se přihlásí společným kódem pouze ke čtení."
        eyebrow="Členský náhled"
        title="Společný přístupový kód"
      >
        <div className="shared-code">
          <KeyRound aria-hidden="true" />
          <code>
            {code
              ? codeVisible
                ? code
                : "•••• •••• ••••"
              : "Aktuální kód je skrytý"}
          </code>
          <button
            aria-label={codeVisible ? "Skrýt kód" : "Zobrazit kód"}
            disabled={!code}
            onClick={() => onCodeVisible(!codeVisible)}
            type="button"
          >
            {codeVisible ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
          </button>
          <button
            aria-label="Kopírovat kód"
            disabled={!code}
            onClick={() => void copyCode()}
            type="button"
          >
            {copied ? (
              <Check aria-hidden="true" />
            ) : (
              <Clipboard aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="shared-code-actions">
          <p>
            {code
              ? "Nový kód se zobrazí pouze teď. Uložte si ho na bezpečné místo."
              : "Aktuální kód databáze zpětně neukazuje. Vygenerováním nového se předchozí kód i členské relace zneplatní."}
          </p>
          <Button
            disabled={!canEdit}
            loading={loading}
            onClick={onRegenerate}
            size="small"
            variant="secondary"
          >
            <RefreshCcw aria-hidden="true" />
            Vygenerovat nový
          </Button>
        </div>
        {error ? (
          <div className="form-message form-message--error" role="alert">
            {error}
          </div>
        ) : null}
      </SettingsCard>
    </>
  );
}

function DataSettings({
  memberCount,
  eventCount,
  updatedAt,
}: {
  memberCount: number;
  eventCount: number;
  updatedAt: string;
}) {
  return (
    <>
      <SettingsCard
        description="Přehled dat uložených v aktuálním prostředí."
        eyebrow="Databáze"
        title="Stav dat"
      >
        <dl className="data-overview">
          <div>
            <dt>Členové</dt>
            <dd>{memberCount}</dd>
          </div>
          <div>
            <dt>Akce</dt>
            <dd>{eventCount}</dd>
          </div>
          <div>
            <dt>Poslední změna</dt>
            <dd>{formatDate(updatedAt.slice(0, 10))}</dd>
          </div>
          <div>
            <dt>Prostředí</dt>
            <dd>
              <Badge tone="green">Supabase</Badge>
            </dd>
          </div>
        </dl>
        <div className="backup-row">
          <span>
            <Archive aria-hidden="true" />
            <span>
              <strong>Pravidelný export</strong>
              <small>
                Schéma je verzované v repozitáři; data jsou uložená v Supabase.
              </small>
            </span>
          </span>
          <Badge tone="blue">Připraveno</Badge>
        </div>
      </SettingsCard>
    </>
  );
}
