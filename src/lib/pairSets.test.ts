import { describe, expect, it } from "vitest";
import { historyPairs, historyStandingIds, visiblePairSets } from "./pairSets";
import type { EnsembleEvent, DancePair, PairSet } from "./domain";
const main: DancePair = {
  id: "p",
  leaderId: "a",
  followerId: "b",
  ageGroup: "old",
  round: 1,
  belowLine: false,
};
const below = {
  ...main,
  id: "below",
  leaderId: "c",
  followerId: "d",
  belowLine: true,
};
const latest: PairSet = {
  id: "latest",
  name: "Poslední",
  createdAt: "2026-10-01T15:00:00Z",
  published: true,
  pairs: [main, below],
  roster: ["a", "b", "c", "d", "e"].map((memberId) => ({
    memberId,
    fullName: memberId,
    role: memberId === "b" || memberId === "d" ? "follower" : "leader",
    ageGroups: ["old"],
    standing: memberId === "e",
  })),
};
const event = (patch: Partial<EnsembleEvent> = {}): EnsembleEvent => ({
  id: "e",
  title: "Test",
  date: "2026-10-01",
  startTime: "19:00",
  endTime: "21:00",
  location: "",
  type: "performance",
  seasonKind: "dance",
  status: "closed",
  weight: 1,
  capacityPairs: 1,
  attendance: [],
  pairs: [],
  pairsPublished: false,
  pairSets: [
    {
      ...latest,
      id: "old",
      createdAt: "2026-09-01",
      pairs: [{ ...main, leaderId: "e" }],
    },
    latest,
  ],
  ...patch,
});
describe("saved pair sets", () => {
  it("shows newest published set and keeps older sets selectable", () => {
    expect(visiblePairSets(event()).map((s) => s.id)).toEqual([
      "latest",
      "old",
    ]);
  });
  it("excludes drafts from members and history", () => {
    const draft = {
      ...latest,
      id: "draft",
      createdAt: "2026-10-02",
      published: false,
    };
    const e = event({ pairSets: [draft, latest] });
    expect(visiblePairSets(e, true)[0].id).toBe("draft");
    expect(visiblePairSets(e)[0].id).toBe("latest");
    expect(historyPairs(e)).toEqual([main]);
  });
  it("counts only main pairs in the latest set without actual confirmation", () => {
    expect(
      historyPairs(
        event({ actualPairs: [{ ...main, leaderId: "legacy", actual: true }] }),
      ),
    ).toEqual([main]);
    expect(historyStandingIds(event())).toEqual(["c", "d", "e"]);
  });
  it("does not invent history for rehearsals, open events or attendance alone", () => {
    for (const patch of [
      { type: "rehearsal" as const },
      { status: "open" as const },
      { pairSets: [] },
    ]) {
      expect(historyPairs(event(patch))).toEqual([]);
      expect(historyStandingIds(event(patch))).toEqual([]);
    }
  });
});
