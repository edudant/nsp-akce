import type { EnsembleEvent, PairSet } from "./domain";

export function visiblePairSets(
  event: EnsembleEvent,
  admin = false,
): PairSet[] {
  const sets = (event.pairSets ?? []).filter((set) => admin || set.published);
  if (sets.length)
    return [...sets].sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
  // Compatibility with an older API payload while the frontend reloads.
  return event.pairs.length || event.pairsPublished
    ? [
        {
          id: "legacy",
          name: event.pairingName ?? "Sada",
          createdAt: event.pairingCreatedAt ?? event.date,
          published: event.pairsPublished,
          pairs: event.pairs,
          roster: event.pairingRoster,
        },
      ].filter((set) => admin || set.published)
    : [];
}

export function historyPairs(event: EnsembleEvent) {
  if (
    event.type !== "performance" ||
    event.seasonKind === "carols" ||
    event.status !== "closed"
  )
    return [];
  return (visiblePairSets(event)[0]?.pairs ?? []).filter(
    (pair) => !pair.belowLine,
  );
}

export function historyStandingIds(event: EnsembleEvent): string[] {
  const set = visiblePairSets(event)[0];
  if (
    !set ||
    event.status !== "closed" ||
    event.type !== "performance" ||
    event.seasonKind === "carols"
  )
    return [];
  const paired = new Set(
    historyPairs(event).flatMap((pair) => [pair.leaderId, pair.followerId]),
  );
  return (
    set.roster ??
    event.attendance.filter(
      (r) => r.status === "present" || r.status === "partial",
    )
  )
    .map((r) => r.memberId)
    .filter((id) => !paired.has(id));
}
