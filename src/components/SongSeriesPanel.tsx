import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, GripVertical, Trash2 } from "lucide-react";
import { appApi } from "../lib/dataApi";
import type { AppDatabase, EnsembleEvent, SongSeries } from "../lib/domain";
import { databaseQueryKey } from "./DataContext";
import { Card, Button, Select, Dialog, IconButton, Badge } from "./Ui";
import { AppLink } from "./Router";

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
          <IconButton label="Přidat sérii" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
          </IconButton>
        )}
      </header>
      <div className="series-list">
        {visible.map((series) => (
          <section
            className="series-view"
            key={series.id}
            aria-labelledby={`series-${series.id}`}
          >
            <header className="series-view__header">
              <h3 id={`series-${series.id}`}>{series.name}</h3>
              {admin && (
                <>
                  <Badge tone={series.confirmed ? "green" : "neutral"}>
                    {series.confirmed ? "Potvrzená" : "Návrh"}
                  </Badge>
                  <IconButton
                    label={`Upravit sérii ${series.name}`}
                    onClick={() => setEditing(series.id)}
                  >
                    <Pencil aria-hidden="true" />
                  </IconButton>
                </>
              )}
            </header>
            {series.songIds.length ? (
              <ol className="series-view__songs">
                {series.songIds.map((id) => (
                  <li key={id}>
                    <AppLink to={`/pisne/${id}`}>
                      {db.songs?.find((song) => song.id === id)?.name ??
                        "Píseň"}
                    </AppLink>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Prázdná série.</p>
            )}
          </section>
        ))}
      </div>
      {!visible.length && (
        <p>
          {carols ? "Zatím žádné série koled." : "Zatím žádné série písní."}
        </p>
      )}
      <Dialog
        open={adding}
        title={carols ? "Nová série koled" : "Nová série písní"}
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
  const [name, setName] = useState(
    series?.name ?? (event.seasonKind === "carols" ? "Koledy" : "Písně"),
  );
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
      {ids.length > 0 && (
        <SongOrderList
          db={db}
          ids={ids}
          disabled={pending}
          onRemove={(id) =>
            setIds((current) => current.filter((x) => x !== id))
          }
          onMove={(id, targetId) =>
            setIds((current) => {
              const from = current.indexOf(id),
                to = current.indexOf(targetId);
              if (from < 0 || to < 0 || from === to) return current;
              const next = [...current];
              next.splice(from, 1);
              next.splice(to, 0, id);
              return next;
            })
          }
        />
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
              !ids.includes(song.id) &&
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
          onClick={() => save.mutate(series?.confirmed ?? false)}
        >
          {series ? "Uložit sérii" : `Přidat vybrané (${ids.length})`}
        </Button>
        {series && (
          <>
            {!series.confirmed && (
              <Button
                disabled={!name.trim() || !ids.length}
                loading={save.isPending}
                onClick={() => save.mutate(true)}
              >
                Potvrdit sérii
              </Button>
            )}
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

function SongOrderList({
  db,
  ids,
  disabled,
  onMove,
  onRemove,
}: {
  db: AppDatabase;
  ids: string[];
  disabled: boolean;
  onMove: (id: string, target: string) => void;
  onRemove: (id: string) => void;
}) {
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const title = (id: string) =>
    db.songs?.find((s) => s.id === id)?.name ?? "Píseň";
  useEffect(() => {
    const finish = () => {
      drag.current = null;
      setDragged(null);
    };
    const move = (e: PointerEvent) => {
      const active = drag.current;
      if (!active || disabled || active.pointerId !== e.pointerId) return;
      if (
        !active.moved &&
        Math.hypot(e.clientX - active.x, e.clientY - active.y) < 6
      )
        return;
      e.preventDefault();
      active.moved = true;
      setDragged(active.id);
      const targetElement = document.elementFromPoint(e.clientX, e.clientY);
      const target =
        targetElement?.closest<HTMLElement>("[data-song-id]")?.dataset.songId;
      if (target && target !== active.id) {
        onMove(active.id, target);
        setAnnouncement(
          `${db.songs?.find((s) => s.id === active.id)?.name ?? "Píseň"}: změněno pořadí.`,
        );
      }
      const dialog = targetElement?.closest<HTMLElement>("[role=dialog]");
      if (dialog) {
        const rect = dialog.getBoundingClientRect();
        if (e.clientY > rect.bottom - 40) dialog.scrollBy(0, 12);
        else if (e.clientY < rect.top + 40) dialog.scrollBy(0, -12);
      }
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId === drag.current?.pointerId) finish();
    };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    window.addEventListener("blur", finish);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", finish);
    };
  }, [db, disabled, onMove]);
  return (
    <div className="song-order-list">
      <small>
        Pořadí změníte přetažením. Na klávesnici použijte šipky nahoru a dolů.
      </small>
      <ol>
        {ids.map((id, index) => (
          <li
            key={id}
            data-song-id={id}
            className={dragged === id ? "is-dragging" : undefined}
          >
            <IconButton
              label={`Přetáhnout ${title(id)}`}
              className="song-drag-handle"
              disabled={disabled}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                drag.current = {
                  id,
                  x: e.clientX,
                  y: e.clientY,
                  moved: false,
                  pointerId: e.pointerId,
                };
              }}
              onKeyDown={(e) => {
                const offset =
                  e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
                if (!offset) return;
                e.preventDefault();
                const target = ids[index + offset];
                if (target) {
                  onMove(id, target);
                  setAnnouncement(
                    `${title(id)}: pozice ${index + offset + 1} z ${ids.length}.`,
                  );
                }
              }}
            >
              <GripVertical aria-hidden="true" />
            </IconButton>
            <span className="song-order-list__title">
              <span className="song-order-list__number">{index + 1}.</span>{" "}
              <AppLink to={`/pisne/${id}`}>{title(id)}</AppLink>
            </span>
            <IconButton
              label={`Odebrat ${title(id)}`}
              disabled={disabled}
              onClick={() => onRemove(id)}
            >
              <Trash2 aria-hidden="true" />
            </IconButton>
          </li>
        ))}
      </ol>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
