import { describe, it, expect } from "vitest";
import {
  generateSeasonPairs,
  defaultTuning,
  validatePairs,
} from "./seasonPairing";
import { sortedRoster, memberGroups, compatibleMembers } from "./ensembleRules";
import { getAttendancePoints } from "./domain";
import type { Member, EnsembleEvent, AppDatabase, AgeGroup } from "./domain";
const member = (
  id: string,
  role: Member["role"],
  groups: AgeGroup[] = ["old"],
  primary = groups[0],
): Member => ({
  id,
  fullName: id,
  shortName: id,
  role,
  ageGroup: primary,
  ageGroups: groups,
  experience: "experienced",
  active: true,
  joinedAt: "",
});
const event = (
  members: Member[],
  patch: Partial<EnsembleEvent> = {},
): EnsembleEvent => ({
  id: "e",
  type: "performance",
  title: "Test",
  date: "2026-09-28",
  startTime: "19:00",
  endTime: "21:00",
  location: "",
  status: "confirmed",
  weight: 2,
  capacityPairs: 1,
  oldPairs: 1,
  youngPairs: 0,
  seasonId: "s",
  seasonKind: "dance",
  pairs: [],
  pairsPublished: false,
  attendance: members.map((m) => ({
    memberId: m.id,
    status: "present",
    interest: "yes",
    selected: true,
    earnedPoints: 2,
  })),
  ...patch,
});
const database = (members: Member[], e: EnsembleEvent): AppDatabase => ({
  members,
  events: [e],
  preferences: [],
  accessMode: "admin",
  updatedAt: "",
  seasons: [
    {
      id: "s",
      name: "Active",
      kind: "dance",
      dateFrom: "2026-08-01",
      dateTo: "2027-08-10",
      active: true,
    },
  ],
});
describe("season pairing", () => {
  it("creates the requested main count plus all possible pairs below line without duplicates", () => {
    const ms = [
      member("a", "leader"),
      member("b", "leader"),
      member("c", "follower"),
      member("d", "follower"),
    ];
    const e = event(ms);
    const db = database(ms, e);
    const result = generateSeasonPairs(db, e, defaultTuning, "seed");
    expect(result.pairs).toHaveLength(2);
    expect(result.pairs.filter((p) => !p.belowLine)).toHaveLength(1);
    expect(
      new Set(result.pairs.flatMap((p) => [p.leaderId, p.followerId])).size,
    ).toBe(4);
    expect(validatePairs(db, e, result.pairs)).toBeNull();
  });
  it("uses points as a reward for directional wishes, never from a different season", () => {
    const ms = [
      member("a", "leader"),
      member("b", "follower"),
      member("c", "follower"),
    ];
    const e = event(ms);
    const db = database(ms, e);
    db.partnerWishes = [
      { eventId: e.id, memberId: "b", partnerId: "a" },
      { eventId: e.id, memberId: "c", partnerId: "a" },
    ];
    db.events.push(
      event(ms, {
        id: "past",
        type: "rehearsal",
        status: "closed",
        date: "2026-09-01",
        attendance: [
          {
            memberId: "c",
            status: "present",
            interest: "yes",
            selected: true,
            earnedPoints: 20,
          },
        ],
      }),
    );
    db.events.push(
      event(ms, {
        id: "other",
        seasonId: "other",
        status: "closed",
        date: "2026-09-01",
        attendance: [
          {
            memberId: "b",
            status: "present",
            interest: "yes",
            selected: true,
            earnedPoints: 2000,
          },
        ],
      }),
    );
    const result = generateSeasonPairs(
      db,
      e,
      {
        ...defaultTuning,
        points: 3,
        rotation: 0,
        experience: 0,
        chooser: "follower",
      },
      "seed",
    );
    expect(result.pairs[0].followerId).toBe("c");
  });
  it("never fills young pairs with an old-only member and excludes explicit standing", () => {
    const ms = [
      member("a", "leader", ["old"]),
      member("b", "follower", ["young"]),
      member("c", "leader", ["young"]),
    ];
    const e = event(ms, { oldPairs: 0, youngPairs: 1 });
    e.attendance.find((r) => r.memberId === "c")!.standing = true;
    const result = generateSeasonPairs(
      database(ms, e),
      e,
      defaultTuning,
      "seed",
    );
    expect(result.pairs).toEqual([]);
    expect(result.standingIds).toContain("c");
    expect(result.warnings).not.toEqual([]);
  });
  it("rehearsals respect primary groups; supplement is optional and only for dual membership", () => {
    const ms = [
      member("a", "leader", ["old", "young"], "old"),
      member("b", "follower", ["young"]),
    ];
    const e = event(ms, { type: "rehearsal" });
    const db = database(ms, e);
    expect(
      generateSeasonPairs(
        db,
        e,
        { ...defaultTuning, supplementYoung: false },
        "s",
      ).pairs,
    ).toHaveLength(0);
    const result = generateSeasonPairs(db, e, defaultTuning, "s");
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].ageGroup).toBe("young");
    ms[0].ageGroups = ["old"];
    expect(generateSeasonPairs(db, e, defaultTuning, "s").pairs).toHaveLength(
      0,
    );
  });
  it("rehearsals ignore points, experience, wishes and history but always respect prohibitions", () => {
    const ms = [
      member("a", "leader"),
      member("b", "leader"),
      member("c", "follower"),
      member("d", "follower"),
    ];
    const e = event(ms, { type: "rehearsal" });
    const db = database(ms, e);
    db.preferences = [
      { id: "f", memberAId: "a", memberBId: "c", kind: "forbidden" },
    ];
    const first = generateSeasonPairs(db, e, defaultTuning, "s");
    db.partnerWishes = [{ eventId: e.id, memberId: "a", partnerId: "c" }];
    db.events.push(
      event(ms, {
        id: "history",
        status: "closed",
        pairs: first.pairs.map((p) => ({ ...p, actual: true })),
      }),
    );
    ms[0].experience = "beginner";
    expect(
      generateSeasonPairs(
        db,
        e,
        { ...defaultTuning, points: 3, experience: 3, preferences: 3 },
        "s",
      ).pairs,
    ).toEqual(first.pairs);
    expect(
      first.pairs.some((p) => p.leaderId === "a" && p.followerId === "c"),
    ).toBe(false);
  });
  it("random variants vary and never use rehearsal sets as performance history", () => {
    const ms = [
      member("a", "leader"),
      member("b", "leader"),
      member("c", "follower"),
      member("d", "follower"),
    ];
    const e = event(ms, { type: "rehearsal" });
    const db = database(ms, e);
    const variants = new Set(
      Array.from({ length: 12 }, (_, i) =>
        generateSeasonPairs(db, e, defaultTuning, String(i))
          .pairs.map((p) => p.leaderId + p.followerId)
          .sort()
          .join(),
      ),
    );
    expect(variants.size).toBeGreaterThan(1);
    const performance = event(ms);
    db.events = [performance];
    const baseline = generateSeasonPairs(
      db,
      performance,
      defaultTuning,
      "same",
    );
    db.events.push({
      ...e,
      id: "r",
      status: "closed",
      pairs: baseline.pairs.map((p) => ({ ...p, actual: true })),
    });
    expect(
      generateSeasonPairs(db, performance, defaultTuning, "same").pairs,
    ).toEqual(baseline.pairs);
  });
  it("rejects duplicate members, forbidden manual pairs and incompatible groups", () => {
    const ms = [member("a", "leader"), member("b", "follower")];
    const e = event(ms);
    const db = database(ms, e);
    const pairs = generateSeasonPairs(db, e, defaultTuning, "s").pairs;
    expect(validatePairs(db, e, [...pairs, ...pairs])).toContain("jednou");
    expect(
      validatePairs(db, e, [{ ...pairs[0], ageGroup: "young" }]),
    ).toContain("kompatibilní");
    db.preferences = [
      { id: "f", memberAId: "a", memberBId: "b", kind: "forbidden" },
    ];
    expect(validatePairs(db, e, pairs)).toContain("zakázaná");
  });
});
describe("roster and points", () => {
  it("sorts real seasonal activity before name and finds names without diacritics", () => {
    const ms = [member("Adam", "leader"), member("Žofie", "follower")];
    const e = event(ms, {
      type: "rehearsal",
      status: "closed",
      attendance: [
        {
          memberId: "Žofie",
          status: "partial",
          attendancePercent: 25,
          interest: "no",
          selected: false,
        },
      ],
    });
    const db = database(ms, e);
    expect(sortedRoster(db, ms, "", "activity").map((m) => m.id)).toEqual([
      "Žofie",
      "Adam",
    ]);
    expect(sortedRoster(db, ms, "", "name").map((m) => m.id)).toEqual([
      "Adam",
      "Žofie",
    ]);
    expect(sortedRoster(db, ms, "zofie", "activity")).toHaveLength(1);
    expect(memberGroups(ms[0])).toEqual(["old"]);
    expect(compatibleMembers(ms[0], ms[1])).toBe(true);
  });
  it("calculates percentages exactly without minute rounding", () => {
    const e = event([], { endTime: "19:01", weight: 3 });
    expect(
      getAttendancePoints(e, {
        memberId: "a",
        status: "partial",
        attendancePercent: 25,
        interest: "yes",
        selected: true,
      }),
    ).toBe(0.75);
  });
});
