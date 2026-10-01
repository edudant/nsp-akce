import { useSongFavorites } from "../lib/songFavorites";
import { SongFavoriteButton } from "../components/SongFavoriteButton";
import { useState } from "react";
import { useDatabase } from "../components/DataContext";
import { PageHeader } from "../components/PageHeader";
import { ListRow } from "../components/CompactList";
import { Card, Select, Dialog, Badge, IconButton } from "../components/Ui";
import { Plus, Star } from "lucide-react";
import { AppLink, navigate } from "../components/Router";
import { ErrorState, LoadingState } from "../components/DataStates";
import { RepertoireEditor } from "../components/RepertoireEditor";
import { CarolImport } from "../components/CarolImport";
import { ProgramImport } from "./ProgramTextPage";
export function TextsPage({
  section,
  canEdit,
}: {
  section: "pasma" | "pisne" | "koledy";
  canEdit: boolean;
}) {
  const favorites = useSongFavorites(section !== "pasma");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const db = useDatabase();
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState("name");
  const [filter, setFilter] = useState("active");
  const [category, setCategory] = useState("all");
  const [adding, setAdding] = useState(false);
  if (db.isPending) return <LoadingState />;
  if (db.error)
    return (
      <ErrorState
        message={db.error.message}
        onRetry={() => void db.refetch()}
      />
    );
  const programs = section === "pasma";
  const kind = programs ? "program" : section === "koledy" ? "carol" : "song";
  const normal = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("cs");
  const items = (
    programs
      ? (db.data.programCatalog ?? [])
      : (db.data.songs ?? []).filter((s) => (s.kind ?? "song") === kind)
  )
    .filter(
      (i) =>
        (!favoritesOnly || programs || favorites.ids.includes(i.id)) &&
        normal(i.name).includes(normal(search)) &&
        (filter === "all" || (filter === "active" ? i.active : !i.active)) &&
        (category === "all" ||
          ("categoryId" in i && (i.categoryId ?? "") === category)),
    )
    .sort(
      (a, b) =>
        (!programs
          ? Number(favorites.ids.includes(b.id)) -
            Number(favorites.ids.includes(a.id))
          : 0) ||
        (order === "reverse"
          ? b.name.localeCompare(a.name, "cs")
          : order === "position" && "sortOrder" in a && "sortOrder" in b
            ? a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "cs")
            : a.name.localeCompare(b.name, "cs")),
    );
  return (
    <div className="page">
      <PageHeader
        title="Texty"
        actions={
          canEdit ? (
            <IconButton
              label={
                programs
                  ? "Přidat pásmo"
                  : kind === "carol"
                    ? "Přidat koledu"
                    : "Přidat písničku"
              }
              onClick={() => setAdding(true)}
            >
              <Plus aria-hidden="true" />
            </IconButton>
          ) : undefined
        }
      />
      <nav aria-label="Druh textů" className="feature-toolbar text-tabs">
        {(
          [
            ["pasma", "Pásma"],
            ["pisne", "Písničky"],
            ["koledy", "Koledy"],
          ] as const
        ).map(([id, label]) => (
          <AppLink
            key={id}
            to={`/texty/${id}`}
            className={`button button--${section === id ? "primary" : "secondary"} button--small`}
            aria-current={section === id ? "page" : undefined}
          >
            {label}
          </AppLink>
        ))}
      </nav>
      <Card>
        <input
          className="list-search"
          aria-label="Hledat text"
          placeholder="Hledat podle názvu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="feature-toolbar">
          {!programs && (
            <button
              type="button"
              className={`button button--${favoritesOnly ? "primary" : "secondary"} button--small`}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly(!favoritesOnly)}
            >
              <Star
                aria-hidden="true"
                fill={favoritesOnly ? "currentColor" : "none"}
              />
              Oblíbené
            </button>
          )}
          <Select
            aria-label="Řazení textů"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          >
            <option value="name">Název A–Z</option>
            <option value="reverse">Název Z–A</option>
            {programs && <option value="position">Pořadí pásma</option>}
          </Select>
          <Select
            aria-label="Aktivita textů"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="active">Aktivní</option>
            <option value="all">Všechny</option>
            <option value="hidden">Skryté</option>
          </Select>
          {!programs && (
            <Select
              aria-label="Kategorie textů"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">Všechny kategorie</option>
              <option value="">Bez kategorie</option>
              {db.data.songCategories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="compact-list">
          {items.map((item) => (
            <ListRow
              key={item.id}
              title={item.name}
              subtitle={
                !programs
                  ? "hasText" in item && item.hasText
                    ? "Text doplněn"
                    : "Text zatím není doplněný"
                  : undefined
              }
              meta={!item.active ? <Badge>Skryté</Badge> : undefined}
              onOpen={() =>
                navigate(programs ? `/pasma/${item.id}` : `/pisne/${item.id}`)
              }
            >
              {!programs && (
                <SongFavoriteButton
                  name={item.name}
                  favorite={favorites.ids.includes(item.id)}
                  disabled={!favorites.ready || favorites.pendingId === item.id}
                  onToggle={() => favorites.toggle(item.id)}
                />
              )}
            </ListRow>
          ))}
        </div>
        {!programs && favorites.error && (
          <p className="form-error" role="alert">
            Oblíbené se nepodařilo načíst nebo uložit. Zkuste to znovu.
          </p>
        )}
        {!items.length && <p>Žádné položky pro vybraný filtr.</p>}
      </Card>
      {canEdit && (
        <Dialog
          open={adding}
          title={
            programs
              ? "Nové pásmo"
              : kind === "carol"
                ? "Nová koleda"
                : "Nová písnička"
          }
          onClose={() => setAdding(false)}
        >
          {adding && (
            <RepertoireEditor
              kind={kind}
              onSaved={(id) => {
                setAdding(false);
                if (id) navigate(programs ? `/pasma/${id}` : `/pisne/${id}`);
              }}
            />
          )}
        </Dialog>
      )}
      {canEdit && programs && (
        <Card>
          <details>
            <summary>Import textů pásem</summary>
            <ProgramImport />
          </details>
        </Card>
      )}
      {canEdit && kind === "carol" && (
        <Card>
          <details>
            <summary>Import zpěvníku</summary>
            <CarolImport />
          </details>
        </Card>
      )}
    </div>
  );
}
