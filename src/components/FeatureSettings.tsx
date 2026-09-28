import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import { useDatabase, databaseQueryKey } from "./DataContext";
import { Button, Card, Field, Select } from "./Ui";
import { Help } from "./Help";
import type { Season, Song } from "../lib/domain";
export function SeasonsPanel({ canEdit }: { canEdit: boolean }) {
  const db = useDatabase();
  const query = useQueryClient();
  const initial: Omit<Season, "id"> & { id?: string } = {
    name: "",
    kind: "dance",
    dateFrom: "",
    dateTo: "",
    active: true,
  };
  const [draft, setDraft] = useState(initial);
  const save = useMutation({
    mutationFn: appApi.saveSeason,
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: databaseQueryKey });
      setDraft(initial);
    },
  });
  return (
    <Card className="feature-card">
      <h2>Sezóny</h2>
      <Help>
        <p>
          Sezóny zakládá admin ručně. Chodské slavnosti ještě patří do končící
          taneční sezóny. Pro každý typ může být aktivní jedna sezóna; Koledy se
          mohou překrývat s taneční sezónou. Nová sezóna nemaže historické body.
        </p>
      </Help>
      <div className="feature-list">
        {db.data?.seasons?.map((s) => (
          <div key={s.id}>
            <strong>{s.name}</strong> ·{" "}
            {s.kind === "dance" ? "Taneční" : "Koledy"} · {s.dateFrom}–
            {s.dateTo} {s.active ? "· Aktivní" : ""}{" "}
            {canEdit && (
              <Button variant="ghost" onClick={() => setDraft(s)}>
                Upravit
              </Button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(draft);
          }}
          className="dialog-form"
        >
          <Field label="Název sezóny">
            <input
              aria-label="Název sezóny"
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Typ sezóny">
            <Select
              aria-label="Typ sezóny"
              value={draft.kind}
              onChange={(e) =>
                setDraft({ ...draft, kind: e.target.value as Season["kind"] })
              }
            >
              <option value="dance">Taneční</option>
              <option value="carols">Koledy</option>
            </Select>
          </Field>
          <div className="form-grid">
            <Field label="Od">
              <input
                aria-label="Začátek sezóny"
                type="date"
                required
                value={draft.dateFrom}
                onChange={(e) =>
                  setDraft({ ...draft, dateFrom: e.target.value })
                }
              />
            </Field>
            <Field label="Do">
              <input
                aria-label="Konec sezóny"
                type="date"
                required
                min={draft.dateFrom}
                value={draft.dateTo}
                onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
              />
            </Field>
          </div>
          <label>
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />{" "}
            Aktivní pro tento typ
          </label>
          <div>
            <Button loading={save.isPending} type="submit">
              {draft.id ? "Uložit sezónu" : "Založit sezónu"}
            </Button>{" "}
            {draft.id && (
              <Button variant="ghost" onClick={() => setDraft(initial)}>
                Nová sezóna
              </Button>
            )}
          </div>
        </form>
      )}
      {save.error && (
        <p role="alert" className="form-error">
          {save.error.message}
        </p>
      )}
    </Card>
  );
}
export function SongsSettings({ canEdit }: { canEdit: boolean }) {
  const db = useDatabase();
  const query = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const initial: Omit<Song, "id"> & { id?: string } = {
    name: "",
    active: true,
  };
  const [draft, setDraft] = useState(initial);
  const [catDraft, setCatDraft] = useState({
    id: undefined as string | undefined,
    name: "",
  });
  const refresh = async () => {
    await query.invalidateQueries({ queryKey: databaseQueryKey });
  };
  const save = useMutation({
    mutationFn: appApi.saveSong,
    onSuccess: async () => {
      await refresh();
      setDraft(initial);
    },
  });
  const saveCategory = useMutation({
    mutationFn: appApi.saveSongCategory,
    onSuccess: async () => {
      await refresh();
      setCatDraft({ id: undefined, name: "" });
    },
  });
  return (
    <Card className="feature-card">
      <h2>Písně a kategorie</h2>
      <Help>
        <p>
          Kombinace s lomítkem je jedna položka. Kategorie pomáhá při hledání.
          Skrytá píseň zůstává ve starých sériích. Každou píseň lze na jedné
          akci použít pouze jednou, i napříč sériemi.
        </p>
      </Help>
      <div className="feature-toolbar">
        <input
          aria-label="Hledat píseň"
          placeholder="Hledat píseň…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Kategorie písní"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">Všechny kategorie</option>
          <option value="">Bez kategorie</option>
          {db.data?.songCategories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="feature-list">
        {db.data?.songs
          ?.filter(
            (s) =>
              s.name
                .toLocaleLowerCase("cs")
                .includes(search.toLocaleLowerCase("cs")) &&
              (category === "all" || (s.categoryId ?? "") === category),
          )
          .map((s) => (
            <div key={s.id}>
              <span>
                {s.name} {!s.active && "· Skrytá"}{" "}
                <small>
                  {
                    db.data?.songCategories?.find((c) => c.id === s.categoryId)
                      ?.name
                  }
                </small>
              </span>
              {canEdit && (
                <Button variant="ghost" onClick={() => setDraft(s)}>
                  Upravit
                </Button>
              )}
            </div>
          ))}
      </div>
      {canEdit && (
        <>
          <h3>{draft.id ? "Upravit píseň" : "Nová píseň"}</h3>
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(draft);
            }}
          >
            <Field label="Název písně">
              <input
                aria-label="Název písně"
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Select
              aria-label="Kategorie upravované písně"
              value={draft.categoryId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, categoryId: e.target.value || undefined })
              }
            >
              <option value="">Bez kategorie</option>
              {db.data?.songCategories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <label>
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
              />{" "}
              Nabízet do nových sérií
            </label>
            <div>
              <Button loading={save.isPending} type="submit">
                Uložit píseň
              </Button>{" "}
              {draft.id && (
                <Button variant="ghost" onClick={() => setDraft(initial)}>
                  Nová píseň
                </Button>
              )}
            </div>
          </form>
          <h3>Kategorie</h3>
          <div className="feature-list">
            {db.data?.songCategories?.map((c) => (
              <div key={c.id}>
                {c.name}
                <Button variant="ghost" onClick={() => setCatDraft(c)}>
                  Upravit
                </Button>
              </div>
            ))}
          </div>
          <form
            className="feature-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              saveCategory.mutate(catDraft);
            }}
          >
            <input
              aria-label="Název kategorie"
              required
              value={catDraft.name}
              onChange={(e) =>
                setCatDraft({ ...catDraft, name: e.target.value })
              }
            />
            <Button loading={saveCategory.isPending} type="submit">
              {catDraft.id ? "Uložit kategorii" : "Přidat kategorii"}
            </Button>
            {catDraft.id && (
              <Button
                variant="ghost"
                onClick={() => setCatDraft({ id: undefined, name: "" })}
              >
                Nová kategorie
              </Button>
            )}
          </form>
        </>
      )}
      {(save.error || saveCategory.error) && (
        <p role="alert" className="form-error">
          {save.error?.message ?? saveCategory.error?.message}
        </p>
      )}
    </Card>
  );
}
