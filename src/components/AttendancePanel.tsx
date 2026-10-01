import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AppDatabase,
  EnsembleEvent,
  AttendanceRecord,
  AttendanceDefaults,
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
import { Button, Card, Dialog, Select, Badge } from "./Ui";
import { ListHeader, ListRow } from "./CompactList";
import { AuditDisclosure } from "./EventAudit";
import { formatAuditTime } from "./formatters";
import { Help } from "./Help";
import { ChoiceButtons, responseChoices, ResponseBadge } from "./Participation";
import { canRespondToEvent, eventHasStarted } from "../lib/memberPortal";
import { todayInPrague } from "./formatters";
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
  onSave: (response: InterestStatus, note: string) => void | Promise<unknown>;
  pending: boolean;
}) {
  const [response, setResponse] = useState<InterestStatus>(record.interest);
  const [note, setNote] = useState(record.note ?? "");
  const allowed = admin || canRespondToEvent(event, todayInPrague());
  return (
    <form
      className="response-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (response === "maybe" && !note.trim()) return;
        try {
          await onSave(response, note);
        } catch {
          // Keep the draft note available for retry; the parent shows the error.
        }
      }}
    >
      <ChoiceButtons
        label="Odpověď"
        value={response}
        disabled={!allowed || pending}
        choices={
          admin
            ? [...responseChoices, { value: "unset", label: "Bez odpovědi" }]
            : responseChoices
        }
        onChange={async (value) => {
          setResponse(value);
          if (admin && (value !== "maybe" || note.trim())) {
            try {
              await onSave(value, note);
            } catch {
              setResponse(record.interest);
            }
          }
        }}
      />
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
      {(!admin ||
        response === "maybe" ||
        event.type === "performance" ||
        !!note) && (
        <Button
          type="submit"
          size={admin ? "small" : "medium"}
          disabled={
            !allowed ||
            (response === "unset" && !admin) ||
            (response === "maybe" && !note.trim()) ||
            (admin &&
              response === record.interest &&
              note === (record.note ?? ""))
          }
          loading={pending}
        >
          {admin ? "Uložit poznámku" : "Uložit odpověď"}
        </Button>
      )}
      {admin && (
        <small>Odpověď se uloží výběrem. Poznámku uložte tlačítkem.</small>
      )}
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
  const [addIds, setAddIds] = useState<string[]>([]);
  const [addDefaults, setAddDefaults] = useState<AttendanceDefaults>({
    interest: "unset",
    status: "present",
    attendancePercent: 50,
    note: "",
  });
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
    mutationFn: (ids: string[]) =>
      appApi.addAttendanceBatch(event.id, ids, {
        interest: addDefaults.interest,
        status: addDefaults.status,
        note: addDefaults.note,
        ...(addDefaults.status === "partial"
          ? { attendancePercent: addDefaults.attendancePercent }
          : {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        query.invalidateQueries({ queryKey: databaseQueryKey }),
        query.invalidateQueries({ queryKey: ["event-audit"] }),
        query.invalidateQueries({ queryKey: ["scores"] }),
      ]);
      setAddIds([]);
      setAdding(false);
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
  const started = eventHasStarted(event);
  const attendanceSwitches = (member: Member, record: AttendanceRecord) => (
    <ChoiceButtons
      label={`Skutečná účast ${member.fullName}`}
      value={record.status}
      disabled={update.isPending}
      choices={[
        { value: "present", label: "Přítomen" },
        { value: "partial", label: "Částečně" },
        { value: "absent", label: "Nepřítomen" },
        { value: "excused", label: "Omluven" },
        { value: "unknown", label: "Nezapsáno" },
      ]}
      onChange={(value) => setAttendance(member.id, value)}
    />
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
                batchAdd.reset();
              }
            : undefined
        }
      />
      <p className="attendance-view-label">
        {started ? "Skutečná účast" : "Nahlášená účast"}
      </p>
      {admin && started && event.status !== "closed" && (
        <p className="attendance-prefill-hint">
          Při uzavření akce se nezapsaná skutečná účast převezme z odpovědí.
          Ruční změny zůstanou zachované.
        </p>
      )}
      {admin && (
        <Help title="Výběr a skutečná účast">
          <p>
            Při přidání členů nastavíte společnou nahlášenou a skutečnou účast.
            V detailu přepínači změníte skutečnou účast; procenta, odpověď a
            historii najdete po kliknutí na jméno. Nepřítomní a omluvení se do
            generátoru nevybírají.
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
                </>
              }
              meta={
                started ? (
                  <Badge>
                    {attendanceLabels[record.status]}
                    {record.status === "partial" &&
                      ` ${record.attendancePercent} %`}
                  </Badge>
                ) : (
                  <ResponseBadge response={record.interest} />
                )
              }
              onOpen={() => setDetailId(member.id)}
            />
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
        open={!!detailMember && !!detailRecord}
        title={detailMember?.fullName ?? "Detail účastníka"}
        onClose={() => setDetailId(null)}
      >
        {detailMember && detailRecord && (
          <div
            className={`participant-detail ${started ? "participant-detail--actual" : ""}`}
          >
            <section className="participant-detail-section participant-detail-response">
              <h3>Nahlášená účast</h3>
              {admin ? (
                <ResponseEditor
                  key={`${detailId}:${detailRecord.interest}:${detailRecord.note}`}
                  event={event}
                  record={detailRecord}
                  admin
                  pending={update.isPending}
                  onSave={(interest, note) =>
                    update.mutateAsync({
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
            <section className="participant-detail-section participant-detail-actual">
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
                  {attendanceSwitches(detailMember, detailRecord)}
                  {detailRecord.status === "partial" && (
                    <AttendancePercentEditor
                      key={`${detailMember.id}:${detailRecord.attendancePercent}`}
                      memberName={detailMember.fullName}
                      percent={detailRecord.attendancePercent ?? 50}
                      pending={update.isPending}
                      onSave={(attendancePercent) =>
                        update.mutate({
                          memberId: detailMember.id,
                          patch: { status: "partial", attendancePercent },
                        })
                      }
                    />
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
            {update.error && (
              <p role="alert" className="form-error">
                {update.error.message}
              </p>
            )}
          </div>
        )}
      </Dialog>
      {admin && (
        <Dialog
          title="Přidat účastníky"
          open={adding}
          onClose={() => {
            if (!batchAdd.isPending) setAdding(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                addIds.length &&
                !batchAdd.isPending &&
                (addDefaults.interest !== "maybe" || addDefaults.note?.trim())
              )
                batchAdd.mutate(addIds);
            }}
          >
            <fieldset
              className="attendance-defaults"
              disabled={batchAdd.isPending}
            >
              <legend>Výchozí účast pro vybrané členy</legend>
              <label className="field">
                Nahlášená účast
                <Select
                  aria-label="Výchozí nahlášená účast"
                  value={addDefaults.interest}
                  onChange={(e) =>
                    setAddDefaults({
                      ...addDefaults,
                      interest: e.target.value as InterestStatus,
                    })
                  }
                >
                  <option value="unset">Bez odpovědi</option>
                  {responseChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field">
                Skutečná účast
                <Select
                  aria-label="Výchozí skutečná účast"
                  value={addDefaults.status}
                  onChange={(e) =>
                    setAddDefaults({
                      ...addDefaults,
                      status: e.target.value as AttendanceRecord["status"],
                    })
                  }
                >
                  {Object.entries(attendanceLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              {addDefaults.status === "partial" && (
                <label className="field">
                  Účast %
                  <input
                    aria-label="Výchozí procento účasti"
                    type="number"
                    min="0.001"
                    max="99.999"
                    step="0.001"
                    required
                    value={addDefaults.attendancePercent ?? ""}
                    onChange={(e) =>
                      setAddDefaults({
                        ...addDefaults,
                        attendancePercent:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
              )}
              <label className="field">
                Poznámka{addDefaults.interest === "maybe" ? " (povinná)" : ""}
                <input
                  aria-label="Společná poznámka k odpovědi"
                  maxLength={500}
                  required={addDefaults.interest === "maybe"}
                  value={addDefaults.note ?? ""}
                  onChange={(e) =>
                    setAddDefaults({ ...addDefaults, note: e.target.value })
                  }
                />
              </label>
            </fieldset>
            <div className="feature-toolbar">
              <input
                autoFocus
                aria-label="Hledat člena k přidání"
                placeholder="Hledat jméno…"
                value={addSearch}
                disabled={batchAdd.isPending}
                onChange={(e) => setAddSearch(e.target.value)}
              />
              <Select
                aria-label="Řazení při přidávání"
                value={sort}
                disabled={batchAdd.isPending}
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
              type="submit"
              disabled={
                !addIds.length ||
                (addDefaults.interest === "maybe" && !addDefaults.note?.trim())
              }
              loading={batchAdd.isPending}
            >
              Přidat vybrané ({addIds.length})
            </Button>
          </form>
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

function AttendancePercentEditor({
  memberName,
  percent,
  pending,
  onSave,
}: {
  memberName: string;
  percent: number;
  pending: boolean;
  onSave: (percent: number) => void;
}) {
  const [value, setValue] = useState(String(percent));
  return (
    <form
      className="attendance-percent-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(Number(value));
      }}
    >
      <label className="field">
        Účast %
        <input
          aria-label={`Procento účasti ${memberName}`}
          disabled={pending}
          type="number"
          min="0.001"
          max="99.999"
          step="0.001"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <Button
        type="submit"
        size="small"
        loading={pending}
        disabled={Number(value) === percent}
      >
        Uložit procenta
      </Button>
    </form>
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
