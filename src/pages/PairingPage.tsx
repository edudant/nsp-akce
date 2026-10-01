import { useState, useSyncExternalStore } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import { useDatabase, databaseQueryKey } from "../components/DataContext";
import { ErrorState, LoadingState } from "../components/DataStates";
import { PageHeader } from "../components/PageHeader";
import { Button, Card, Select } from "../components/Ui";
import { Help } from "../components/Help";
import { AttendancePanel } from "../components/AttendancePanel";
import { AppLink, navigate } from "../components/Router";
import {
  pairingParticipants,
  defaultTuning,
  validatePairs,
  type PairingTuning,
} from "../lib/seasonPairing";
import { generatePairsAsync } from "../lib/pairingClient";
import { PairingRoster } from "../components/PairingRoster";
import type { AppDatabase, EnsembleEvent, DancePair } from "../lib/domain";
function readPairingEventId() {
  return (
    new URLSearchParams(window.location.hash.split("?")[1] ?? "").get(
      "event",
    ) ?? ""
  );
}
function subscribePairingEvent(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
  };
}
export function PairingPage({ canEdit }: { canEdit: boolean }) {
  const db = useDatabase();
  const eventId = useSyncExternalStore(
    subscribePairingEvent,
    readPairingEventId,
    () => "",
  );
  if (db.isLoading) return <LoadingState />;
  if (db.isError || !db.data)
    return <ErrorState onRetry={() => void db.refetch()} />;
  const events = db.data.events.filter(
    (e) => e.seasonKind !== "carols" && e.status !== "cancelled",
  );
  const event = events.find((e) => e.id === eventId) ?? events[0];
  return (
    <div className="page">
      <PageHeader
        title="Taneční páry"
        description="Návrh, ruční úpravy a zveřejnění sestavy."
      />
      <Select
        aria-label="Akce pro párování"
        value={event?.id ?? ""}
        onChange={(e) =>
          navigate(`/pary?event=${encodeURIComponent(e.target.value)}`)
        }
      >
        {events.map((e) => (
          <option value={e.id} key={e.id}>
            {e.date} · {e.title}
          </option>
        ))}
      </Select>
      {event ? (
        <PairingEditor
          key={event.id}
          db={db.data}
          event={event}
          admin={canEdit}
        />
      ) : (
        <p>Žádné taneční akce.</p>
      )}
    </div>
  );
}
function PairingEditor({
  db,
  event,
  admin,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  admin: boolean;
}) {
  const query = useQueryClient();
  const [tuning, setTuning] = useState(defaultTuning);
  const [draft, setDraft] = useState<DancePair[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const pairs = draft ?? event.pairs;
  const error = validatePairs(db, event, pairs);
  const save = useMutation({
    mutationFn: (published: boolean) =>
      appApi.savePairs(event.id, pairs, published),
    onSuccess: async (_, published) => {
      await query.invalidateQueries({ queryKey: databaseQueryKey });
      setDraft(null);
      setMessage(published ? "Páry jsou zveřejněné." : "Návrh je uložený.");
    },
  });
  const selection = useMutation({
    mutationFn: ({ id, standing }: { id: string; standing: boolean }) =>
      appApi.updateAttendance(event.id, id, { standing }),
    onSuccess: async (_, { id, standing }) => {
      if (standing)
        setDraft((current) =>
          (current ?? event.pairs).filter(
            (p) => p.leaderId !== id && p.followerId !== id,
          ),
        );
      setMessage(
        "Výběr stání je uložený. Ostatní ruční úpravy zůstaly zachované; další členy doplníte novým generováním.",
      );
      await query.invalidateQueries({ queryKey: databaseQueryKey });
    },
  });
  const generate = useMutation({
    mutationFn: () =>
      generatePairsAsync(db, event, tuning, crypto.randomUUID()),
    onSuccess: (result) => {
      setDraft(result.pairs);
      setWarnings(result.warnings);
      setMessage(
        `Návrh vytvořen: ${result.pairs.filter((p) => !p.belowLine).length} hlavních párů, ${result.pairs.filter((p) => p.belowLine).length} pod čarou, ${result.standingIds.length} bez páru.`,
      );
    },
  });
  const selected = pairingParticipants(db, event);
  const eligible = selected.filter(
    (m) => !event.attendance.find((r) => r.memberId === m.id)?.standing,
  );
  return (
    <>
      {admin && (
        <>
          <AttendancePanel db={db} event={event} admin />
          <Card className="feature-card">
            <h2>
              {event.type === "rehearsal"
                ? "Random páry pro zkoušku"
                : "Nastavení sestavy"}
            </h2>
            <Help title="Pravidla generátoru">
              {event.type === "rehearsal" ? (
                <p>
                  Random párování používá vybrané přítomné členy, kompatibilní
                  role a skupiny. Explicitní zákazy vždy platí. Doplnit Mladé
                  mohou jen členové s oběma zařazeními. Body, zkušenost a
                  historie se zde nepoužívají. Při doplnění může generátor
                  přesunout člena s oběma zařazeními do Mladých, i když mohl
                  tancovat ve Starých. Uložené sady neovlivňují historii
                  skutečných párů.
                </p>
              ) : (
                <>
                  <p>
                    Posuvníky nastavují sílu pravidel. Preference respektují
                    přání zvolené strany; Body zvýhodňují přání členů s vyšší
                    docházkou. Střídání omezuje opakované skutečné páry a stání
                    v sezóně akce. Stání se počítá pouze z potvrzené skutečné
                    evidence. Zkušenost podporuje začátečníky se zkušenými.
                  </p>
                  <p>
                    Generátor cílí na odhad {event.oldPairs ?? 0} Starých a{" "}
                    {event.youngPairs ?? 0} Mladých párů; ostatní jsou pod
                    čarou. Skupiny se řeší společně: nejprve naplnění odhadu,
                    potom maximální počet všech párů, nakonec pravidla
                    posuvníků. Tvrdá omezení (role, skupiny, zákazy) se
                    neporušují. Přání se nemusí splnit kvůli konfliktu s jiným
                    pravidlem nebo nedostatku partnerů. Ruční úpravy jsou
                    součástí návrhu; členové je vidí až po zveřejnění.
                  </p>
                </>
              )}
            </Help>
            {event.type === "rehearsal" ? (
              <label>
                <input
                  type="checkbox"
                  checked={tuning.supplementYoung}
                  onChange={(e) =>
                    setTuning({ ...tuning, supplementYoung: e.target.checked })
                  }
                />{" "}
                Doplnit Mladé ze Starých s oběma zařazeními
              </label>
            ) : (
              <>
                <div className="tuning-sliders">
                  {(
                    ["preferences", "points", "rotation", "experience"] as const
                  ).map((key, i) => (
                    <label key={key}>
                      {
                        [
                          "Preference",
                          "Body jako odměna za přání",
                          "Střídání párů a stání",
                          "Začátečníci se zkušenými",
                        ][i]
                      }{" "}
                      <output>{tuning[key]}</output>
                      <input
                        aria-label={
                          ["Preference", "Body", "Střídání", "Zkušenost"][i]
                        }
                        type="range"
                        min="0"
                        max="3"
                        step="0.25"
                        value={tuning[key]}
                        onChange={(e) =>
                          setTuning({
                            ...tuning,
                            [key]: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <Select
                  aria-label="Čí přání zohlednit"
                  value={tuning.chooser}
                  onChange={(e) =>
                    setTuning({
                      ...tuning,
                      chooser: e.target.value as PairingTuning["chooser"],
                    })
                  }
                >
                  <option value="both">Přání obou stran</option>
                  <option value="follower">Vybírají holky</option>
                  <option value="leader">Vybírají kluci</option>
                </Select>
                <h3>Kdo má stát celé vystoupení</h3>
                <div className="standing-picker">
                  {selected.map((m) => (
                    <label key={m.id}>
                      <input
                        disabled={selection.isPending}
                        type="checkbox"
                        checked={
                          event.attendance.find((r) => r.memberId === m.id)
                            ?.standing ?? false
                        }
                        onChange={(e) =>
                          selection.mutate({
                            id: m.id,
                            standing: e.target.checked,
                          })
                        }
                      />{" "}
                      {m.fullName}
                    </label>
                  ))}
                </div>
              </>
            )}
            <p>
              {event.status === "closed"
                ? "Páruje se podle zapsané skutečné účasti této akce, včetně bývalých členů."
                : "Páruje se z vybraných účastníků; nepřítomní a omluvení jsou vyřazení."}
            </p>
            <p>
              Dostupní pro páry: {eligible.length} (
              {eligible.filter((m) => m.role === "leader").length} mužů,{" "}
              {eligible.filter((m) => m.role === "follower").length} žen).
            </p>
            {generate.error && (
              <p role="alert" className="form-error">
                {generate.error.message}
              </p>
            )}
            {message && <p role="status">{message}</p>}
            <Button
              loading={generate.isPending}
              disabled={selection.isPending || save.isPending}
              onClick={() => {
                setMessage("");
                generate.mutate();
              }}
            >
              Vygenerovat návrh
            </Button>
          </Card>
        </>
      )}
      <Card className="feature-card">
        <h2>{admin ? "Návrh sestavy" : "Zveřejněná sestava"}</h2>
        {warnings.map((w) => (
          <p key={w} role="status">
            {w}
          </p>
        ))}
        <PairingRoster
          db={db}
          event={event}
          pairs={pairs}
          admin={admin}
          disabled={generate.isPending || selection.isPending || save.isPending}
          onChange={setDraft}
        />
        {admin && (
          <>
            <Help title="Uložení a zveřejnění">
              <p>
                Uložený návrh vystoupení vidí pouze admin. Zveřejněním ho
                zpřístupníte všem. U zkoušky lze uložit více samostatných sad a
                zveřejnit každou z nich; další sada nepřepíše předchozí.
              </p>
            </Help>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="feature-toolbar">
              {event.type === "performance" && (
                <Button
                  disabled={
                    !!error ||
                    (pairs.length === 0 && draft === null) ||
                    generate.isPending ||
                    selection.isPending
                  }
                  loading={save.isPending}
                  variant="secondary"
                  onClick={() => save.mutate(false)}
                >
                  Uložit návrh
                </Button>
              )}
              <Button
                disabled={
                  !!error ||
                  pairs.length === 0 ||
                  generate.isPending ||
                  selection.isPending
                }
                loading={save.isPending}
                onClick={() => save.mutate(true)}
              >
                {event.type === "rehearsal"
                  ? "Uložit a zveřejnit sadu"
                  : "Zveřejnit schválené páry"}
              </Button>
            </div>
          </>
        )}
        {(save.error || selection.error) && (
          <p role="alert" className="form-error">
            {save.error?.message ?? selection.error?.message}
          </p>
        )}
        <AppLink to={`/udalosti/${event.id}`}>
          Detail akce a uložené sady
        </AppLink>
      </Card>
    </>
  );
}
