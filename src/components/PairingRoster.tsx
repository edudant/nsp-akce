import { isDancer } from "../lib/domain";
import { useState } from "react";
import type {
  AppDatabase,
  DancePair,
  EnsembleEvent,
  Member,
  PairingRosterEntry,
} from "../lib/domain";
import { memberGroups } from "../lib/ensembleRules";
import { pairingParticipants, validatePairs } from "../lib/seasonPairing";
import { Button, Dialog, Select } from "./Ui";

export function PairingRoster({
  db,
  event,
  pairs,
  admin,
  disabled,
  onChange,
  roster,
}: {
  db: AppDatabase;
  event: EnsembleEvent;
  pairs: DancePair[];
  admin: boolean;
  disabled: boolean;
  onChange: (pairs: DancePair[]) => void;
  roster?: PairingRosterEntry[];
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newMemberId, setNewMemberId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState("");
  const selected: Member[] = roster
    ? roster
        .filter((entry) => isDancer(entry.role ?? db.members.find(m=>m.id===entry.memberId)?.role ?? "leader"))
        .map((entry) => {
          const member = db.members.find((m) => m.id === entry.memberId);
          return {
            shortName: "",
            active: false,
            experience: "beginner",
            joinedAt: "",
            ...member,
            id: entry.memberId,
            fullName: entry.fullName ?? member?.fullName ?? "Neznámý člen",
            role: entry.role ?? member?.role ?? "leader",
            ageGroups: entry.ageGroups ?? member?.ageGroups,
            ageGroup: entry.ageGroups?.[0] ?? member?.ageGroup ?? null,
          };
        })
    : pairingParticipants(db, event);
  const used = new Set(
    pairs.flatMap((pair) => [pair.leaderId, pair.followerId]),
  );
  const unpaired = selected
    .filter((member) => !used.has(member.id))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "cs"));
  const detail = pairs.find((pair) => pair.id === detailId);
  const newMember = selected.find((member) => member.id === newMemberId);
  const name = (id: string) =>
    (
      selected.find((member) => member.id === id) ??
      db.members.find((member) => member.id === id)
    )?.fullName ?? "Neznámý člen";
  const groups = (id: string) => {
    const member =
      selected.find((candidate) => candidate.id === id) ??
      db.members.find((candidate) => candidate.id === id);
    return member ? memberGroups(member) : [];
  };
  const standing = (id: string) =>
    roster
      ? !!roster.find((entry) => entry.memberId === id)?.standing
      : !!event.attendance.find((record) => record.memberId === id)?.standing;
  const currentPair = (id: string) =>
    pairs.find((pair) => pair.leaderId === id || pair.followerId === id);
  const partnerName = (member: Member) => {
    const pair = currentPair(member.id);
    return pair
      ? name(pair.leaderId === member.id ? pair.followerId : pair.leaderId)
      : null;
  };
  const makePair = (a: Member, b: Member, original?: DancePair): DancePair => ({
    id: original?.id ?? crypto.randomUUID(),
    round: original?.round ?? 1,
    ...original,
    leaderId: a.role === "leader" ? a.id : b.id,
    followerId: a.role === "follower" ? a.id : b.id,
    ageGroup:
      original?.ageGroup &&
      memberGroups(a).includes(original.ageGroup) &&
      memberGroups(b).includes(original.ageGroup)
        ? original.ageGroup
        : memberGroups(a).find((group) => memberGroups(b).includes(group)),
    belowLine: original?.belowLine ?? event.type === "performance",
    reason: "Ručně upravený pár.",
  });
  const candidates = (member: Member) =>
    selected
      .filter(
        (other) =>
          other.role !== member.role &&
          !standing(other.id) &&
          !validatePairs(db, event, [makePair(member, other)]),
      )
      .sort(
        (a, b) =>
          Number(used.has(a.id)) - Number(used.has(b.id)) ||
          a.fullName.localeCompare(b.fullName, "cs"),
      );
  const commitPair = (pair: DancePair) => {
    // Reassigning an occupied member releases their previous partner.
    const remaining = pairs.filter(
      (other) =>
        other.id !== pair.id &&
        ![other.leaderId, other.followerId].some(
          (id) => id === pair.leaderId || id === pair.followerId,
        ),
    );
    const index = pairs.findIndex((other) => other.id === pair.id);
    if (index < 0) remaining.push(pair);
    else remaining.splice(Math.min(index, remaining.length), 0, pair);
    onChange(remaining);
  };
  const replaceMember = (role: Member["role"], id: string) => {
    if (!detail) return;
    const replacement = selected.find((member) => member.id === id);
    const retained = selected.find(
      (member) =>
        member.id === (role === "leader" ? detail.followerId : detail.leaderId),
    );
    if (replacement && retained)
      commitPair(makePair(replacement, retained, detail));
  };
  const candidateOptions = (list: Member[], currentId?: string) => (
    <>
      {list
        .filter((member) => !used.has(member.id) || member.id === currentId)
        .map((member) => (
          <option key={member.id} value={member.id}>
            {member.fullName}
            {member.id === currentId ? " · současný pár" : " · bez páru"}
          </option>
        ))}
      {list
        .filter((member) => used.has(member.id) && member.id !== currentId)
        .map((member) => (
          <option key={member.id} value={member.id}>
            {member.fullName} · v páru s {partnerName(member)}
          </option>
        ))}
    </>
  );
  const renderPair = (pair: DancePair, index: number) => (
    <tr
      key={pair.id}
      className={admin ? "is-clickable" : ""}
      onClick={admin && !disabled ? () => setDetailId(pair.id) : undefined}
    >
      <td className="pairing-number">{index + 1}</td>
      <td>
        {admin ? (
          <button
            type="button"
            className="pair-name-button"
            disabled={disabled}
            aria-label={`Detail páru: ${name(pair.leaderId)} + ${name(pair.followerId)}`}
          >
            {name(pair.leaderId)}
          </button>
        ) : (
          name(pair.leaderId)
        )}
      </td>
      <td>{name(pair.followerId)}</td>
      <td>{pair.ageGroup === "young" ? "Mladý" : "Starý"}</td>
    </tr>
  );
  const partner = selected.find((member) => member.id === partnerId);
  const newPair = newMember && partner ? makePair(newMember, partner) : null;
  return (
    <>
      <div className="responsive-table">
        <table className="pairing-table" aria-label="Sestava párů">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Muž</th>
              <th scope="col">Žena</th>
              <th scope="col">Skupina</th>
            </tr>
          </thead>
          <tbody>
            <tr className="pairing-section">
              <th colSpan={4} scope="colgroup">
                Hlavní sestava ({pairs.filter((pair) => !pair.belowLine).length}
                )
              </th>
            </tr>
            {pairs.map((pair, index) =>
              !pair.belowLine ? renderPair(pair, index) : null,
            )}
            {!pairs.some((pair) => !pair.belowLine) && (
              <tr>
                <td colSpan={4}>Zatím žádné páry.</td>
              </tr>
            )}
            <tr className="pairing-section pairing-section--below">
              <th colSpan={4} scope="colgroup">
                Pod čarou
              </th>
            </tr>
            {pairs.map((pair, index) =>
              pair.belowLine ? renderPair(pair, index) : null,
            )}
            <tr className="pairing-section">
              <th colSpan={4} scope="colgroup">
                Bez páru ({unpaired.length})
              </th>
            </tr>
            {unpaired.map((member) => (
              <tr
                key={member.id}
                className={admin && !standing(member.id) ? "is-clickable" : ""}
                onClick={
                  admin && !disabled && !standing(member.id)
                    ? () => {
                        setNewMemberId(member.id);
                        setPartnerId("");
                      }
                    : undefined
                }
              >
                <td></td>
                <td colSpan={2}>
                  {admin ? (
                    <button
                      type="button"
                      className="pair-name-button"
                      disabled={disabled || standing(member.id)}
                      aria-label={`Vytvořit pár pro ${member.fullName}`}
                    >
                      {member.fullName}
                    </button>
                  ) : (
                    member.fullName
                  )}
                  <small className="pair-member-role">
                    {member.role === "leader" ? "Muž" : "Žena"}
                    {standing(member.id) ? " · má stát" : ""}
                  </small>
                </td>
                <td>
                  {memberGroups(member)
                    .map((group) => (group === "young" ? "Mladý" : "Starý"))
                    .join(", ")}
                </td>
              </tr>
            ))}
            {!unpaired.length && (
              <tr>
                <td colSpan={4}>Všichni mají pár.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {admin && (
        <p className="pairing-hint">
          Kliknutím na pár otevřete detail. Členovi bez páru vyberete partnera
          kliknutím na jeho jméno. Úpravy uložte pod tabulkou.
        </p>
      )}
      <Dialog
        open={!!detail && admin}
        title="Detail páru"
        onClose={() => setDetailId(null)}
      >
        {detail && (
          <div className="pair-detail">
            {(["leader", "follower"] as const).map((role) => {
              const retained = selected.find(
                (member) =>
                  member.id ===
                  (role === "leader" ? detail.followerId : detail.leaderId),
              );
              const currentId =
                role === "leader" ? detail.leaderId : detail.followerId;
              const choices = retained ? candidates(retained) : [];
              // Keep the current selection visible even if attendance changed since generation.
              const current = db.members.find(
                (member) => member.id === currentId,
              );
              return (
                <label className="field" key={role}>
                  {role === "leader" ? "Muž" : "Žena"}
                  <Select
                    aria-label={`${role === "leader" ? "Muž" : "Žena"} v páru ${pairs.indexOf(detail) + 1}`}
                    value={currentId}
                    disabled={disabled}
                    onChange={(e) => replaceMember(role, e.target.value)}
                  >
                    {current &&
                      !choices.some((member) => member.id === currentId) && (
                        <option value={currentId}>
                          {current.fullName} · současný pár
                        </option>
                      )}
                    {candidateOptions(choices, currentId)}
                  </Select>
                </label>
              );
            })}
            <p className="pairing-hint">
              Nejprve jsou členové bez páru. Výběrem člena z jiného páru se jeho
              původní pár zruší a partner se přesune mezi členy bez páru.
            </p>
            <label className="field">
              Skupina
              <Select
                aria-label="Skupina páru"
                value={detail.ageGroup ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    pairs.map((pair) =>
                      pair.id === detail.id
                        ? {
                            ...pair,
                            ageGroup: e.target.value as DancePair["ageGroup"],
                            reason: "Ručně upravený pár.",
                          }
                        : pair,
                    ),
                  )
                }
              >
                {!detail.ageGroup && <option value="">Vyberte skupinu</option>}
                {groups(detail.leaderId)
                  .filter((group) => groups(detail.followerId).includes(group))
                  .map((group) => (
                    <option key={group} value={group}>
                      {group === "young" ? "Mladý" : "Starý"}
                    </option>
                  ))}
              </Select>
            </label>
            {event.type === "performance" && (
              <label>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={!!detail.belowLine}
                  onChange={(e) =>
                    onChange(
                      pairs.map((pair) =>
                        pair.id === detail.id
                          ? { ...pair, belowLine: e.target.checked }
                          : pair,
                      ),
                    )
                  }
                />{" "}
                Pod čarou
              </label>
            )}
            {detail.reason && <p className="pair-reason">{detail.reason}</p>}
            <div className="feature-toolbar">
              <Button
                variant="danger"
                disabled={disabled}
                onClick={() => {
                  onChange(pairs.filter((pair) => pair.id !== detail.id));
                  setDetailId(null);
                }}
              >
                Zrušit pár
              </Button>
              <Button variant="secondary" onClick={() => setDetailId(null)}>
                Hotovo
              </Button>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!newMember && admin}
        title={`Vytvořit pár pro ${newMember?.fullName ?? "člena"}`}
        onClose={() => setNewMemberId(null)}
      >
        {newMember && (
          <div className="pair-detail">
            <label className="field">
              Partner
              <Select
                aria-label={`Partner pro ${newMember.fullName}`}
                value={partnerId}
                disabled={disabled}
                onChange={(e) => setPartnerId(e.target.value)}
              >
                <option value="">Vyberte partnera</option>
                {candidateOptions(candidates(newMember))}
              </Select>
            </label>
            {!candidates(newMember).length && (
              <p>Není dostupný kompatibilní partner.</p>
            )}
            {partner && used.has(partner.id) && (
              <p>Výběrem se zruší pár s {partnerName(partner)}.</p>
            )}
            <Button
              disabled={
                disabled || !newPair || !!validatePairs(db, event, [newPair])
              }
              onClick={() => {
                if (newPair) {
                  commitPair(newPair);
                  setDetailId(newPair.id);
                  setNewMemberId(null);
                }
              }}
            >
              Vytvořit pár
            </Button>
          </div>
        )}
      </Dialog>
    </>
  );
}
