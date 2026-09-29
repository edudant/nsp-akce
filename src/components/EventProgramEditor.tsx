import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Save,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { Button, Card, IconButton, Select, Badge } from "./Ui";
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

function programUpdateSignature(items: EventProgramUpdateItem[]) {
  return JSON.stringify(
    items.map((item) => ({
      id: item.id ?? null,
      catalogId: item.catalogId ?? null,
      customName: item.customName?.trim() ?? null,
    })),
  );
}

export function EventProgramEditor({
  items,
  catalog,
  eventBlocks,
  pairsPublished,
  loading,
  error,
  success,
  onSave,
}: {
  items: EventProgramItem[];
  catalog: ProgramCatalogItem[];
  eventBlocks: PairingBlock[];
  pairsPublished: boolean;
  loading: boolean;
  error?: string;
  success?: string;
  onSave: (items: EventProgramUpdateItem[]) => void;
}) {
  const originalItems = [...items].sort(
    (first, second) => first.sortOrder - second.sortOrder,
  );
  const [draftItems, setDraftItems] = useState<EditableEventProgramItem[]>(() =>
    originalItems.map(toEditableProgramItem),
  );
  const [catalogChoice, setCatalogChoice] = useState("");
  const [customName, setCustomName] = useState("");
  const [validationError, setValidationError] = useState("");

  const selectedCatalogIds = new Set(
    draftItems.flatMap((item) => (item.catalogId ? [item.catalogId] : [])),
  );
  const availableCatalog = catalog
    .filter((item) => item.active && !selectedCatalogIds.has(item.id))
    .sort(
      (first, second) =>
        first.sortOrder - second.sortOrder ||
        first.name.localeCompare(second.name, "cs"),
    );
  const originalSignature = programUpdateSignature(
    originalItems.map(toEditableProgramItem).map(toProgramUpdateItem),
  );
  const updateItems = draftItems.map(toProgramUpdateItem);
  const dirty = programUpdateSignature(updateItems) !== originalSignature;

  const isProtectedByPublishedBlock = (item: EditableEventProgramItem) =>
    Boolean(
      pairsPublished &&
      item.persistedId &&
      eventBlocks.some(
        (block) =>
          block.appliesToAll ||
          block.programItemIds.includes(item.persistedId as string),
      ),
    );

  const addCatalogItem = () => {
    const catalogItem = catalog.find((item) => item.id === catalogChoice);
    if (!catalogItem || selectedCatalogIds.has(catalogItem.id)) return;
    const original = originalItems.find(
      (item) => item.catalogId === catalogItem.id,
    );
    setDraftItems((current) => [
      ...current,
      original
        ? toEditableProgramItem(original)
        : {
            key: `catalog-${catalogItem.id}`,
            name: catalogItem.name,
            catalogId: catalogItem.id,
            custom: false,
          },
    ]);
    setCatalogChoice("");
    setValidationError("");
  };

  const addCustomItem = () => {
    const name = customName.trim();
    if (!name) {
      setValidationError("Zadejte název vlastního pásma.");
      return;
    }
    if (name.length > 120) {
      setValidationError("Název vlastního pásma může mít nejvýše 120 znaků.");
      return;
    }
    if (
      draftItems.some(
        (item) =>
          item.name.trim().toLocaleLowerCase("cs") ===
          name.toLocaleLowerCase("cs"),
      )
    ) {
      setValidationError("Pásmo s tímto názvem už je v programu.");
      return;
    }
    const original = originalItems.find(
      (item) =>
        item.custom &&
        item.name.trim().toLocaleLowerCase("cs") ===
          name.toLocaleLowerCase("cs"),
    );
    setDraftItems((current) => [
      ...current,
      original
        ? toEditableProgramItem(original)
        : {
            key: `custom-${name.toLocaleLowerCase("cs")}`,
            name,
            custom: true,
          },
    ]);
    setCustomName("");
    setValidationError("");
  };

  const moveItem = (index: number, offset: -1 | 1) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= draftItems.length) return;
    setDraftItems((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setValidationError("");
  };

  const removeItem = (item: EditableEventProgramItem) => {
    if (isProtectedByPublishedBlock(item)) return;
    setDraftItems((current) =>
      current.filter((candidate) => candidate.key !== item.key),
    );
    setValidationError("");
  };

  return (
    <Card className="event-program-editor">
      <div className="card-heading event-program-editor__heading">
        <div>
          <span className="eyebrow">Program akce</span>
          <h2>Pásma a jejich pořadí</h2>
          <p>
            Vyberte pásma z katalogu nebo přidejte název jen pro tuto akci.
          </p>
        </div>
        <div className="event-program-editor__actions">
          {success ? (
            <span aria-live="polite" className="save-indicator">
              <CheckCircle2 aria-hidden="true" />
              {success}
            </span>
          ) : null}
          <Button
            disabled={!dirty}
            loading={loading}
            onClick={() => onSave(updateItems)}
            size="small"
          >
            <Save aria-hidden="true" />
            Uložit program
          </Button>
        </div>
      </div>

      {draftItems.length ? (
        <ol className="event-program-editor__list">
          {draftItems.map((item, index) => {
            const protectedItem = isProtectedByPublishedBlock(item);
            return (
              <li className="event-program-editor__row" key={item.key}>
                <span
                  className="event-program-editor__order"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="event-program-editor__name">
                  <strong>{item.name}</strong>
                  <span>
                    <Badge tone={item.custom ? "amber" : "green"}>
                      {item.custom ? "Vlastní" : "Katalog"}
                    </Badge>
                    {protectedItem ? (
                      <Badge tone="blue">Použito ve zveřejněných párech</Badge>
                    ) : null}
                  </span>
                </span>
                <span className="event-program-editor__controls">
                  <IconButton
                    disabled={index === 0 || loading}
                    label={`Posunout ${item.name} nahoru`}
                    onClick={() => moveItem(index, -1)}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    disabled={index === draftItems.length - 1 || loading}
                    label={`Posunout ${item.name} dolů`}
                    onClick={() => moveItem(index, 1)}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    className="event-program-editor__remove"
                    disabled={protectedItem || loading}
                    label={
                      protectedItem
                        ? `${item.name} nelze odebrat, protože je použito ve zveřejněných párech`
                        : `Odebrat ${item.name}`
                    }
                    onClick={() => removeItem(item)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="event-program-editor__empty">
          Program je prázdný. Akce se při započítání párů bere jako jeden
          celek.
        </p>
      )}

      <div className="event-program-editor__additions">
        <div className="event-program-editor__add-row">
          <label htmlFor="event-program-catalog">Přidat z katalogu</label>
          <div>
            <Select
              disabled={!availableCatalog.length || loading}
              id="event-program-catalog"
              onChange={(inputEvent) =>
                setCatalogChoice(inputEvent.target.value)
              }
              value={catalogChoice}
            >
              <option value="">
                {availableCatalog.length
                  ? "Vyberte pásmo…"
                  : "Všechna aktivní pásma jsou vybraná"}
              </option>
              {availableCatalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Button
              disabled={!catalogChoice}
              onClick={addCatalogItem}
              size="small"
              type="button"
              variant="secondary"
            >
              <Plus aria-hidden="true" />
              Přidat
            </Button>
          </div>
        </div>
        <div className="event-program-editor__add-row">
          <label htmlFor="event-program-custom">
            Vlastní název pro tuto akci
          </label>
          <div>
            <input
              disabled={loading}
              id="event-program-custom"
              maxLength={120}
              onChange={(inputEvent) => setCustomName(inputEvent.target.value)}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === "Enter") {
                  keyboardEvent.preventDefault();
                  addCustomItem();
                }
              }}
              placeholder="Např. Překvapení na závěr"
              type="text"
              value={customName}
            />
            <Button
              disabled={!customName.trim()}
              onClick={addCustomItem}
              size="small"
              type="button"
              variant="secondary"
            >
              <Plus aria-hidden="true" />
              Přidat
            </Button>
          </div>
        </div>
      </div>

      {pairsPublished ? (
        <p className="event-program-editor__hint">
          Pásmo použité blokem zveřejněného párování lze přesunout, ale ne
          odebrat.
        </p>
      ) : null}
      {validationError || error ? (
        <p className="inline-error" role="alert">
          {validationError || error}
        </p>
      ) : null}
    </Card>
  );
}
