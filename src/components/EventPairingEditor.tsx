import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import { databaseQueryKey } from "./DataContext";
import { Button, Select } from "./Ui";
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
  initialName,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  admin: boolean;
  onSaved?: () => void;
  initialName?: string;
}) {
  const query = useQueryClient();
  const [tuning, setTuning] = useState(defaultTuning);
  const [draft, setDraft] = useState<DancePair[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [name, setName] = useState(
    initialName ?? formatDate(todayInPrague(), "d. M. yyyy"),
  );
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
  const pending = generate.isPending || selection.isPending || save.isPending;
  return (
    <div className="pairing-editor">
      <section className="pairing-settings">
        <div className="pairing-settings__heading">
          <h3>Nastavení generátoru</h3>
          <Help title="Pravidla generátoru">
            <p>
              {event.type === "rehearsal"
                ? "Random párování vybraných přítomných členů respektuje role, skupiny a zákazy. Doplnění Mladých používá členy s oběma zařazeními."
                : "Preference a Body zohledňují přání a docházku. Střídání používá poslední sady uzavřených vystoupení, Zkušenost podporuje začátečníky se zkušenými. Odhad určuje hlavní sestavu; další páry jsou pod čarou. Role, skupiny a zákazy vždy platí."}
            </p>
          </Help>
        </div>
        {event.type === "rehearsal" ? (
          <label className="pairing-check">
            <input
              type="checkbox"
              disabled={pending}
              checked={tuning.supplementYoung}
              onChange={(e) =>
                setTuning({ ...tuning, supplementYoung: e.target.checked })
              }
            />
            Doplnit Mladé ze Starých s oběma zařazeními
          </label>
        ) : (
          <>
            <div className="pairing-tuning">
              {(
                ["preferences", "points", "rotation", "experience"] as const
              ).map((key, index) => (
                <label key={key}>
                  <span>
                    {["Preference", "Body", "Střídání", "Zkušenost"][index]}
                    <output>{tuning[key]}</output>
                  </span>
                  <input
                    aria-label={
                      ["Preference", "Body", "Střídání", "Zkušenost"][index]
                    }
                    type="range"
                    min="0"
                    max="3"
                    step="0.25"
                    value={tuning[key]}
                    disabled={pending}
                    onChange={(e) =>
                      setTuning({ ...tuning, [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="pairing-settings__row">
              <Select
                aria-label="Čí přání zohlednit"
                value={tuning.chooser}
                disabled={pending}
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
              <span>
                Odhad: {event.oldPairs ?? 0} Starých · {event.youngPairs ?? 0}{" "}
                Mladých
              </span>
            </div>
            <details className="pairing-standing">
              <summary>
                Kdo stojí (
                {
                  selected.filter(
                    (m) =>
                      event.attendance.find((r) => r.memberId === m.id)
                        ?.standing,
                  ).length
                }
                )
              </summary>
              <div className="standing-picker standing-picker--compact">
                {selected.map((m) => (
                  <label key={m.id}>
                    <input
                      disabled={pending}
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
                    />
                    {m.fullName}
                  </label>
                ))}
              </div>
            </details>
          </>
        )}
        <div className="pairing-settings__row">
          <span>
            {eligible.length} dostupných ·{" "}
            {eligible.filter((m) => m.role === "leader").length} mužů ·{" "}
            {eligible.filter((m) => m.role === "follower").length} žen
          </span>
          <Button
            size="small"
            loading={generate.isPending}
            disabled={selection.isPending || save.isPending}
            onClick={() => {
              setMessage("");
              generate.mutate();
            }}
          >
            Vygenerovat návrh
          </Button>
        </div>
        <small>
          {event.status === "closed"
            ? "Páruje se podle zapsané skutečné účasti této akce, včetně bývalých členů."
            : "Páruje se z vybraných účastníků; nepřítomní a omluvení jsou vyřazení."}
        </small>
      </section>
      {message && (
        <p role="status" className="pairing-message">
          {message}
        </p>
      )}
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
        disabled={pending}
        onChange={setDraft}
      />
      <div className="pairing-editor__footer">
        <label className="field">
          Název sady (volitelný)
          <input
            aria-label="Název sady"
            maxLength={120}
            value={name}
            disabled={pending}
            placeholder={formatDate(todayInPrague(), "d. M. yyyy")}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
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
      {(error || save.error || generate.error || selection.error) && (
        <p role="alert" className="form-error">
          {error ??
            save.error?.message ??
            generate.error?.message ??
            selection.error?.message}
        </p>
      )}
    </div>
  );
}
