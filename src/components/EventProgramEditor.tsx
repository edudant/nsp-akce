import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Card, IconButton, Dialog } from "./Ui";
import type {
  EventProgramItem,
  EventProgramUpdateItem,
  PairingBlock,
  ProgramCatalogItem,
} from "../lib/domain";
interface EditableEventProgramItem {
  key: string;
  persistedId?: string;
  name: string;
  catalogId?: string;
  custom: boolean;
}

function toEditableProgramItem(
  item: EventProgramItem,
): EditableEventProgramItem {
  return {
    key: item.id,
    persistedId: item.id,
    name: item.name,
    catalogId: item.catalogId,
    custom: item.custom,
  };
}

function toProgramUpdateItem(
  item: EditableEventProgramItem,
): EventProgramUpdateItem {
  return item.catalogId
    ? { id: item.persistedId, catalogId: item.catalogId }
    : { id: item.persistedId, customName: item.name };
}

export function EventProgramEditor({
  items,
  catalog,
  eventBlocks,
  pairsPublished,
  loading,
  error,
  onSave,
}: {
  items: EventProgramItem[];
  catalog: ProgramCatalogItem[];
  eventBlocks: PairingBlock[];
  pairsPublished: boolean;
  loading: boolean;
  error?: string;
  success?: string;
  onSave: (items: EventProgramUpdateItem[]) => Promise<void>;
}) {
  const originalItems = [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(toEditableProgramItem);
  const [adding, setAdding] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const [search, setSearch] = useState("");
  const [validationError, setValidationError] = useState("");
  const available = catalog
    .filter(
      (item) => item.active && !items.some((p) => p.catalogId === item.id),
    )
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "cs"),
    );
  const protectedItem = (item: EditableEventProgramItem) =>
    pairsPublished &&
    eventBlocks.some(
      (b) =>
        b.appliesToAll || b.programItemIds.includes(item.persistedId ?? ""),
    );
  const save = async (next: EditableEventProgramItem[]) => {
    try {
      await onSave(next.map(toProgramUpdateItem));
      return true;
    } catch {
      return false;
    }
  };
  const add = async () => {
    const name = customName.trim();
    const selected = available.filter((item) => ids.includes(item.id));
    if (
      name &&
      [...originalItems, ...selected].some(
        (item) =>
          item.name.toLocaleLowerCase("cs") === name.toLocaleLowerCase("cs"),
      )
    ) {
      setValidationError("Pásmo s tímto názvem už je v programu.");
      return;
    }
    const next = [
      ...originalItems,
      ...selected.map((item) => ({
        key: item.id,
        catalogId: item.id,
        name: item.name,
        custom: false,
      })),
      ...(name ? [{ key: `custom-${name}`, name, custom: true }] : []),
    ];
    if (await save(next)) {
      setAdding(false);
      setIds([]);
      setCustomName("");
      setSearch("");
      setValidationError("");
    }
  };
  const move = (index: number, offset: number) => {
    const next = [...originalItems];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    void save(next);
  };
  return (
    <Card className="feature-card">
      <header className="compact-list__header">
        <h2>Pásma</h2>
        <IconButton label="Přidat pásma" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
        </IconButton>
      </header>
      <div className="compact-list">
        {originalItems.map((item, index) => (
          <div className="compact-row compact-row--readonly" key={item.key}>
            <span className="compact-row__title">
              {index + 1}. {item.name}
            </span>
            <span className="compact-row__quick">
              <IconButton
                disabled={loading || index === 0}
                label={`Posunout ${item.name} nahoru`}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden="true" />
              </IconButton>
              <IconButton
                disabled={loading || index === originalItems.length - 1}
                label={`Posunout ${item.name} dolů`}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden="true" />
              </IconButton>
              <IconButton
                disabled={loading || protectedItem(item)}
                label={`Odebrat ${item.name}`}
                onClick={() =>
                  void save(originalItems.filter((p) => p.key !== item.key))
                }
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            </span>
          </div>
        ))}
      </div>
      {!originalItems.length && <p>Zatím žádná pásma.</p>}
      {error && !adding && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Dialog
        open={adding}
        title="Přidat pásma"
        onClose={() => {
          if (!loading) setAdding(false);
        }}
      >
        <div className="bulk-picker">
          <label className="field">
            Hledat pásmo
            <input
              aria-label="Hledat pásmo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="bulk-picker__options">
            {available
              .filter((item) =>
                item.name
                  .toLocaleLowerCase("cs")
                  .includes(search.toLocaleLowerCase("cs")),
              )
              .map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    disabled={loading}
                    checked={ids.includes(item.id)}
                    onChange={(e) =>
                      setIds(
                        e.target.checked
                          ? [...ids, item.id]
                          : ids.filter((id) => id !== item.id),
                      )
                    }
                  />
                  {item.name}
                </label>
              ))}
          </div>
          <label className="field">
            Přidat vlastní pásmo
            <input
              aria-label="Přidat vlastní pásmo"
              maxLength={120}
              placeholder="Název pásma pro tuto akci"
              value={customName}
              disabled={loading}
              onChange={(e) => {
                setCustomName(e.target.value);
                setValidationError("");
              }}
            />
          </label>
          {(validationError || error) && (
            <p className="form-error" role="alert">
              {validationError || error}
            </p>
          )}
          <Button
            disabled={!ids.length && !customName.trim()}
            loading={loading}
            onClick={() => void add()}
          >
            Přidat vybraná ({ids.length + (customName.trim() ? 1 : 0)})
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
