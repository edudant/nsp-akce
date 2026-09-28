import {
  generatePairings,
  DEFAULT_PAIRING_WEIGHTS,
  type PairingWeights,
} from "./pairing";
import type {
  AppDatabase,
  EnsembleEvent,
  Member,
  DancePair,
  AgeGroup,
} from "./domain";
import { compatibleMembers, memberGroups } from "./ensembleRules";
export interface PairingTuning {
  preferences: number;
  points: number;
  rotation: number;
  experience: number;
  chooser: "both" | "leader" | "follower";
  supplementYoung: boolean;
}
export const defaultTuning: PairingTuning = {
  preferences: 1,
  points: 1,
  rotation: 1,
  experience: 1,
  chooser: "both",
  supplementYoung: true,
};
export function validatePairs(
  db: AppDatabase,
  event: EnsembleEvent,
  pairs: DancePair[],
): string | null {
  const seen = new Set<string>();
  for (const pair of pairs) {
    const a = db.members.find((m) => m.id === pair.leaderId),
      b = db.members.find((m) => m.id === pair.followerId);
    if (
      !a ||
      !b ||
      a.role !== "leader" ||
      b.role !== "follower" ||
      !compatibleMembers(a, b) ||
      !pair.ageGroup ||
      !memberGroups(a).includes(pair.ageGroup) ||
      !memberGroups(b).includes(pair.ageGroup)
    )
      return "Pár nemá kompatibilní role nebo zařazení.";
    if (seen.has(a.id) || seen.has(b.id))
      return "Člen může být v sestavě pouze jednou.";
    seen.add(a.id);
    seen.add(b.id);
    if (
      db.preferences.some(
        (p) =>
          (!p.validFrom || p.validFrom <= event.date) &&
          (!p.validTo || p.validTo >= event.date) &&
          p.kind === "forbidden" &&
          [p.memberAId, p.memberBId].includes(a.id) &&
          [p.memberAId, p.memberBId].includes(b.id),
      )
    )
      return "Tato dvojice je zakázaná.";
    if (
      [a.id, b.id].some(
        (id) =>
          !event.attendance.some(
            (r) => r.memberId === id && r.selected && !r.standing,
          ),
      )
    )
      return "Páry tvořte pouze z vybraných přítomných členů.";
  }
  return null;
}
export function generateSeasonPairs(
  db: AppDatabase,
  event: EnsembleEvent,
  tuning: PairingTuning,
  seed: string,
): { pairs: DancePair[]; standingIds: string[]; warnings: string[] } {
  if (event.seasonKind === "carols")
    return {
      pairs: [],
      standingIds: [],
      warnings: ["Koledy nemají párování."],
    };
  const rehearsal = event.type === "rehearsal";
  const available = db.members.filter(
    (m) =>
      m.active &&
      event.attendance.some(
        (r) => r.memberId === m.id && r.selected && !r.standing,
      ),
  );
  const past = db.events.filter(
    (e) =>
      e.id !== event.id &&
      e.seasonId === event.seasonId &&
      e.type === "performance" &&
      e.seasonKind !== "carols" &&
      e.status === "closed" &&
      e.date <= event.date,
  );
  const applicablePreferences = db.preferences.filter(
    (p) =>
      (!p.validFrom || p.validFrom <= event.date) &&
      (!p.validTo || p.validTo >= event.date),
  );
  const pointValues = new Map(
    available.map((m) => [
      m.id,
      db.events
        .filter(
          (e) =>
            e.status === "closed" &&
            e.seasonId === event.seasonId &&
            e.date <= event.date,
        )
        .reduce(
          (sum, e) =>
            sum +
            (e.attendance.find((r) => r.memberId === m.id)?.earnedPoints ?? 0),
          0,
        ),
    ]),
  );
  const maximumPoints = Math.max(1, ...pointValues.values());
  const allZero = Object.fromEntries(
    Object.keys(DEFAULT_PAIRING_WEIGHTS).map((key) => [key, 0]),
  ) as unknown as PairingWeights;
  function match(members: Member[], group?: AgeGroup, variant = 0) {
    const forbidden = applicablePreferences
      .filter((p) => p.kind === "forbidden")
      .map((p) => ({
        memberAId: p.memberAId,
        memberBId: p.memberBId,
        kind: p.kind,
      }));
    for (const a of members)
      for (const b of members)
        if (
          a.role === "leader" &&
          b.role === "follower" &&
          (!compatibleMembers(a, b) ||
            (group &&
              (!memberGroups(a).includes(group) ||
                !memberGroups(b).includes(group))))
        )
          forbidden.push({
            memberAId: a.id,
            memberBId: b.id,
            kind: "forbidden",
          });
    const weights: Partial<PairingWeights> = rehearsal
      ? { ...allZero, tieBreaker: 1 }
      : {
          repeat: 24 * tuning.rotation,
          recency: 30 * tuning.rotation,
          beginnerBeginner: 36 * tuning.experience,
          beginnerExperiencedBonus: 18 * tuning.experience,
          partnerWishBonus: 24 * tuning.preferences * (1 + tuning.points),
          mutualPartnerWishBonus: 48 * tuning.preferences * (1 + tuning.points),
          preferredBonus: 8 * tuning.preferences,
          discouraged: 100 * tuning.preferences,
          historicalByeFairness: 40 * tuning.rotation,
          consecutiveByeAvoidance: 80 * tuning.rotation,
        };
    const result = generatePairings({
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        experienceLevel: m.experience,
        byeCount: past.filter(
          (e) =>
            e.attendance.some(
              (r) =>
                r.memberId === m.id &&
                (r.status === "present" || r.status === "partial"),
            ) &&
            !(e.actualPairs ?? e.pairs).some(
              (p) => p.actual && (p.leaderId === m.id || p.followerId === m.id),
            ),
        ).length,
      })),
      compatibleRolePairs: [["leader", "follower"]],
      preferences: [
        ...forbidden,
        ...(rehearsal
          ? []
          : db.preferences
              .filter((p) => p.kind !== "forbidden")
              .map((p) => ({
                ...p,
                strength: Math.min(1, (p.strength ?? 3) / 5),
              }))),
      ],
      partnerWishes: rehearsal
        ? []
        : (db.partnerWishes ?? [])
            .filter(
              (w) =>
                w.eventId === event.id &&
                (tuning.chooser === "both" ||
                  db.members.find((m) => m.id === w.memberId)?.role ===
                    tuning.chooser),
            )
            .map((w) => ({
              ...w,
              strength:
                (1 +
                  (tuning.points * (pointValues.get(w.memberId) ?? 0)) /
                    maximumPoints) /
                (1 + tuning.points),
            })),
      history: rehearsal
        ? []
        : past.flatMap((e) =>
            (e.actualPairs ?? e.pairs)
              .filter((p) => p.actual)
              .map((p) => ({
                memberAId: p.leaderId,
                memberBId: p.followerId,
                occurredAt: e.date,
                actual: true,
              })),
          ),
      rounds: 1,
      seed,
      variant,
      asOf: event.date,
      weights,
    });
    return result.rounds[0].pairs
      .map((p) => ({
        leaderId: p.memberAId,
        followerId: p.memberBId,
        score: p.score,
      }))
      .sort((a, b) => a.score - b.score);
  }
  const candidates: Array<{ pairs: DancePair[]; cost: number }> = [];
  for (const order of [
    ["young", "old"],
    ["old", "young"],
  ] as AgeGroup[][]) {
    let remaining = [...available];
    const pairs: DancePair[] = [];
    let cost = 0;
    const targets = {
      old: rehearsal ? Number.MAX_SAFE_INTEGER : (event.oldPairs ?? 0),
      young: rehearsal ? Number.MAX_SAFE_INTEGER : (event.youngPairs ?? 0),
    };
    for (const group of order) {
      const members = remaining.filter(
        (m) =>
          memberGroups(m).includes(group) &&
          (!rehearsal || m.ageGroup === group),
      );
      const matched = match(members, group).slice(0, targets[group]);
      for (const p of matched) {
        pairs.push({
          id: `${seed}-${pairs.length}`,
          leaderId: p.leaderId,
          followerId: p.followerId,
          round: 1,
          ageGroup: group,
          belowLine: false,
        });
        cost += p.score;
      }
      const used = new Set(matched.flatMap((p) => [p.leaderId, p.followerId]));
      remaining = remaining.filter((m) => !used.has(m.id));
    }
    if (rehearsal)
      for (const group of order) {
        const members = remaining.filter(
          (m) =>
            memberGroups(m).includes(group) &&
            (group !== "young" ||
              tuning.supplementYoung ||
              m.ageGroup === "young"),
        );
        const matched = match(members, group, 1);
        for (const p of matched) {
          pairs.push({
            id: `${seed}-${pairs.length}`,
            leaderId: p.leaderId,
            followerId: p.followerId,
            round: 1,
            ageGroup: group,
            belowLine: false,
          });
          cost += p.score;
        }
        const used = new Set(
          matched.flatMap((p) => [p.leaderId, p.followerId]),
        );
        remaining = remaining.filter((m) => !used.has(m.id));
      }
    if (!rehearsal)
      for (const p of match(remaining)) {
        const a = available.find((m) => m.id === p.leaderId)!,
          b = available.find((m) => m.id === p.followerId)!;
        const common = memberGroups(a).filter((g) =>
          memberGroups(b).includes(g),
        );
        const group = common.includes(a.ageGroup!) ? a.ageGroup! : common[0];
        pairs.push({
          id: `${seed}-${pairs.length}`,
          leaderId: p.leaderId,
          followerId: p.followerId,
          round: 1,
          ageGroup: group,
          belowLine: true,
        });
        cost += p.score;
      }
    const deficit = rehearsal
      ? 0
      : Math.max(
          0,
          targets.old -
            pairs.filter((p) => p.ageGroup === "old" && !p.belowLine).length,
        ) +
        Math.max(
          0,
          targets.young -
            pairs.filter((p) => p.ageGroup === "young" && !p.belowLine).length,
        );
    const primaryPenalty = pairs.reduce(
      (sum, p) =>
        sum +
        [p.leaderId, p.followerId].filter(
          (id) => available.find((m) => m.id === id)?.ageGroup !== p.ageGroup,
        ).length,
      0,
    );
    candidates.push({
      pairs,
      cost:
        deficit * 1e8 -
        pairs.length * 1e6 +
        primaryPenalty * (rehearsal ? 0.01 : 2) +
        cost,
    });
  }
  const pairs = candidates.sort((a, b) => a.cost - b.cost)[0].pairs;
  const used = new Set(pairs.flatMap((p) => [p.leaderId, p.followerId]));
  const standingIds = event.attendance
    .filter((r) => r.selected && (r.standing || !used.has(r.memberId)))
    .map((r) => r.memberId);
  const warnings: string[] = [];
  if (available.some((m) => memberGroups(m).length === 0))
    warnings.push(
      "Někteří přítomní nemají zařazení; doplňte je v evidenci členů.",
    );
  if (!rehearsal)
    for (const group of ["old", "young"] as AgeGroup[])
      if (
        pairs.filter((p) => p.ageGroup === group && !p.belowLine).length <
        (group === "old" ? (event.oldPairs ?? 0) : (event.youngPairs ?? 0))
      )
        warnings.push(
          `Pro skupinu ${group === "old" ? "Starý" : "Mladý"} není dost kompatibilních párů pro zadaný odhad.`,
        );
  return { pairs, standingIds, warnings };
}
