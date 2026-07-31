import { describe, expect, it } from "vitest";
import type {
  AttendanceRecord,
  EnsembleEvent,
  MemberHistoryEntry,
} from "./domain";
import {
  canRespondToEvent,
  displayedAttendancePoints,
  groupEventPairs,
  recentAttendanceEntries,
} from "./memberPortal";

function eventFixture(patch: Partial<EnsembleEvent> = {}): EnsembleEvent {
  return {
    id: "event-1",
    title: "Vystoupení",
    type: "performance",
    date: "2026-08-10",
    startTime: "18:00",
    endTime: "20:00",
    location: "Postřekov",
    status: "open",
    weight: 2,
    capacityPairs: 8,
    attendance: [],
    pairs: [],
    pairsPublished: false,
    ...patch,
  };
}

describe("member portal helpers", () => {
  it("uses the authoritative response availability before local date fallback", () => {
    expect(
      canRespondToEvent(
        eventFixture({ canRespond: false, responseDeadline: "2026-08-10" }),
        "2026-08-09",
      ),
    ).toBe(false);
    expect(
      canRespondToEvent(
        eventFixture({ responseDeadline: "2026-08-08" }),
        "2026-08-09",
      ),
    ).toBe(false);
  });

  it("prefers server-calculated points in restricted views", () => {
    const record: AttendanceRecord = {
      memberId: "member-1",
      status: "partial",
      interest: "yes",
      selected: true,
      earnedPoints: 1.25,
    };
    expect(displayedAttendancePoints(eventFixture(), record)).toBe(1.25);
  });

  it("keeps only actual past attendance in the recent list", () => {
    const entry = (
      eventId: string,
      date: string,
      attendance: MemberHistoryEntry["attendance"],
    ): MemberHistoryEntry => ({
      eventId,
      title: eventId,
      type: "rehearsal",
      date,
      response: "yes",
      attendance,
      points: 1,
      pairs: [],
    });
    const result = recentAttendanceEntries(
      [
        entry("future", "2026-08-12", "unknown"),
        entry("older", "2026-07-01", "present"),
        entry("recent", "2026-07-30", "partial"),
        entry("unrecorded", "2026-07-29", "unknown"),
      ],
      "2026-07-31",
    );
    expect(result.map((item) => item.eventId)).toEqual(["recent", "older"]);
  });

  it("groups published pairs by named block and resolves its programs", () => {
    const event = eventFixture({
      programItems: [
        { id: "p1", name: "Postřekovo", custom: false, sortOrder: 1 },
        { id: "p2", name: "Bláhoviny", custom: false, sortOrder: 2 },
      ],
      pairingBlocks: [
        {
          id: "b1",
          name: "Úvod",
          programItemIds: ["p1", "p2"],
          appliesToAll: false,
          sortOrder: 1,
        },
      ],
      pairs: [
        {
          id: "pair-1",
          leaderId: "l1",
          followerId: "f1",
          round: 1,
          blockId: "b1",
        },
        {
          id: "pair-2",
          leaderId: "l2",
          followerId: "f2",
          round: 1,
          blockId: "b1",
        },
      ],
    });
    expect(groupEventPairs(event)).toMatchObject([
      {
        name: "Úvod",
        programNames: ["Postřekovo", "Bláhoviny"],
        pairs: [{ id: "pair-1" }, { id: "pair-2" }],
      },
    ]);
  });
});
