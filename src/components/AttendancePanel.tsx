import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AppDatabase,
  EnsembleEvent,
  AttendanceRecord,
  InterestStatus,
  Member,
} from "../lib/domain";
import { attendanceLabels, interestLabels } from "../lib/domain";
import {
  sortedRoster,
  memberActivity,
  compatibleMembers,
} from "../lib/ensembleRules";
import { appApi } from "../lib/dataApi";
import { databaseQueryKey } from "./DataContext";
import { Button, Card, Dialog, Select } from "./Ui";
import { Help } from "./Help";
export function ResponseEditor({
  event,
  record,
  admin,
  onSave,
  pending,
}: {
  event: EnsembleEvent;
  record: AttendanceRecord;
  admin?: boolean;
  onSave: (response: InterestStatus, note: string) => void;
  pending: boolean;
}) {
  const [response, setResponse] = useState<InterestStatus>(record.interest);
  const [note, setNote] = useState(record.note ?? "");
  const allowed = admin || event.canRespond;
  return (
    <form
      className="feature-toolbar"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(response, note);
      }}
    >
      <Select
        aria-label="Odpověď"
        value={response}
        disabled={!allowed || pending}
        onChange={(e) => setResponse(e.target.value as InterestStatus)}
      >
        <option value="unset">Bez odpovědi</option>
        <option value="yes">Ano</option>
        <option value="no">Ne</option>
        {event.type === "performance" && (
          <option value="maybe">Zatím nevím</option>
        )}
      </Select>
      {event.type === "performance" && (
        <input
          aria-label="Poznámka k odpovědi"
          placeholder={response === "maybe" ? "Povinná poznámka" : "Poznámka"}
          maxLength={500}
          required={response === "maybe"}
          disabled={!allowed || pending}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      <Button type="submit" disabled={!allowed} loading={pending}>
        Uložit odpověď
      </Button>
    </form>
  );
}
export function AttendancePanel({
  db,
  event,
  admin,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  admin: boolean;
}) {
  const query = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"activity" | "name">("activity");
  const [responses, setResponses] = useState(false);
  const update = useMutation({
    mutationFn: ({
      memberId,
      patch,
    }: {
      memberId: string;
      patch: Partial<AttendanceRecord>;
    }) => appApi.updateAttendance(event.id, memberId, patch),
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: databaseQueryKey });
    },
  });
  const selectedIds = new Set(
    event.attendance.filter((r) => r.selected).map((r) => r.memberId),
  );
  const selected = sortedRoster(
    db,
    db.members.filter((m) => selectedIds.has(m.id)),
    search,
    sort,
    event.seasonId,
  );
  const available = sortedRoster(
    db,
    db.members.filter((m) => m.active && !selectedIds.has(m.id)),
    search,
    sort,
    event.seasonId,
  );
  const visibleIds = new Set(event.attendance.map((r) => r.memberId));
  const list =
    admin && !responses
      ? selected
      : sortedRoster(
          db,
          db.members.filter((m) => visibleIds.has(m.id)),
          search,
          sort,
          event.seasonId,
        );
  return (
    <Card className="feature-card">
      <h2>
        {admin ? "Účastníci" : "Účast na události"}{" "}
        {admin && `(${selectedIds.size})`}
      </h2>
      <Help title="Výběr a skutečná účast">
        <p>
          Přidejte členy, kteří jsou na události přítomní. Tento výběr používá
          generátor párů. Odebrání z výběru nemaže odpověď ani zapsanou
          docházku; skutečnou účast upravte samostatně. Při uzavření zkoušky se
          nezapsaná účast předvyplní z odpovědí ano/ne.
        </p>
        <p>
          Aktivita řadí podle počtu absolvovaných zkoušek v sezóně události, pak
          poslední účasti a jména. Předběžná odpověď se za aktivitu nepočítá.
        </p>
      </Help>
      <div className="feature-toolbar">
        <input
          aria-label="Hledat účastníka"
          placeholder="Hledat jméno…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Řazení účastníků"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="activity">Aktivita</option>
          <option value="name">Jméno</option>
        </Select>
        {admin && (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(true);
                setSearch("");
              }}
            >
              Přidat člena
            </Button>
            <Button variant="ghost" onClick={() => setResponses(!responses)}>
              {responses ? "Vybraní účastníci" : "Všechny odpovědi"}
            </Button>
          </>
        )}
      </div>
      <div className="feature-list">
        {list.map((member) => {
          const record = event.attendance.find(
            (r) => r.memberId === member.id,
          )!;
          const activity = memberActivity(db, member.id, event.seasonId);
          return (
            <div key={member.id} className="attendance-entry">
              <span>
                <strong>{member.fullName}</strong>
                <small>
                  {activity.count} zkoušek · {interestLabels[record.interest]} ·{" "}
                  {attendanceLabels[record.status]}
                  {record.actualStanding
                    ? " · skutečně stál"
                    : record.standing
                      ? " · má stát"
                      : ""}
                </small>
                {record.note && <small>{record.note}</small>}
              </span>
              {admin && responses ? (
                <div>
                  <ResponseEditor
                    key={`${member.id}:${record.interest}:${record.note}`}
                    event={event}
                    record={record}
                    admin
                    pending={update.isPending}
                    onSave={(interest, note) =>
                      update.mutate({
                        memberId: member.id,
                        patch: { interest, note },
                      })
                    }
                  />
                  {event.type === "performance" &&
                    event.seasonKind !== "carols" && (
                      <AdminWishes
                        key={JSON.stringify(
                          db.partnerWishes?.filter(
                            (w) =>
                              w.memberId === member.id &&
                              w.eventId === event.id,
                          ),
                        )}
                        db={db}
                        event={event}
                        member={member}
                      />
                    )}
                </div>
              ) : (
                admin && (
                  <>
                    <Select
                      aria-label={`Skutečná účast ${member.fullName}`}
                      disabled={update.isPending}
                      value={record.status}
                      onChange={(e) =>
                        update.mutate({
                          memberId: member.id,
                          patch: {
                            status: e.target
                              .value as AttendanceRecord["status"],
                            attendancePercent:
                              e.target.value === "partial" ? 50 : undefined,
                          },
                        })
                      }
                    >
                      <option value="unknown">Nezapsáno</option>
                      <option value="present">Přítomen</option>
                      <option value="partial">Částečně</option>
                      <option value="absent">Nepřítomen</option>
                    </Select>
                    {record.status === "partial" && (
                      <label>
                        Účast %{" "}
                        <input
                          key={record.attendancePercent}
                          aria-label={`Procento účasti ${member.fullName}`}
                          type="number"
                          min="0.001"
                          max="99.999"
                          step="0.001"
                          defaultValue={record.attendancePercent ?? 50}
                          onBlur={(e) => {
                            if (e.target.checkValidity())
                              update.mutate({
                                memberId: member.id,
                                patch: {
                                  status: "partial",
                                  attendancePercent: Number(e.target.value),
                                },
                              });
                          }}
                        />
                      </label>
                    )}
                    <Button
                      disabled={update.isPending}
                      variant="ghost"
                      onClick={() =>
                        update.mutate({
                          memberId: member.id,
                          patch: { selected: false },
                        })
                      }
                    >
                      Odebrat
                    </Button>
                  </>
                )
              )}
            </div>
          );
        })}
      </div>
      {list.length === 0 && (
        <p>
          Žádní vybraní členové. Přidejte je ze seznamu všech nebo uzavřete
          zkoušku pro předvyplnění účasti.
        </p>
      )}
      {update.error && (
        <p role="alert" className="form-error">
          {update.error.message}
        </p>
      )}
      {admin && (
        <Dialog
          title="Přidat účastníky"
          open={adding}
          onClose={() => setAdding(false)}
        >
          <div className="feature-toolbar">
            <input
              autoFocus
              aria-label="Hledat člena k přidání"
              placeholder="Hledat jméno…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              aria-label="Řazení při přidávání"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              <option value="activity">Aktivita</option>
              <option value="name">Jméno</option>
            </Select>
          </div>
          <div className="feature-list">
            {available.map((m) => (
              <div key={m.id}>
                <span>
                  {m.fullName}
                  <small>
                    {memberActivity(db, m.id, event.seasonId).count} zkoušek ·{" "}
                    {
                      interestLabels[
                        event.attendance.find((r) => r.memberId === m.id)
                          ?.interest ?? "unset"
                      ]
                    }
                  </small>
                </span>
                <Button
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({ memberId: m.id, patch: { selected: true } })
                  }
                >
                  Přidat
                </Button>
              </div>
            ))}
          </div>
          {update.error && (
            <p role="alert" className="form-error">
              {update.error.message}
            </p>
          )}
        </Dialog>
      )}
    </Card>
  );
}

function AdminWishes({
  db,
  event,
  member,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  member: Member;
}) {
  const query = useQueryClient();
  const [ids, setIds] = useState(
    (db.partnerWishes ?? [])
      .filter((w) => w.eventId === event.id && w.memberId === member.id)
      .map((w) => w.partnerId),
  );
  const save = useMutation({
    mutationFn: () => appApi.setPartnerWishes(event.id, member.id, ids),
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: databaseQueryKey });
    },
  });
  return (
    <details>
      <summary>Přání partnerů pro {member.fullName}</summary>
      <div className="standing-picker">
        {db.members
          .filter(
            (m) =>
              m.active &&
              compatibleMembers(member, m) &&
              !db.preferences.some(
                (p) =>
                  p.kind === "forbidden" &&
                  (!p.validFrom || p.validFrom <= event.date) &&
                  (!p.validTo || p.validTo >= event.date) &&
                  [p.memberAId, p.memberBId].includes(member.id) &&
                  [p.memberAId, p.memberBId].includes(m.id),
              ),
          )
          .map((m) => (
            <label key={m.id}>
              <input
                type="checkbox"
                checked={ids.includes(m.id)}
                onChange={(e) =>
                  setIds(
                    e.target.checked
                      ? [...ids, m.id]
                      : ids.filter((id) => id !== m.id),
                  )
                }
              />
              {m.fullName}
            </label>
          ))}
      </div>
      <Button loading={save.isPending} onClick={() => save.mutate()}>
        Uložit přání za člena
      </Button>
      {save.error && (
        <p role="alert" className="form-error">
          {save.error.message}
        </p>
      )}
    </details>
  );
}
