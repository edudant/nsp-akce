import type { AppDatabase, EnsembleEvent, Member, AgeGroup } from "./domain";
import { normalizeMemberSearch } from "./memberFilters";
export function memberGroups(member: Member): AgeGroup[] {
  return member.ageGroups ?? (member.ageGroup ? [member.ageGroup] : []);
}
export function compatibleMembers(a: Member, b: Member): boolean {
  return (
    a.id !== b.id &&
    a.role !== b.role &&
    memberGroups(a).some((group) => memberGroups(b).includes(group))
  );
}
export function memberActivity(
  db: AppDatabase,
  memberId: string,
  seasonId?: string,
) {
  const id =
    seasonId ?? db.seasons?.find((s) => s.active && s.kind === "dance")?.id;
  const events = db.events.filter(
    (e) =>
      e.type === "rehearsal" &&
      e.status === "closed" &&
      e.seasonId === id &&
      e.attendance.some(
        (a) =>
          a.memberId === memberId &&
          (a.status === "present" || a.status === "partial"),
      ),
  );
  return {
    count: events.length,
    last:
      events
        .map((e) => e.date)
        .sort()
        .at(-1) ?? "",
  };
}
export function sortedRoster(
  db: AppDatabase,
  members: Member[],
  search: string,
  sort: "activity" | "name",
  seasonId?: string,
) {
  const term = normalizeMemberSearch(search);
  return members
    .filter((m) => normalizeMemberSearch(m.fullName).includes(term))
    .sort((a, b) => {
      if (sort === "activity") {
        const aa = memberActivity(db, a.id, seasonId);
        const bb = memberActivity(db, b.id, seasonId);
        if (aa.count !== bb.count) return bb.count - aa.count;
        if (aa.last !== bb.last) return bb.last.localeCompare(aa.last);
      }
      return a.fullName.localeCompare(b.fullName, "cs");
    });
}
export function supportsPairing(event: EnsembleEvent) {
  return event.seasonKind !== "carols";
}
