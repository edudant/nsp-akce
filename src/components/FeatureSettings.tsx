import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";
import { useDatabase, databaseQueryKey } from "./DataContext";
import { Button, Card, Field, Select, Dialog, Badge } from "./Ui";
import { ListHeader, ListRow } from "./CompactList";
import { Help } from "./Help";
import type { Season } from "../lib/domain";
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
