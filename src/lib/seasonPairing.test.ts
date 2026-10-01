import { describe, it, expect } from "vitest";
import {
  generateSeasonPairs,
  defaultTuning,
  validatePairs,
  pairingParticipants,
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
  it("solves groups jointly so all compatible additional members get a pair", () => {
    const ms = [
      member("0", "leader", ["old", "young"]),
      member("1", "leader", ["young"]),
      member("2", "leader"),
      member("3", "follower", ["young"]),
      member("4", "follower"),
      member("5", "follower"),
    ];
    const e = event(ms, { oldPairs: 1, youngPairs: 1 });
    const db = database(ms, e);
    for (let seed = 0; seed < 12; seed++) {
      const r = generateSeasonPairs(db, e, defaultTuning, String(seed));
      expect(r.pairs).toHaveLength(3);
      expect(r.standingIds).toEqual([]);
      expect(
        r.pairs.filter((p) => !p.belowLine && p.ageGroup === "old"),
      ).toHaveLength(1);
      expect(
        r.pairs.filter((p) => !p.belowLine && p.ageGroup === "young"),
      ).toHaveLength(1);
      expect(validatePairs(db, e, r.pairs)).toBeNull();
    }
  });
  it("matches an independent exhaustive oracle for group quotas and forbidden edges", () => {
    const groups: AgeGroup[][] = [["old"], ["young"], ["old", "young"]];
    for (let mask = 0; mask < 81; mask++) {
      let value = mask;
      const ms = Array.from({ length: 4 }, (_, i) => {
        const group = groups[value % 3];
        value = Math.floor(value / 3);
        return member(String(i), i < 2 ? "leader" : "follower", group);
      });
      const e = event(ms, { oldPairs: 1, youngPairs: 1 }),
        db = database(ms, e);
      if (mask % 2 === 0)
        db.preferences = [
          { id: "f", memberAId: "0", memberBId: "2", kind: "forbidden" },
        ];
      let best = [0, 0];
      const visit = (i: number, used: Set<string>, assignments: AgeGroup[]) => {
        if (i === 2) {
          const main =
            Number(assignments.includes("old")) +
            Number(assignments.includes("young"));
          if (
            main > best[0] ||
            (main === best[0] && assignments.length > best[1])
          )
            best = [main, assignments.length];
          return;
        }
        visit(i + 1, used, assignments);
        for (const b of ms.slice(2))
          if (
            !used.has(b.id) &&
            !db.preferences.some(
              (p) => p.memberAId === String(i) && p.memberBId === b.id,
            )
          )
            for (const g of memberGroups(ms[i]).filter((g) =>
              memberGroups(b).includes(g),
            ))
              visit(i + 1, new Set([...used, b.id]), [...assignments, g]);
      };
      visit(0, new Set(), []);
      const result = generateSeasonPairs(db, e, defaultTuning, String(mask));
      expect(
        [result.pairs.filter((p) => !p.belowLine).length, result.pairs.length],
        `group mask ${mask}`,
      ).toEqual(best);
      expect(validatePairs(db, e, result.pairs)).toBeNull();
    }
  });
  it("reassigns an already matchable old dual member to fill young rehearsal pairs", () => {
    const ms = [
      member("a", "leader", ["old", "young"]),
      member("d", "leader"),
      member("b", "follower"),
      member("c", "follower", ["young"]),
    ];
    const e = event(ms, { type: "rehearsal" });
    const db = database(ms, e);
    for (let seed = 0; seed < 12; seed++)
      expect(
        generateSeasonPairs(db, e, defaultTuning, String(seed)).pairs,
      ).toHaveLength(2);
    expect(
      generateSeasonPairs(
        db,
        e,
        { ...defaultTuning, supplementYoung: false },
        "4",
      ).pairs,
    ).toHaveLength(1);
  });
  it("excludes absent/excused members even when selected and rejects manual pairs using them", () => {
    const ms = [member("a", "leader"), member("b", "follower")];
    const e = event(ms),
      db = database(ms, e);
    const pair = {
      id: "p",
      leaderId: "a",
      followerId: "b",
      round: 1,
      ageGroup: "old" as const,
    };
    for (const status of ["absent", "excused"] as const) {
      e.attendance[0].status = status;
      expect(generateSeasonPairs(db, e, defaultTuning, "s").pairs).toEqual([]);
      expect(validatePairs(db, e, [pair])).toContain("přítomných");
    }
  });
  it("uses recorded reality for closed legacy events even without selection and for former members", () => {
    const ms = [member("a", "leader"), member("b", "follower")];
    ms[0].active = false;
    const e = event(ms, { status: "closed", date: "2024-01-01" });
    e.attendance.forEach((r) => (r.selected = false));
    const db = database(ms, e),
      r = generateSeasonPairs(db, e, defaultTuning, "s");
    expect(pairingParticipants(db, e)).toHaveLength(2);
    expect(r.pairs).toHaveLength(1);
    expect(validatePairs(db, e, r.pairs)).toBeNull();
    e.attendance[1].status = "unknown";
    expect(generateSeasonPairs(db, e, defaultTuning, "s").pairs).toEqual([]);
  });
  it("reports why generation has no participants or no compatible pair", () => {
    const e = event([]),
      db = database([], e);
    expect(
      generateSeasonPairs(db, e, defaultTuning, "s").warnings.join(),
    ).toContain("Nejsou vybraní");
    e.status = "closed";
    expect(
      generateSeasonPairs(db, e, defaultTuning, "s").warnings.join(),
    ).toContain("skutečná přítomnost");
    const ms = [member("a", "leader"), member("b", "leader")];
    const e2 = event(ms);
    expect(
      generateSeasonPairs(
        database(ms, e2),
        e2,
        defaultTuning,
        "s",
      ).warnings.join(),
    ).toContain("nelze vytvořit pár");
  });
  it("does not invent byes for attendance without a saved set", () => {
    const ms = [
      member("a", "leader"),
      member("b", "leader"),
      member("c", "follower"),
    ];
    const e = event(ms),
      db = database(ms, e);
    const baseline = generateSeasonPairs(db, e, defaultTuning, "1");
    db.events.push(
      event(ms, {
        id: "past",
        status: "closed",
        date: "2026-09-01",
        actualPairs: [],
        attendance: [
          {
            memberId: "a",
            status: "present",
            interest: "yes",
            selected: true,
            actualStanding: false,
          },
        ],
      }),
    );
    expect(generateSeasonPairs(db, e, defaultTuning, "1").pairs).toEqual(
      baseline.pairs,
    );
  });
  it("protects recent saved standing when historical bye counts are equal", () => {
    const ms = [
      member("a", "leader"),
      member("b", "leader"),
      member("c", "follower"),
    ];
    const e = event(ms),
      db = database(ms, e);
    for (const [id, date] of [
      ["a", "2026-09-01"],
      ["b", "2026-09-27"],
    ])
      db.events.push(
        event(ms, {
          id: `past-${id}`,
          status: "closed",
          date,
          pairSets: [
            {
              id: `set-${id}`,
              name: date,
              createdAt: date,
              published: true,
              pairs: [],
              roster: [
                {
                  memberId: id,
                  fullName: id,
                  role: "leader",
                  ageGroups: ["old"],
                  standing: true,
                },
              ],
            },
          ],
          attendance: [
            {
              memberId: id,
              status: "present",
              interest: "yes",
              selected: true,
              actualStanding: true,
            },
          ],
        }),
      );
    for (let seed = 0; seed < 12; seed++)
      expect(
        generateSeasonPairs(
          db,
          e,
          { ...defaultTuning, rotation: 3, preferences: 0, experience: 0 },
          String(seed),
        ).pairs[0].leaderId,
      ).toBe("b");
  });
  it("ignores history and own points from the regenerated closed event", () => {
    const ms = [
      member("a", "leader"),
      member("b", "leader"),
      member("c", "follower"),
    ];
    const e = event(ms, { status: "closed" }),
      db = database(ms, e);
    const baseline = generateSeasonPairs(db, e, defaultTuning, "s");
    e.pairSets = [
      {
        id: "saved",
        name: "saved",
        createdAt: e.date,
        published: true,
        pairs: baseline.pairs,
      },
    ];
    e.attendance.forEach((r) => {
      r.actualStanding = true;
      r.earnedPoints = 1000;
    });
    expect(generateSeasonPairs(db, e, defaultTuning, "s").pairs).toEqual(
      baseline.pairs,
    );
  });
  it.each(["musician", "photographer"] as const)("excludes %s from generation, standing and manual candidates", (role) => {
    const ms = [
      member("a", "leader"),
      member("b", "follower"),
      member("music", role),
    ];
    for (const status of ["confirmed", "closed"] as const) {
      const e = event(ms, { status }),
        db = database(ms, e);
      expect(pairingParticipants(db, e).map((m) => m.id)).toEqual(["a", "b"]);
      const result = generateSeasonPairs(db, e, defaultTuning, "test");
      expect(result.pairs).toHaveLength(1);
      expect(result.standingIds).not.toContain("music");
      expect(compatibleMembers(ms[2], ms[0])).toBe(false);
      expect(compatibleMembers(ms[2], ms[1])).toBe(false);
      expect(
        validatePairs(db, e, [{ ...result.pairs[0], leaderId: "music" }]),
      ).toContain("role");
    }
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
