import { useState, type FormEvent } from "react";
import { addDays, format, parseISO } from "date-fns";
import { useDatabase } from "./DataContext";
import { Button, Field, Select } from "./Ui";
import { Help, ScoringHelp } from "./Help";
import { todayInPrague } from "./formatters";
import { pragueLocalToIso } from "../lib/supabaseData";
import type { EnsembleEvent, EventType } from "../lib/domain";
export type EventFormInput = Omit<EnsembleEvent, "id" | "attendance" | "pairs">;
export function EventForm({
  event,
  loading,
  error,
  onSave,
}: {
  event?: EnsembleEvent;
  loading: boolean;
  error?: string;
  onSave: (input: EventFormInput) => void;
}) {
  const db = useDatabase();
  const [type, setType] = useState<EventType>(event?.type ?? "rehearsal");
  const [title, setTitle] = useState(event?.title ?? "Páteční zkouška");
  const [date, setDate] = useState(() => {
    if (event) return event.date;
    const now = parseISO(todayInPrague());
    return format(addDays(now, (5 - now.getDay() + 7) % 7 || 7), "yyyy-MM-dd");
  });
  const [start, setStart] = useState(event?.startTime ?? "19:00");
  const [end, setEnd] = useState(event?.endTime ?? "21:00");
  const [location, setLocation] = useState(event?.location ?? "Stará škola");
  const [seasonId, setSeasonId] = useState(
    event?.seasonId ??
      db.data?.seasons?.find((s) => s.active && s.kind === "dance")?.id ??
      "",
  );
  const [weight, setWeight] = useState(String(event?.weight ?? 1));
  const [oldPairs, setOldPairs] = useState(String(event?.oldPairs ?? 8));
  const [youngPairs, setYoungPairs] = useState(String(event?.youngPairs ?? 0));
  const [deadline, setDeadline] = useState(() =>
    event?.responseDeadline
      ? new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Europe/Prague",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
          .format(new Date(event.responseDeadline))
          .replace(" ", "T")
      : "",
  );
  const [singing, setSinging] = useState(event?.singing ?? false);
  const [note, setNote] = useState(event?.note ?? "");
  const [formError, setFormError] = useState("");
  const dance =
    db.data?.seasons?.find((s) => s.id === seasonId)?.kind === "dance";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (end <= start) {
      setFormError("Konec musí být po začátku.");
      return;
    }
    if (!seasonId) {
      setFormError("Nejprve založte sezónu v settings.");
      return;
    }
    setFormError("");
    onSave({
      title,
      type,
      date,
      startTime: start,
      endTime: end,
      location,
      seasonId,
      status: event?.status ?? "open",
      weight: Number(weight),
      oldPairs: type === "performance" && dance ? Number(oldPairs) : 0,
      youngPairs: type === "performance" && dance ? Number(youngPairs) : 0,
      capacityPairs: Number(oldPairs) + Number(youngPairs),
      responseDeadline:
        type === "performance"
          ? pragueLocalToIso(deadline.slice(0, 10), deadline.slice(11, 16))
          : undefined,
      singing,
      note,
      pairsPublished: event?.pairsPublished ?? false,
    });
  };
  return (
    <form className="dialog-form" onSubmit={submit}>
      {!event && (
        <Field label="Typ akce">
          <Select
            aria-label="Typ akce"
            value={type}
            onChange={(e) => {
              const next = e.target.value as EventType;
              setType(next);
              setTitle(next === "rehearsal" ? "Páteční zkouška" : "");
              setWeight(next === "rehearsal" ? "1" : "2");
            }}
          >
            <option value="rehearsal">Zkouška</option>
            <option value="performance">Vystoupení</option>
          </Select>
        </Field>
      )}
      <Field label="Sezóna">
        <Select
          aria-label="Sezóna akce"
          required
          value={seasonId}
          onChange={(e) => setSeasonId(e.target.value)}
        >
          <option value="">Vyberte sezónu</option>
          {db.data?.seasons?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.kind === "dance" ? "Taneční" : "Koledy"}
              {s.active ? " · Aktivní" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Název">
        <input
          aria-label="Název akce"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <div className="form-grid form-grid--3">
        <Field label="Datum">
          <input
            aria-label="Datum akce"
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Začátek">
          <input
            aria-label="Začátek akce"
            required
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Konec">
          <input
            aria-label="Konec akce"
            required
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Místo">
        <input
          aria-label="Místo akce"
          required
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </Field>
      {type === "performance" && (
        <>
          <Field label="Termín pro vyjádření">
            <input
              aria-label="Termín pro vyjádření"
              type="datetime-local"
              required
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </Field>
          <Help title="Deadline a potvrzení">
            <p>
              Po termínu se vystoupení automaticky potvrdí. Odpovědi a přání pak
              smí upravovat pouze admin. „Zatím nevím“ vyžaduje poznámku a
              zůstává zachované. Ostatní odpovědi jsou členům viditelné od
              potvrzení.
            </p>
          </Help>
        </>
      )}
      {type === "performance" && dance && (
        <>
          <div className="form-grid">
            <Field label="Odhad párů Starý">
              <input
                aria-label="Odhad párů Starý"
                required
                type="number"
                min="0"
                step="1"
                value={oldPairs}
                onChange={(e) => setOldPairs(e.target.value)}
              />
            </Field>
            <Field label="Odhad párů Mladý">
              <input
                aria-label="Odhad párů Mladý"
                required
                type="number"
                min="0"
                step="1"
                value={youngPairs}
                onChange={(e) => setYoungPairs(e.target.value)}
              />
            </Field>
          </div>
          <Help title="Odhad počtu párů">
            <p>
              Odhad určuje hlavní sestavu pro celé vystoupení. Další
              kompatibilní páry se vytvoří pod čarou. Před zveřejněním můžete
              sestavu ručně upravit.
            </p>
          </Help>
        </>
      )}
      <Field label="Bodová váha">
        <input
          aria-label="Bodová váha"
          required
          type="number"
          min="0"
          max="100"
          step="0.25"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </Field>
      <ScoringHelp />
      <label>
        <input
          type="checkbox"
          checked={singing}
          onChange={(e) => setSinging(e.target.checked)}
        />{" "}
        Bude se zpívat
      </label>
      <Help title="Zpívání a série">
        <p>
          Na akci lze sestavit více sérií. Každá píseň se na akci používá
          jednou. Sérii členové uvidí až po potvrzení adminem.
        </p>
      </Help>
      {type === "performance" && (
        <Field label="Poznámka pro členy">
          <textarea
            aria-label="Poznámka pro členy"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      )}
      {(error || formError) && (
        <p role="alert" className="form-error">
          {error || formError}
        </p>
      )}
      <Button loading={loading} type="submit">
        {event ? "Uložit akci" : "Vytvořit akci"}
      </Button>
    </form>
  );
}
