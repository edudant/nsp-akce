import {
  getAttendancePoints,
  type AttendanceRecord,
  type DancePair,
  type EnsembleEvent,
  type MemberHistoryEntry,
} from "./domain";

export function canRespondToEvent(
  event: EnsembleEvent,
  today: string,
): boolean {
  if (typeof event.canRespond === "boolean") return event.canRespond;
  return (
    event.status === "open" &&
    (!event.responseDeadline || event.responseDeadline >= today)
  );
}

export function displayedAttendancePoints(
  event: EnsembleEvent,
  record: AttendanceRecord,
): number {
  return record.earnedPoints ?? getAttendancePoints(event, record);
}

export function recentAttendanceEntries(
  history: readonly MemberHistoryEntry[],
  today: string,
  limit = 5,
): MemberHistoryEntry[] {
  return history
    .filter(
      (entry) => entry.date <= today && entry.attendance !== "unknown",
    )
    .sort((first, second) => second.date.localeCompare(first.date))
    .slice(0, limit);
}

export interface EventPairGroup {
  key: string;
  name: string;
  sortOrder: number;
  programNames: string[];
  pairs: DancePair[];
}

export function groupEventPairs(event: EnsembleEvent): EventPairGroup[] {
  const blocksById = new Map(
    (event.pairingBlocks ?? []).map((block) => [block.id, block]),
  );
  const programsById = new Map(
    (event.programItems ?? []).map((program) => [program.id, program]),
  );
  const groups = new Map<string, EventPairGroup>();

  for (const pair of event.pairs) {
    const block = pair.blockId ? blocksById.get(pair.blockId) : undefined;
    const key = pair.blockId
      ? `block:${pair.blockId}`
      : pair.blockName
        ? `name:${pair.blockName}:round:${pair.round}`
        : `round:${pair.round}`;
    const programIds = pair.programItemIds?.length
      ? pair.programItemIds
      : block?.appliesToAll
        ? (event.programItems ?? []).map((program) => program.id)
        : (block?.programItemIds ?? []);
    const programNames = programIds
      .map((id) => programsById.get(id)?.name)
      .filter((name): name is string => Boolean(name));
    const current = groups.get(key);

    if (current) {
      current.pairs.push(pair);
      current.programNames = [...new Set([...current.programNames, ...programNames])];
      continue;
    }

    groups.set(key, {
      key,
      name: block?.name ?? pair.blockName ?? `Kolo ${pair.round}`,
      sortOrder: block?.sortOrder ?? pair.round,
      programNames: [...new Set(programNames)],
      pairs: [pair],
    });
  }

  return [...groups.values()].sort(
    (first, second) =>
      first.sortOrder - second.sortOrder ||
      first.name.localeCompare(second.name, "cs"),
  );
}
