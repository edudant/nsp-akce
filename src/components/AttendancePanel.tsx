import { MoreHorizontal } from "lucide-react";
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
import { Button, Card, Dialog, Select, Badge, IconButton } from "./Ui";
import { ListHeader, ListRow } from "./CompactList";
import { AuditDisclosure } from "./EventAudit";
import { formatAuditTime } from "./formatters";
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
        if (response === "maybe" && !note.trim()) return;
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
        <option value="maybe">Zatím nevím</option>
      </Select>
      {(response === "maybe" || event.type === "performance" || !!note) && (
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
  const [quickId, setQuickId] = useState<string | null>(null);
  const [addIds, setAddIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [sort, setSort] = useState<"activity" | "name">("activity");
  const [responses, setResponses] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: ({
      memberId,
      patch,
    }: {
      memberId: string;
      patch: Partial<AttendanceRecord>;
    }) => appApi.updateAttendance(event.id, memberId, patch),
    onSuccess: async () => {
      await Promise.all([
        query.invalidateQueries({ queryKey: databaseQueryKey }),
        query.invalidateQueries({ queryKey: ["event-audit"] }),
        query.invalidateQueries({ queryKey: ["scores"] }),
      ]);
    },
  });
  const batchAdd = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const memberId of ids) {
        await appApi.updateAttendance(event.id, memberId, {
          selected: true,
          status: "present",
        });
        setAddIds((current) => current.filter((id) => id !== memberId));
      }
    },
    onSettled: async (_, error) => {
      await query.invalidateQueries({ queryKey: databaseQueryKey });
      await query.invalidateQueries({ queryKey: ["event-audit"] });
      await query.invalidateQueries({ queryKey: ["scores"] });
      if (!error) setAdding(false);
    },
  });
  const relevant = (r: AttendanceRecord) =>
    r.selected ||
    r.status === "present" ||
    r.status === "partial" ||
    r.interest === "yes";
  const rosterIds = new Set(
    event.attendance.filter(relevant).map((r) => r.memberId),
  );
  const list = sortedRoster(
    db,
    db.members.filter((m) =>
      event.attendance.some(
        (r) =>
          r.memberId === m.id &&
          (responses
            ? r.interest !== "unset" || r.status !== "unknown" || r.selected
            : relevant(r)),
      ),
    ),
    search,
    sort,
    event.seasonId,
  );
  const available = sortedRoster(
    db,
    db.members.filter((m) => m.active && !rosterIds.has(m.id)),
    addSearch,
    sort,
    event.seasonId,
  );
  const detailMember = db.members.find((m) => m.id === detailId);
  const detailRecord = event.attendance.find((r) => r.memberId === detailId);
  const setAttendance = (
    memberId: string,
    status: AttendanceRecord["status"],
  ) =>
    update.mutate({
      memberId,
      patch: {
        status,
        selected: status === "present" || status === "partial",
        attendancePercent: status === "partial" ? 50 : undefined,
      },
    });
  const attendanceSelect = (member: Member, record: AttendanceRecord) => (
    <Select
      aria-label={`Skutečná účast ${member.fullName}`}
      disabled={update.isPending}
      value={record.status}
      onChange={(e) =>
        setAttendance(member.id, e.target.value as AttendanceRecord["status"])
      }
    >
      <option value="unknown">Nezapsáno</option>
      <option value="present">Přítomen</option>
      <option value="partial">Částečně</option>
      <option value="absent">Nepřítomen</option>
      <option value="excused">Omluven</option>
    </Select>
  );
  return (
    <Card className="feature-card">
      <ListHeader
        title={`Účastníci (${rosterIds.size})`}
        addLabel="Přidat člena"
        onAdd={
          admin
            ? () => {
                setAdding(true);
                setAddSearch("");
                setAddIds([]);
              }
            : undefined
        }
      />
      {admin && (
        <Help title="Výběr a skutečná účast">
          <p>
            Přidání člena rovnou zapíše plnou účast a vybere jej pro párování.
            Rychlou volbou změníte skutečnou účast; procenta, odpověď a historii
            najdete po kliknutí na jméno. Nepřítomní a omluvení se do generátoru
            nevybírají.
          </p>
          <p>
            Uzavření převezme Ano jako přítomen a Ne jako nepřítomen pouze u
            nezapsané účasti. Zatím nevím a chybějící odpověď zůstanou
            nezapsané. Ruční záznam správce se nepřepisuje. Původní odpověď
            člena i všechny opravy jsou v auditu.
          </p>
          <p>
            Aktivita řadí podle absolvovaných zkoušek v sezóně, poslední účasti
            a jména.
          </p>
        </Help>
      )}
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
        <Button variant="ghost" onClick={() => setResponses(!responses)}>
          {responses ? "Vybraní účastníci" : "Všechny odpovědi a absence"}
        </Button>
      </div>
      <div className="compact-list">
        {list.map((member) => {
          const record = event.attendance.find(
            (r) => r.memberId === member.id,
          )!;
          return (
            <ListRow
              key={member.id}
              disabled={update.isPending}
              title={member.fullName}
              subtitle={
                <>
                  {record.memberResponse
                    ? `Člen: ${interestLabels[record.memberResponse.interest]} · ${formatAuditTime(record.memberResponse.at)}`
                    : `Odpověď: ${interestLabels[record.interest]}`}
                  {record.adminResponse && (
                    <span>
                      {" "}
                      · Odpověď správce:{" "}
                      {interestLabels[record.adminResponse.interest]} ·{" "}
                      {formatAuditTime(record.adminResponse.at)}
                    </span>
                  )}
                  {record.adminChangedAt && (
                    <span>
                      {" "}
                      · Správce: {formatAuditTime(record.adminChangedAt)}
                    </span>
                  )}
                  {record.standing && " · má stát"}
                  {record.actualStanding && " · skutečně stál"}
                </>
              }
              meta={
                <Badge>
                  {attendanceLabels[record.status]}
                  {record.status === "partial" &&
                    ` ${record.attendancePercent} %`}
                </Badge>
              }
              onOpen={() => setDetailId(member.id)}
            >
              {admin && (
                <IconButton
                  label={`Nastavit účast ${member.fullName}`}
                  disabled={update.isPending}
                  onClick={() => setQuickId(member.id)}
                >
                  <MoreHorizontal aria-hidden="true" />
                </IconButton>
              )}
            </ListRow>
          );
        })}
      </div>
      {!list.length && (
        <p>
          Zatím žádní účastníci. Přidejte člena nebo zobrazte všechny odpovědi.
        </p>
      )}
      {update.error && (
        <p role="alert" className="form-error">
          {update.error.message}
        </p>
      )}
      <Dialog
        title="Nastavit skutečnou účast"
        open={!!quickId}
        onClose={() => setQuickId(null)}
        size="small"
      >
        <div className="attendance-menu">
          {(
            ["present", "partial", "absent", "excused", "unknown"] as const
          ).map((value) => (
            <Button
              variant="secondary"
              key={value}
              disabled={update.isPending}
              onClick={() => {
                setAttendance(quickId!, value);
                setQuickId(null);
              }}
            >
              {attendanceLabels[value]}
            </Button>
          ))}
          <Button
            variant="ghost"
            onClick={() => {
              setDetailId(quickId);
              setQuickId(null);
            }}
          >
            Otevřít detail a procenta
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={!!detailMember && !!detailRecord}
        title={detailMember?.fullName ?? "Detail účastníka"}
        onClose={() => setDetailId(null)}
      >
        {detailMember && detailRecord && (
          <>
            <section className="participant-detail-section">
              <h3>Nahlášená účast</h3>
              {admin ? (
                <ResponseEditor
                  key={`${detailId}:${detailRecord.interest}:${detailRecord.note}`}
                  event={event}
                  record={detailRecord}
                  admin
                  pending={update.isPending}
                  onSave={(interest, note) =>
                    update.mutate({
                      memberId: detailMember.id,
                      patch: { interest, note },
                    })
                  }
                />
              ) : (
                <p>
                  {interestLabels[detailRecord.interest]}
                  {detailRecord.note && ` · ${detailRecord.note}`}
                </p>
              )}
            </section>
            <section className="participant-detail-section">
              <h3>Skutečná účast a body</h3>
              <p>
                <Badge>
                  {attendanceLabels[detailRecord.status]}
                  {detailRecord.status === "partial"
                    ? ` · ${detailRecord.attendancePercent} %`
                    : ""}
                </Badge>{" "}
                · {detailRecord.earnedPoints ?? 0} bodů
              </p>
              {admin ? (
                <>
                  {attendanceSelect(detailMember, detailRecord)}
                  {detailRecord.status === "partial" && (
                    <label className="field">
                      Účast %
                      <input
                        aria-label={`Procento účasti ${detailMember.fullName}`}
                        disabled={update.isPending}
                        type="number"
                        min="0.001"
                        max="99.999"
                        step="0.001"
                        defaultValue={detailRecord.attendancePercent ?? 50}
                        onBlur={(e) => {
                          if (
                            e.target.checkValidity() &&
                            Number(e.target.value) !==
                              detailRecord.attendancePercent
                          )
                            update.mutate({
                              memberId: detailMember.id,
                              patch: {
                                status: "partial",
                                attendancePercent: Number(e.target.value),
                              },
                            });
                        }}
                      />
                    </label>
                  )}
                  <p>Změny skutečné účasti se ukládají ihned.</p>
                  <Button
                    variant="ghost"
                    disabled={update.isPending}
                    onClick={() => {
                      update.mutate({
                        memberId: detailMember.id,
                        patch: { selected: false, status: "absent" },
                      });
                      setDetailId(null);
                    }}
                  >
                    Odebrat z účasti
                  </Button>
                  {event.type === "performance" &&
                    event.seasonKind !== "carols" && (
                      <AdminWishes
                        key={JSON.stringify(
                          db.partnerWishes?.filter(
                            (w) =>
                              w.memberId === detailMember.id &&
                              w.eventId === event.id,
                          ),
                        )}
                        db={db}
                        event={event}
                        member={detailMember}
                      />
                    )}
                </>
              ) : (
                <p>
                  {attendanceLabels[detailRecord.status]}
                  {detailRecord.status === "partial" &&
                    ` ${detailRecord.attendancePercent} %`}
                </p>
              )}
            </section>
            <details className="participant-response-history">
              <summary>Odpovědi a aktivita</summary>{" "}
              <p>
                {memberActivity(db, detailMember.id, event.seasonId).count}{" "}
                absolvovaných zkoušek v sezóně
              </p>
              {detailRecord.memberResponse && (
                <p>
                  <strong>Původní odpověď člena:</strong>{" "}
                  {interestLabels[detailRecord.memberResponse.interest]} ·{" "}
                  {formatAuditTime(detailRecord.memberResponse.at)}
                  {detailRecord.memberResponse.note &&
                    ` · ${detailRecord.memberResponse.note}`}
                </p>
              )}
              {detailRecord.adminResponse && (
                <p>
                  <strong>Poslední odpověď správce:</strong>{" "}
                  {interestLabels[detailRecord.adminResponse.interest]} ·{" "}
                  {formatAuditTime(detailRecord.adminResponse.at)}
                  {detailRecord.adminResponse.note &&
                    ` · ${detailRecord.adminResponse.note}`}
                </p>
              )}
            </details>
            {(admin || detailMember.id === db.myMemberId) && (
              <AuditDisclosure
                eventId={event.id}
                memberId={detailMember.id}
                title="Historie změn účasti"
              />
            )}
          </>
        )}
      </Dialog>
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
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
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
          <div className="compact-list">
            {available.map((m) => (
              <label className="compact-row" key={m.id}>
                <span className="compact-row__text">
                  <strong>{m.fullName}</strong>
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
                <input
                  type="checkbox"
                  aria-label={`Vybrat ${m.fullName}`}
                  checked={addIds.includes(m.id)}
                  disabled={batchAdd.isPending}
                  onChange={(e) =>
                    setAddIds(
                      e.target.checked
                        ? [...addIds, m.id]
                        : addIds.filter((id) => id !== m.id),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <Button
            disabled={!addIds.length}
            loading={batchAdd.isPending}
            onClick={() => batchAdd.mutate(addIds)}
          >
            Přidat vybrané ({addIds.length})
          </Button>
          {batchAdd.error && (
            <p role="alert" className="form-error">
              {batchAdd.error.message}
            </p>
          )}
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
