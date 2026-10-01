import { historyPairs, historyStandingIds } from "./pairSets";
import { solve, type Constraint } from "yalps";
import {
  scorePairingCandidates,
  DEFAULT_PAIRING_WEIGHTS,
  type PairingWeights,
} from "./pairing";
import type { AppDatabase, EnsembleEvent, Member, DancePair } from "./domain";
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
/** Closed actions use recorded reality, including former members. */
export function pairingParticipants(
  db: AppDatabase,
  event: EnsembleEvent,
): Member[] {
  return db.members.filter(
    (m) =>
      m.role !== "musician" &&
      event.attendance.some(
        (r) =>
          r.memberId === m.id &&
          (event.status === "closed"
            ? r.status === "present" || r.status === "partial"
            : m.active &&
              r.selected &&
              r.status !== "absent" &&
              r.status !== "excused"),
      ),
  );
}

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
          !pairingParticipants(db, event).some((m) => m.id === id) ||
          event.attendance.find((r) => r.memberId === id)?.standing,
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
  const roster = pairingParticipants(db, event);
  const available = roster.filter(
    (m) => !event.attendance.find((r) => r.memberId === m.id)?.standing,
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
            e.id !== event.id &&
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
  const candidates = scorePairingCandidates({
    members: available.map((m) => {
      const byes = past.filter((e) => historyStandingIds(e).includes(m.id));
      return {
        id: m.id,
        role: m.role,
        experienceLevel: m.experience,
        byeCount: byes.length,
        lastByeAt: byes
          .map((e) => e.date)
          .sort()
          .at(-1),
      };
    }),
    compatibleRolePairs: [["leader", "follower"]],
    preferences: [
      ...applicablePreferences.filter((p) => p.kind === "forbidden"),
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
          historyPairs(e).map((p) => ({
            memberAId: p.leaderId,
            memberBId: p.followerId,
            occurredAt: e.date,
            actual: true,
          })),
        ),
    rounds: 1,
    seed,
    asOf: event.date,
    weights,
  });
  const membersById = new Map(available.map((m) => [m.id, m]));
  const constraints: Record<string, Constraint> = Object.fromEntries(
    available.map((m) => [`member:${m.id}`, { max: 1 }]),
  );
  const variables: Record<string, Record<string, number>> = {};
  const choices = new Map<string, DancePair>();
  const targets = {
    old: Math.max(0, event.oldPairs ?? event.capacityPairs ?? 0),
    young: Math.max(0, event.youngPairs ?? 0),
  };
  if (!rehearsal)
    for (const group of ["old", "young"] as const)
      constraints[`main:${group}`] = { max: targets[group] };
  for (const candidate of candidates) {
    const a = membersById.get(candidate.memberAId)!,
      b = membersById.get(candidate.memberBId)!;
    for (const group of memberGroups(a).filter((g) =>
      memberGroups(b).includes(g),
    )) {
      if (
        rehearsal &&
        !tuning.supplementYoung &&
        group === "young" &&
        (a.ageGroup !== "young" || b.ageGroup !== "young")
      )
        continue;
      // Secondary groups are allowed when needed, with priority as a soft rule.
      const primaryPenalty =
        Number(a.ageGroup !== group) + Number(b.ageGroup !== group);
      for (const belowLine of rehearsal ? [false] : [false, true]) {
        if (!rehearsal && !belowLine && targets[group] === 0) continue;
        const key = `pair:${choices.size}`;
        choices.set(key, {
          id: `${seed}-${choices.size}`,
          leaderId: a.id,
          followerId: b.id,
          round: 1,
          ageGroup: group,
          belowLine,
          reason: rehearsal
            ? "Náhodný pár; zařazení a zákazy jsou respektované."
            : candidate.explanation,
        });
        variables[key] = {
          [`member:${a.id}`]: 1,
          [`member:${b.id}`]: 1,
          total: 1,
          main: belowLine ? 0 : 1,
          cost: candidate.score + primaryPenalty * (rehearsal ? 0.01 : 2),
          ...(!rehearsal && !belowLine ? { [`main:${group}`]: 1 } : {}),
        };
      }
    }
  }
  const warnings: string[] = [];
  let pairs: DancePair[] = [];
  if (choices.size) {
    // Lexicographic objectives: targets, maximum pairing, then tuning. All groups
    // and below-line assignments share the same member-capacity constraints.
    for (const objective of rehearsal
      ? ["total", "cost"]
      : ["main", "total", "cost"]) {
      const result = solve(
        {
          direction: objective === "cost" ? "minimize" : "maximize",
          objective,
          constraints,
          variables,
          binaries: true,
        },
        { timeout: 4000, maxIterations: 100000 },
      );
      if (
        !Number.isFinite(result.result) ||
        !["optimal", "timedout"].includes(result.status)
      )
        throw new Error(
          "Sestavu se nepodařilo vypočítat. Zkontrolujte účast a zkuste generování znovu.",
        );
      pairs = result.variables
        .filter(([, value]) => value > 0.5)
        .map(([key]) => choices.get(key)!);
      if (result.status === "timedout") {
        warnings.push(
          "Výpočet dosáhl časového limitu. Návrh respektuje omezení, ale nemusí být nejlepší; zkuste další variantu.",
        );
        break;
      }
      if (objective !== "cost")
        constraints[objective] = { equal: Math.round(result.result) };
    }
  }
  pairs.sort(
    (a, b) =>
      Number(a.belowLine) - Number(b.belowLine) ||
      (a.ageGroup ?? "").localeCompare(b.ageGroup ?? "") ||
      a.leaderId.localeCompare(b.leaderId),
  );
  const invalid = validatePairs(db, event, pairs);
  if (invalid) throw new Error(invalid);
  const used = new Set(pairs.flatMap((p) => [p.leaderId, p.followerId]));
  const standingIds = roster.filter((m) => !used.has(m.id)).map((m) => m.id);
  if (available.length === 0)
    warnings.push(
      event.status === "closed"
        ? "Není zapsaná skutečná přítomnost. V Účastnících nastavte přítomen nebo částečnou účast."
        : "Nejsou vybraní přítomní účastníci. Přidejte je v seznamu Účastníci.",
    );
  else if (!pairs.length)
    warnings.push(
      "Z přítomných nelze vytvořit pár. Zkontrolujte muže/ženy, zařazení Starý/Mladý, zákazy a explicitní stání.",
    );
  if (available.some((m) => memberGroups(m).length === 0))
    warnings.push(
      "Někteří přítomní nemají zařazení; doplňte je v evidenci členů.",
    );
  if (!rehearsal)
    for (const group of ["old", "young"] as const)
      if (
        pairs.filter((p) => p.ageGroup === group && !p.belowLine).length <
        targets[group]
      )
        warnings.push(
          `Pro skupinu ${group === "old" ? "Starý" : "Mladý"} nelze naplnit zadaný odhad při zachování kompatibility a zákazů.`,
        );
  if (
    pairs.length &&
    standingIds.some(
      (id) => !event.attendance.find((r) => r.memberId === id)?.standing,
    )
  )
    warnings.push(
      "Někteří přítomní zůstali bez páru kvůli počtu kompatibilních partnerů nebo zákazům. Jsou uvedeni v seznamu Bez páru.",
    );
  return { pairs, standingIds, warnings };
}
