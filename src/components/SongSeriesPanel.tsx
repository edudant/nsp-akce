import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { appApi } from "../lib/dataApi";
import type { AppDatabase, EnsembleEvent, SongSeries } from "../lib/domain";
import { databaseQueryKey } from "./DataContext";
import { Card, Button, Select, Dialog, IconButton } from "./Ui";
import { AppLink } from "./Router";
import { ListRow } from "./CompactList";

export function SongSeriesPanel({
  db,
  event,
  admin,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  admin: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const visible = (event.songSeries ?? []).filter((s) => admin || s.confirmed);
  const carols = event.seasonKind === "carols";
  const detail = visible.find((s) => s.id === editing);
  return (
    <Card className="feature-card">
      <header className="compact-list__header">
        <h2>{carols ? "Koledy" : "Písně"}</h2>
        {admin && (
          <IconButton label={carols ? "Přidat koledy" : "Přidat písně"} onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
          </IconButton>
        )}
      </header>
      <div className="compact-list">
        {visible.map((series) => {
          const subtitle = `${series.name}${admin ? ` · ${series.confirmed ? "Potvrzená" : "Návrh"}` : ""}`;
          return series.songIds.length
            ? series.songIds.map((id) => {
                const title =
                  db.songs?.find((song) => song.id === id)?.name ?? "Píseň";
                return admin ? (
                  <ListRow
                    key={id}
                    title={title}
                    subtitle={subtitle}
                    onOpen={() => setEditing(series.id)}
                  />
                ) : (
                  <div key={id} className="compact-row compact-row--readonly">
                    <span>
                      <AppLink to={`/pisne/${id}`}><strong>{title}</strong></AppLink>
                      <small className="song-subtitle">{series.name}</small>
                    </span>
                  </div>
                );
              })
            : admin && (
                <ListRow
                  key={series.id}
                  title={series.name}
                  subtitle="Prázdná série · Návrh"
                  onOpen={() => setEditing(series.id)}
                />
              );
        })}
      </div>
      {!visible.some((s) => s.songIds.length) && <p>{carols ? "Zatím žádné koledy." : "Zatím žádné písně."}</p>}
      <Dialog
        open={adding}
        title={carols ? "Přidat koledy" : "Přidat písně"}
        onClose={() => setAdding(false)}
      >
        {adding && (
          <SeriesEditor
            db={db}
            event={event}
            onSaved={() => setAdding(false)}
          />
        )}
      </Dialog>
      <Dialog
        open={!!detail && admin}
        title={`Série ${detail?.name ?? ""}`}
        onClose={() => setEditing(null)}
      >
        {detail && admin && (
          <SeriesEditor
            key={`${detail.id}:${JSON.stringify(detail)}`}
            db={db}
            event={event}
            series={detail}
            onSaved={() => setEditing(null)}
          />
        )}
      </Dialog>
    </Card>
  );
}
function SeriesEditor({
  db,
  event,
  series,
  onSaved,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  series?: SongSeries;
  onSaved: () => void;
}) {
  const query = useQueryClient();
  const [ids, setIds] = useState(series?.songIds ?? []);
  const [name, setName] = useState(series?.name ?? (event.seasonKind === "carols" ? "Koledy" : "Písně"));
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const kind = event.seasonKind === "carols" ? "carol" : "song";
  const usedElsewhere = new Set(
    (event.songSeries ?? [])
      .filter((s) => s.id !== series?.id)
      .flatMap((s) => s.songIds),
  );
  const refresh = async () => {
    await query.invalidateQueries({ queryKey: databaseQueryKey });
    onSaved();
  };
  const save = useMutation({
    mutationFn: (confirmed: boolean) =>
      appApi.saveSongSeries(event.id, {
        ...(series ? { id: series.id } : {}),
        name,
        songIds: ids,
        confirmed,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => appApi.deleteSongSeries(event.id, series!.id),
    onSuccess: refresh,
  });
  const pending = save.isPending || remove.isPending;
  const move = (index: number, offset: number) => {
    const next = [...ids];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setIds(next);
  };
  return (
    <section className="song-series bulk-picker">
      <label className="field">
        Název série
        <input
          aria-label="Název série"
          value={name}
          maxLength={100}
          disabled={pending}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {series && (
        <div className="compact-list">
          {ids.map((id, index) => (
            <div className="compact-row compact-row--readonly" key={id}>
              <span className="compact-row__title">
                {index + 1}.{" "}
                <AppLink to={`/pisne/${id}`}>{db.songs?.find((s) => s.id === id)?.name ?? "Píseň"}</AppLink>
              </span>
              <span className="compact-row__quick">
                <IconButton
                  label="Posunout píseň nahoru"
                  disabled={pending || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </IconButton>
                <IconButton
                  label="Posunout píseň dolů"
                  disabled={pending || index === ids.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Odebrat ${db.songs?.find((s) => s.id === id)?.name ?? "píseň"}`}
                  disabled={pending}
                  onClick={() => setIds(ids.filter((x) => x !== id))}
                >
                  <Trash2 aria-hidden="true" />
                </IconButton>
              </span>
            </div>
          ))}
        </div>
      )}
      <label className="field">
        Hledat píseň
        <input
          aria-label="Hledat píseň"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <Select
        aria-label="Kategorie písní"
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
      <div className="bulk-picker__options">
        {db.songs
          ?.filter(
            (song) =>
              song.active &&
              (song.kind ?? "song") === kind &&
              !usedElsewhere.has(song.id) &&
              song.name
                .toLocaleLowerCase("cs")
                .includes(search.toLocaleLowerCase("cs")) &&
              (category === "all" || (song.categoryId ?? "") === category),
          )
          .map((song) => (
            <label key={song.id}>
              <input
                type="checkbox"
                disabled={pending}
                checked={ids.includes(song.id)}
                onChange={(e) =>
                  setIds(
                    e.target.checked
                      ? [...ids, song.id]
                      : ids.filter((id) => id !== song.id),
                  )
                }
              />
              {song.name}
            </label>
          ))}
      </div>
      <div className="feature-toolbar">
        <Button
          disabled={!name.trim() || (!series && !ids.length)}
          loading={save.isPending}
          variant={series ? "secondary" : "primary"}
          onClick={() => save.mutate(false)}
        >
          {series ? "Uložit návrh série" : `Přidat vybrané (${ids.length})`}
        </Button>
        {series && (
          <>
            <Button
              disabled={!name.trim() || !ids.length}
              loading={save.isPending}
              onClick={() => save.mutate(true)}
            >
              Potvrdit sérii
            </Button>
            <Button
              variant="danger"
              disabled={save.isPending}
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Smazat sérii
            </Button>
          </>
        )}
      </div>
      {(save.error || remove.error) && (
        <p className="form-error" role="alert">
          {save.error?.message ?? remove.error?.message}
        </p>
      )}
    </section>
  );
}
