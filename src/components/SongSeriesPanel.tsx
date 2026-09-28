import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import type { AppDatabase, EnsembleEvent, SongSeries } from "../lib/domain";
import { databaseQueryKey } from "./DataContext";
import { Card, Button, Select } from "./Ui";
import { Help } from "./Help";
export function SongSeriesPanel({
  db,
  event,
  admin,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  admin: boolean;
}) {
  const query = useQueryClient();
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () =>
      appApi.saveSongSeries(event.id, { name, songIds: [], confirmed: false }),
    onSuccess: async () => {
      setName("");
      await query.invalidateQueries({ queryKey: databaseQueryKey });
    },
  });
  return (
    <Card className="feature-card">
      <h2>Písně a série</h2>
      <Help>
        <p>
          Vytvořte pojmenovanou sérii a přidejte písně z katalogu. Jedna píseň
          nebo kombinace může být na akci pouze jednou, i když je série zatím
          návrh. Po odebrání se znovu nabídne. Každou sérii potvrzuje admin
          samostatně; potvrzenou vidí všichni. Změněnou sérii uložte jako návrh
          a znovu potvrďte.
        </p>
      </Help>
      {event.songSeries?.map((series) => (
        <SeriesEditor
          key={`${series.id}:${JSON.stringify(series)}`}
          db={db}
          event={event}
          series={series}
          admin={admin}
        />
      ))}
      {!event.songSeries?.length && <p>Zatím žádná série.</p>}
      {admin && (
        <form
          className="feature-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <input
            aria-label="Název nové série"
            required
            placeholder="Název nové série"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button loading={add.isPending} type="submit">
            Vytvořit sérii
          </Button>
        </form>
      )}
      {add.error && (
        <p className="form-error" role="alert">
          {add.error.message}
        </p>
      )}
    </Card>
  );
}
function SeriesEditor({
  db,
  event,
  series,
  admin,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  series: SongSeries;
  admin: boolean;
}) {
  const query = useQueryClient();
  const [ids, setIds] = useState(series.songIds);
  const [name, setName] = useState(series.name);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const used = new Set(
    (event.songSeries ?? [])
      .filter((s) => s.id !== series.id)
      .flatMap((s) => s.songIds),
  );
  ids.forEach((id) => used.add(id));
  const save = useMutation({
    mutationFn: (confirmed: boolean) =>
      appApi.saveSongSeries(event.id, {
        id: series.id,
        name,
        songIds: ids,
        confirmed,
      }),
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: databaseQueryKey });
    },
  });
  const remove = useMutation({
    mutationFn: () => appApi.deleteSongSeries(event.id, series.id),
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: databaseQueryKey });
    },
  });
  const move = (index: number, direction: number) => {
    const next = [...ids];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    setIds(next);
  };
  return (
    <section className="song-series">
      <h3>
        {series.name} · {series.confirmed ? "Potvrzená" : "Návrh"}
      </h3>
      {admin && (
        <input
          aria-label={`Název série ${series.name}`}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <ol>
        {ids.map((id, index) => (
          <li key={id}>
            <span>{db.songs?.find((s) => s.id === id)?.name ?? "Píseň"}</span>
            {admin && (
              <span className="song-actions">
                <Button
                  aria-label="Posunout píseň nahoru"
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  aria-label="Posunout píseň dolů"
                  variant="ghost"
                  disabled={index === ids.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setIds(ids.filter((x) => x !== id))}
                >
                  Odebrat píseň
                </Button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {admin && (
        <>
          <div className="feature-toolbar">
            <input
              aria-label={`Hledat píseň pro ${series.name}`}
              placeholder="Hledat píseň…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              aria-label={`Kategorie pro ${series.name}`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">Všechny kategorie</option>
              <option value="">Bez kategorie</option>
              {db.songCategories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="song-picker">
            {db.songs
              ?.filter(
                (s) =>
                  s.active &&
                  !used.has(s.id) &&
                  s.name
                    .toLocaleLowerCase("cs")
                    .includes(search.toLocaleLowerCase("cs")) &&
                  (category === "all" || (s.categoryId ?? "") === category),
              )
              .map((song) => (
                <Button
                  key={song.id}
                  variant="ghost"
                  onClick={() => setIds([...ids, song.id])}
                >
                  + {song.name}
                </Button>
              ))}
          </div>
          <div className="feature-toolbar">
            <Button
              disabled={!name.trim()}
              loading={save.isPending}
              variant="secondary"
              onClick={() => save.mutate(false)}
            >
              Uložit návrh série
            </Button>
            <Button
              disabled={!name.trim() || ids.length === 0}
              loading={save.isPending}
              onClick={() => save.mutate(true)}
            >
              Potvrdit sérii
            </Button>
            <Button
              loading={remove.isPending}
              variant="ghost"
              onClick={() => remove.mutate()}
            >
              Smazat sérii
            </Button>
          </div>
        </>
      )}
      {(save.error || remove.error) && (
        <p className="form-error" role="alert">
          {save.error?.message ?? remove.error?.message}
        </p>
      )}
    </section>
  );
}
