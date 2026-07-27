import {
  Archive,
  Calculator,
  Check,
  Clipboard,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  RefreshCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import { type SessionUser } from "../lib/demoData";
import { rotateSharedAccessCode } from "../lib/settingsApi";
import { isSupabaseConfigured } from "../lib/supabase";
import { databaseQueryKey, useDatabase } from "../components/DataContext";
import { ErrorState, LoadingState } from "../components/DataStates";
import { formatDate } from "../components/formatters";
import { PageHeader } from "../components/PageHeader";
import { Badge, Button, Card, Dialog, Field, Select, Toggle } from "../components/Ui";

type SettingsSection = "season" | "scoring" | "pairing" | "access" | "data";

const sections: Array<{
  id: SettingsSection;
  label: string;
  icon: typeof Settings2;
}> = [
  { id: "season", label: "Sezona a události", icon: Settings2 },
  { id: "scoring", label: "Bodování", icon: Calculator },
  { id: "pairing", label: "Pravidla párování", icon: Sparkles },
  { id: "access", label: "Přístup a role", icon: ShieldCheck },
  { id: "data", label: "Data a zálohy", icon: Database },
];

export function SettingsPage({
  session,
  canEdit,
}: {
  session: SessionUser;
  canEdit: boolean;
}) {
  const database = useDatabase();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<SettingsSection>(
    isSupabaseConfigured ? "access" : "season",
  );
  const [saved, setSaved] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [codeVisible, setCodeVisible] = useState(false);
  const [sharedCode, setSharedCode] = useState<string | null>(
    isSupabaseConfigured ? null : "NSP-demo-2026",
  );

  const resetMutation = useMutation({
    mutationFn: appApi.reset,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: databaseQueryKey });
      setResetOpen(false);
      setSaved("Ukázková data byla obnovena");
      window.setTimeout(() => setSaved(""), 2200);
    },
  });
  const rotateCodeMutation = useMutation({
    mutationFn: rotateSharedAccessCode,
    onSuccess: (newCode) => {
      setSharedCode(newCode);
      setCodeVisible(true);
      setSaved("Nový přístupový kód je aktivní");
      window.setTimeout(() => setSaved(""), 2200);
    },
  });

  if (database.isLoading) return <LoadingState label="Načítám nastavení…" />;
  if (database.isError || !database.data) {
    return <ErrorState onRetry={() => void database.refetch()} />;
  }

  const confirmSaved = () => {
    setSaved("Nastavení je uložené");
    window.setTimeout(() => setSaved(""), 2200);
  };
  const availableSections = isSupabaseConfigured
    ? sections.filter((item) => item.id === "access" || item.id === "data")
    : sections;

  return (
    <div className="page">
      <PageHeader
        actions={
          saved ? (
            <span aria-live="polite" className="save-indicator">
              <Check aria-hidden="true" />
              {saved}
            </span>
          ) : null
        }
        description="Výchozí pravidla můžete změnit i bez zásahu do zdrojového kódu."
        eyebrow="Správa aplikace"
        title="Nastavení"
      />

      {!canEdit ? (
        <div className="info-callout">
          <LockKeyhole aria-hidden="true" />
          <div>
            <strong>Nastavení je pouze pro správce</strong>
            <p>V členském náhledu můžete zkontrolovat aktuální pravidla, ne je měnit.</p>
          </div>
        </div>
      ) : null}

      <div className="settings-layout">
        <Card className="settings-nav">
          {availableSections.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-current={section === item.id ? "page" : undefined}
                className={section === item.id ? "is-active" : ""}
                key={item.id}
                onClick={() => setSection(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </Card>

        <div className="settings-content">
          {section === "season" ? (
            <SeasonSettings canEdit={canEdit} onSave={confirmSaved} />
          ) : null}
          {section === "scoring" ? (
            <ScoringSettings canEdit={canEdit} onSave={confirmSaved} />
          ) : null}
          {section === "pairing" ? (
            <PairingSettings canEdit={canEdit} onSave={confirmSaved} />
          ) : null}
          {section === "access" ? (
            <AccessSettings
              canEdit={canEdit}
              code={sharedCode}
              codeVisible={codeVisible}
              error={rotateCodeMutation.error?.message}
              loading={rotateCodeMutation.isPending}
              onCodeVisible={setCodeVisible}
              onRegenerate={() => rotateCodeMutation.mutate()}
              session={session}
            />
          ) : null}
          {section === "data" ? (
            <DataSettings
              canEdit={canEdit}
              eventCount={database.data.events.length}
              memberCount={database.data.members.length}
              onReset={() => setResetOpen(true)}
              production={isSupabaseConfigured}
              updatedAt={database.data.updatedAt}
            />
          ) : null}
        </div>
      </div>

      {!isSupabaseConfigured ? (
        <Dialog
          description="Všechny změny v tomto prohlížeči se zahodí a znovu se načtou výchozí smyšlená data."
          onClose={() => setResetOpen(false)}
          open={resetOpen}
          size="small"
          title="Obnovit testovací data?"
        >
          <div className="confirm-dialog">
            <span className="confirm-dialog__icon">
              <RefreshCcw aria-hidden="true" />
            </span>
            <p>Tato akce se týká pouze ukázkového režimu a nelze ji vrátit.</p>
            <div className="dialog-actions">
              <Button onClick={() => setResetOpen(false)} variant="ghost">
                Zrušit
              </Button>
              <Button
                loading={resetMutation.isPending}
                onClick={() => resetMutation.mutate()}
                variant="danger"
              >
                Obnovit data
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
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

function SettingsFooter({
  disabled,
  onSave,
}: {
  disabled: boolean;
  onSave: () => void;
}) {
  return (
    <footer className="settings-footer">
      <span>Změny se projeví u nových událostí.</span>
      <Button disabled={disabled} onClick={onSave}>
        <Save aria-hidden="true" />
        Uložit změny
      </Button>
    </footer>
  );
}

function SeasonSettings({
  canEdit,
  onSave,
}: {
  canEdit: boolean;
  onSave: () => void;
}) {
  return (
    <SettingsCard
      description="Aktivní období se nabízí ve filtrech a používá pro součty bodů."
      eyebrow="Sezona"
      title="Letní sezona 2026"
    >
      <div className="form-grid">
        <Field htmlFor="season-name" label="Název sezony">
          <input disabled={!canEdit} defaultValue="Léto 2026" id="season-name" />
        </Field>
        <Field htmlFor="season-status" label="Stav">
          <Select disabled={!canEdit} id="season-status" defaultValue="active">
            <option value="active">Aktivní</option>
            <option value="closed">Uzavřená</option>
          </Select>
        </Field>
      </div>
      <div className="form-grid">
        <Field htmlFor="season-from" label="Začátek">
          <input
            defaultValue="2026-05-01"
            disabled={!canEdit}
            id="season-from"
            type="date"
          />
        </Field>
        <Field htmlFor="season-to" label="Konec">
          <input
            defaultValue="2026-09-30"
            disabled={!canEdit}
            id="season-to"
            type="date"
          />
        </Field>
      </div>
      <Toggle
        checked
        disabled={!canEdit}
        description="Nové události se automaticky přiřadí do tohoto období."
        label="Nastavit jako výchozí sezonu"
        onChange={() => undefined}
      />
      <SettingsFooter disabled={!canEdit} onSave={onSave} />
    </SettingsCard>
  );
}

function ScoringSettings({
  canEdit,
  onSave,
}: {
  canEdit: boolean;
  onSave: () => void;
}) {
  return (
    <SettingsCard
      description="Váhu lze u konkrétní události změnit. Přepočet částečné účasti je podle minut."
      eyebrow="Bodování"
      title="Výchozí váhy"
    >
      <div className="weight-setting">
        <span>
          <strong>Běžná zkouška</strong>
          <small>Výchozí hodnota při založení zkoušky</small>
        </span>
        <Select defaultValue="1" disabled={!canEdit} aria-label="Váha zkoušky">
          <option value="0.5">0,5 bodu</option>
          <option value="1">1 bod</option>
          <option value="1.5">1,5 bodu</option>
        </Select>
      </div>
      <div className="weight-setting">
        <span>
          <strong>Vystoupení</strong>
          <small>Výchozí hodnota při založení vystoupení</small>
        </span>
        <Select defaultValue="2" disabled={!canEdit} aria-label="Váha vystoupení">
          <option value="1">1 bod</option>
          <option value="1.5">1,5 bodu</option>
          <option value="2">2 body</option>
        </Select>
      </div>
      <Toggle
        checked
        disabled={!canEdit}
        description="Získané body = váha × odchozené minuty / plánované minuty."
        label="Poměrné body za částečnou účast"
        onChange={() => undefined}
      />
      <SettingsFooter disabled={!canEdit} onSave={onSave} />
    </SettingsCard>
  );
}

function PairingSettings({
  canEdit,
  onSave,
}: {
  canEdit: boolean;
  onSave: () => void;
}) {
  return (
    <SettingsCard
      description="Generátor nejprve dodrží tvrdá omezení a poté hledá nejférovější kombinaci."
      eyebrow="Algoritmus"
      title="Pravidla párování"
    >
      <Toggle
        checked
        disabled={!canEdit}
        description="Dvojice dvou začátečníků dostane vyšší penalizaci."
        label="Propojovat začátečníky se zkušenými"
        onChange={() => undefined}
      />
      <Toggle
        checked
        disabled={!canEdit}
        description="Čím nedávněji spolu dvojice tančila, tím méně pravděpodobně se zopakuje."
        label="Omezit nedávno opakované páry"
        onChange={() => undefined}
      />
      <Toggle
        checked
        disabled={!canEdit}
        description="Člen, který minule zůstal bez páru, dostane přednost."
        label="Spravedlivě střídat volno"
        onChange={() => undefined}
      />
      <div className="weight-setting">
        <span>
          <strong>Období historie</strong>
          <small>Jak daleko zpět se počítají společné tance</small>
        </span>
        <Select defaultValue="365" disabled={!canEdit} aria-label="Období historie">
          <option value="180">6 měsíců</option>
          <option value="365">12 měsíců</option>
          <option value="730">24 měsíců</option>
        </Select>
      </div>
      <SettingsFooter disabled={!canEdit} onSave={onSave} />
    </SettingsCard>
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
        description="Správci a zapisovatelé se přihlašují e-mailem."
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
            <small>{session.email || "Ukázkový účet bez e-mailu"}</small>
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
            {codeVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
          <button
            aria-label="Kopírovat kód"
            disabled={!code}
            onClick={() => void copyCode()}
            type="button"
          >
            {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
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
  canEdit,
  onReset,
  production,
}: {
  memberCount: number;
  eventCount: number;
  updatedAt: string;
  canEdit: boolean;
  onReset: () => void;
  production: boolean;
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
            <dt>Události</dt>
            <dd>{eventCount}</dd>
          </div>
          <div>
            <dt>Poslední změna</dt>
            <dd>{formatDate(updatedAt.slice(0, 10))}</dd>
          </div>
          <div>
            <dt>Prostředí</dt>
            <dd>
              <Badge tone={production ? "green" : "amber"}>
                {production ? "Supabase" : "Místní ukázka"}
              </Badge>
            </dd>
          </div>
        </dl>
        <div className="backup-row">
          <span>
            <Archive aria-hidden="true" />
            <span>
              <strong>Pravidelný export</strong>
              <small>
                {production
                  ? "Schéma je verzované v repozitáři; data jsou uložená v Supabase."
                  : "Po připojení Supabase budou data uložená centrálně."}
              </small>
            </span>
          </span>
          <Badge tone="blue">Připraveno</Badge>
        </div>
      </SettingsCard>
      {!production ? (
        <Card className="danger-zone">
          <div>
            <span className="eyebrow">Ukázkový režim</span>
            <h2>Obnovit testovací data</h2>
            <p>Vrátí docházku, členy i páry do původního smyšleného stavu.</p>
          </div>
          <Button disabled={!canEdit} onClick={onReset} variant="danger">
            <RefreshCcw aria-hidden="true" />
            Obnovit data
          </Button>
        </Card>
      ) : null}
    </>
  );
}
