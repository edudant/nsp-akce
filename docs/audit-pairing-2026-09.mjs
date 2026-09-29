// Reproductions for the pairing audit of commit 0dc707d. Synthetic data only.
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true, ws: false },
  appType: "custom",
});
const { generateSeasonPairs, defaultTuning } = await server.ssrLoadModule(
  "/src/lib/seasonPairing.ts",
);
const m = (id, role, groups = ["old"], primary = groups[0]) => ({
  id,
  fullName: id,
  shortName: id,
  role,
  ageGroups: groups,
  ageGroup: primary,
  experience: "experienced",
  active: true,
  joinedAt: "",
});
const ev = (ms, patch = {}) => ({
  id: "e",
  type: "performance",
  title: "Audit",
  date: "2026-09-29",
  startTime: "19:00",
  endTime: "21:00",
  location: "",
  status: "confirmed",
  weight: 1,
  oldPairs: 1,
  youngPairs: 1,
  seasonId: "s",
  seasonKind: "dance",
  pairs: [],
  pairsPublished: false,
  attendance: ms.map((x) => ({
    memberId: x.id,
    status: "present",
    interest: "yes",
    selected: true,
    earnedPoints: 0,
  })),
  ...patch,
});
const db = (ms, e) => ({
  members: ms,
  events: [e],
  preferences: [],
  accessMode: "admin",
  updatedAt: "",
});
const summarize = (r) => ({
  pairs: r.pairs.map((p) => [
    p.leaderId,
    p.followerId,
    p.ageGroup,
    p.belowLine,
  ]),
  standing: r.standingIds,
  warnings: r.warnings,
});
try {
  const ms = [m("a", "leader"), m("b", "follower")],
    e = ev(ms, { oldPairs: 1, youngPairs: 0 });
  e.attendance[0].status = "absent";
  console.log(
    "ABSENT_SELECTED",
    JSON.stringify(
      summarize(generateSeasonPairs(db(ms, e), e, defaultTuning, "s")),
    ),
  );
  const ms2 = [
    m("a", "leader"),
    m("b", "leader"),
    m("c", "follower"),
    m("d", "follower"),
  ];
  const e2 = ev(ms2, { oldPairs: 1, youngPairs: 0 });
  const d2 = db(ms2, e2);
  d2.events.push(
    ev(ms2, {
      id: "previous",
      date: "2026-09-01",
      status: "closed",
      pairs: [],
      actualPairs: [],
    }),
  );
  const baseline = summarize(generateSeasonPairs(d2, e2, defaultTuning, "s"));
  const tuning = {
    ...defaultTuning,
    preferences: 0,
    points: 0,
    experience: 0,
    rotation: 3,
  };
  console.log(
    "UNCONFIRMED_HISTORY",
    JSON.stringify({
      withEmptyActual: summarize(generateSeasonPairs(d2, e2, tuning, "s")),
      baseline,
    }),
  );
  let found = false;
  const groups = [["old"], ["young"], ["old", "young"]];
  for (let bits = 0; bits < 729 && !found; bits++) {
    let v = bits;
    const ms = Array.from({ length: 6 }, (_, i) => {
      const g = groups[v % 3];
      v = Math.floor(v / 3);
      return m(String(i), i < 3 ? "leader" : "follower", g);
    });
    const e = ev(ms);
    const d = db(ms, e);
    // Exact enumeration is an independent oracle for two groups and three pairs.
    let feasible = null;
    function walk(i, used, pairs) {
      if (i === 3) {
        if (
          pairs.filter((p) => p[2] === "old").length >= 1 &&
          pairs.filter((p) => p[2] === "young").length >= 1 &&
          pairs.length === 3
        )
          feasible = pairs;
        return;
      }
      walk(i + 1, used, pairs);
      for (let j = 3; j < 6; j++) {
        if (used.has(j)) continue;
        for (const g of ms[i].ageGroups.filter((g) =>
          ms[j].ageGroups.includes(g),
        )) {
          walk(i + 1, new Set([...used, j]), [
            ...pairs,
            [String(i), String(j), g],
          ]);
        }
      }
    }
    walk(0, new Set(), []);
    if (!feasible) continue;
    for (let seed = 0; seed < 10; seed++) {
      const r = generateSeasonPairs(d, e, defaultTuning, String(seed));
      if (r.warnings.length || r.pairs.length < 3) {
        console.log(
          "GROUP_QUOTA_FAILURE",
          JSON.stringify({
            members: ms.map((x) => [x.id, x.ageGroups]),
            seed,
            result: summarize(r),
            feasible,
          }),
        );
        found = true;
        break;
      }
    }
  }
  console.log("GROUP_QUOTA_COUNTEREXAMPLE_FOUND", found);
  // No confirmed actual pairs must not fabricate a historical bye.
  const hm = [m("a", "leader"), m("b", "leader"), m("c", "follower")];
  const he = ev(hm, { oldPairs: 1, youngPairs: 0 });
  const hd = db(hm, he);
  const ht = {
    ...defaultTuning,
    preferences: 0,
    points: 0,
    experience: 0,
    rotation: 1,
  };
  for (let seed = 0; seed < 10; seed++) {
    const without = generateSeasonPairs(hd, he, ht, String(seed));
    const past = ev(hm, {
      id: "unconfirmed",
      date: "2026-09-01",
      status: "closed",
      pairs: [],
      actualPairs: [],
      attendance: [
        { memberId: "a", status: "present", selected: true, interest: "yes" },
      ],
    });
    const withHistory = generateSeasonPairs(
      { ...hd, events: [he, past] },
      he,
      ht,
      String(seed),
    );
    if (without.pairs[0]?.leaderId !== withHistory.pairs[0]?.leaderId) {
      console.log(
        "FABRICATED_BYE",
        JSON.stringify({
          seed,
          without: summarize(without),
          withUnconfirmed: summarize(withHistory),
        }),
      );
      break;
    }
  }
  // Equal bye counts, different order of latest standing: adapter loses ordering.
  const ah = ev(hm, {
    id: "h1",
    date: "2026-09-01",
    status: "closed",
    actualPairs: [{ id: "p1", leaderId: "b", followerId: "x", actual: true }],
    pairs: [],
  });
  const bh = ev(hm, {
    id: "h2",
    date: "2026-09-28",
    status: "closed",
    actualPairs: [{ id: "p2", leaderId: "a", followerId: "x", actual: true }],
    pairs: [],
  });
  ah.attendance.forEach(r => r.actualStanding = r.memberId === "a");
  bh.attendance.forEach(r => r.actualStanding = r.memberId === "b");
  let count = 0;
  for (let seed = 0; seed < 20; seed++) {
    const r = generateSeasonPairs(
      { ...hd, events: [he, ah, bh] },
      he,
      { ...ht, rotation: 3 },
      String(seed),
    );
    if (r.pairs[0]?.leaderId === "a") count++;
  }
  console.log(
    "LAST_BYE_NOT_PROTECTED",
    JSON.stringify({
      seedsLeavingLastStandingAgain: count,
      total: 20,
      lastStanding: "b",
    }),
  );

  // Rehearsal supplement must be able to reassign a dual member already matched as old.
  const rm = [
    m("a", "leader", ["old", "young"], "old"),
    m("b", "follower", ["old"]),
    m("c", "follower", ["young"]),
    m("d", "leader", ["old"]),
  ];
  const re = ev(rm, { type: "rehearsal" });
  const rd = db(rm, re);
  rd.preferences = [
    { id: "f", memberAId: "d", memberBId: "c", kind: "forbidden" },
  ];
  for (let seed = 0; seed < 5; seed++)
    console.log(
      "REHEARSAL_SUPPLEMENT",
      JSON.stringify({
        seed,
        ...summarize(generateSeasonPairs(rd, re, defaultTuning, String(seed))),
      }),
    );
} finally {
  await server.close();
}
