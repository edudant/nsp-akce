import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import { databaseQueryKey } from "./DataContext";
import { Button, Card, Select } from "./Ui";
import { Help } from "./Help";
import { formatDate, todayInPrague } from "./formatters";
import {
  pairingParticipants,
  defaultTuning,
  validatePairs,
  type PairingTuning,
} from "../lib/seasonPairing";
import { generatePairsAsync } from "../lib/pairingClient";
import { PairingRoster } from "./PairingRoster";
import type { AppDatabase, EnsembleEvent, DancePair } from "../lib/domain";
export function EventPairingEditor({
  db,
  event,
  admin,
  onSaved,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  admin: boolean;
  onSaved?: () => void;
}) {
  const query = useQueryClient();
  const [tuning, setTuning] = useState(defaultTuning);
  const [draft, setDraft] = useState<DancePair[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [name, setName] = useState(formatDate(todayInPrague(), "d. M. yyyy"));
  const [message, setMessage] = useState("");
  const pairs = draft ?? event.pairs;
  const error = validatePairs(db, event, pairs);
  const save = useMutation({
    mutationFn: (published: boolean) =>
      appApi.savePairs(event.id, pairs, published, [], name),
    onSuccess: async (_, published) => {
      await query.invalidateQueries({ queryKey: databaseQueryKey });
      setDraft(null);
      setMessage(published ? "Sada je uložená." : "Návrh je uložený.");
      onSaved?.();
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
            <label className="field">
              Název sady (volitelný)
              <input
                aria-label="Název sady"
                maxLength={120}
                value={name}
                placeholder={formatDate(todayInPrague(), "d. M. yyyy")}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <p className="pairing-hint">
              Uloženou sadu uvidí členové v této akci.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="feature-toolbar">
              <Button
                disabled={
                  !!error ||
                  (pairs.length === 0 && selected.length === 0) ||
                  generate.isPending ||
                  selection.isPending
                }
                loading={save.isPending}
                onClick={() => save.mutate(true)}
              >
                Uložit
              </Button>
            </div>
          </>
        )}
        {(save.error || selection.error) && (
          <p role="alert" className="form-error">
            {save.error?.message ?? selection.error?.message}
          </p>
        )}
      </Card>
    </>
  );
}
