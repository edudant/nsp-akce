import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import { useDatabase, databaseQueryKey } from "./DataContext";
import { Button, Card, Field, Select, Dialog, Badge } from "./Ui";
import { ListHeader, ListRow } from "./CompactList";
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
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: appApi.saveSeason,
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: databaseQueryKey });
      setDraft(initial);
      setEditing(false);
    },
  });
  return (
    <Card className="feature-card">
      <ListHeader
        title="Sezóny"
        addLabel="Nová sezóna"
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
          Sezóny zakládá admin ručně. Chodské slavnosti ještě patří do končící
          taneční sezóny. Pro každý typ může být aktivní jedna sezóna; Koledy se
          mohou překrývat s taneční sezónou. Nová sezóna nemaže historické body.
        </p>
      </Help>
      <div className="compact-list">
        {db.data?.seasons?.map((s) => (
          <ListRow
            key={s.id}
            title={s.name}
            subtitle={`${s.kind === "dance" ? "Taneční" : "Koledy"} · ${s.dateFrom}–${s.dateTo}`}
            meta={s.active ? <Badge tone="green">Aktivní</Badge> : undefined}
            onOpen={() => {
              setDraft(s);
              setEditing(true);
            }}
          />
        ))}
      </div>
      <Dialog
        open={editing}
        title={draft.id ? "Detail sezóny" : "Nová sezóna"}
        onClose={() => setEditing(false)}
      >
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
      </Dialog>
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
  const [editing, setEditing] = useState(false);
  const [editingCategory, setEditingCategory] = useState(false);
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
      setEditing(false);
    },
  });
  const saveCategory = useMutation({
    mutationFn: appApi.saveSongCategory,
    onSuccess: async () => {
      await refresh();
      setCatDraft({ id: undefined, name: "" });
      setEditingCategory(false);
    },
  });
  return (
    <Card className="feature-card">
      <ListHeader
        title="Písně"
        addLabel="Nová píseň"
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
      <div className="compact-list">
        {db.data?.songs
          ?.filter(
            (s) =>
              s.name
                .toLocaleLowerCase("cs")
                .includes(search.toLocaleLowerCase("cs")) &&
              (category === "all" || (s.categoryId ?? "") === category),
          )
          .map((s) => (
            <ListRow
              key={s.id}
              title={s.name}
              subtitle={
                db.data?.songCategories?.find((c) => c.id === s.categoryId)
                  ?.name ?? "Bez kategorie"
              }
              meta={!s.active ? <Badge>Skrytá</Badge> : undefined}
              onOpen={() => {
                setDraft(s);
                setEditing(true);
              }}
            />
          ))}
      </div>
      {canEdit && (
        <>
          <Dialog
            open={editing}
            title={draft.id ? "Detail písně" : "Nová píseň"}
            onClose={() => setEditing(false)}
          >
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
                  setDraft({
                    ...draft,
                    categoryId: e.target.value || undefined,
                  })
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
          </Dialog>
          <ListHeader
            title="Kategorie"
            addLabel="Nová kategorie"
            onAdd={() => {
              setCatDraft({ id: undefined, name: "" });
              setEditingCategory(true);
            }}
          />
          <div className="compact-list">
            {db.data?.songCategories?.map((c) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={`${db.data?.songs?.filter((s) => s.categoryId === c.id).length ?? 0} písní`}
                onOpen={() => {
                  setCatDraft(c);
                  setEditingCategory(true);
                }}
              />
            ))}
          </div>
          <Dialog
            open={editingCategory}
            title={catDraft.id ? "Detail kategorie" : "Nová kategorie"}
            onClose={() => setEditingCategory(false)}
          >
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
          </Dialog>
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
