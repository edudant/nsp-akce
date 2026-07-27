import { beforeEach, describe, expect, it } from "vitest";
import { demoApi } from "./demoData";

describe("demo data lifecycle", () => {
  beforeEach(async () => {
    await demoApi.reset();
  });

  it("persists attendance, interest and selection together", async () => {
    const event = await demoApi.updateAttendance("e-04", "m-01", {
      status: "partial",
      attendedMinutes: 60,
      interest: "yes",
      selected: true,
    });

    expect(event.attendance.find((item) => item.memberId === "m-01")).toMatchObject(
      {
        status: "partial",
        attendedMinutes: 60,
        interest: "yes",
        selected: true,
      },
    );
  });

  it("supports the event close and actual-pair history workflow", async () => {
    await demoApi.savePairs(
      "e-04",
      [
        {
          id: "test-pair",
          leaderId: "m-01",
          followerId: "m-11",
          round: 1,
        },
      ],
      true,
    );
    await demoApi.updateEventStatus("e-04", "closed");
    const event = await demoApi.confirmActualPairs("e-04");

    expect(event.status).toBe("closed");
    expect(event.pairsPublished).toBe(true);
    expect(event.pairs).toEqual([
      expect.objectContaining({ id: "test-pair", actual: true }),
    ]);
  });

  it("creates, updates and removes a pairing preference", async () => {
    await demoApi.addPreference({
      memberAId: "m-01",
      memberBId: "m-11",
      kind: "forbidden",
      privateReason: "Testovací důvod",
    });
    expect(
      (await demoApi.getDatabase()).preferences.some(
        (item) =>
          item.memberAId === "m-01" &&
          item.memberBId === "m-11" &&
          item.kind === "forbidden",
      ),
    ).toBe(true);

    await demoApi.deletePreference("m-01", "m-11");
    expect(
      (await demoApi.getDatabase()).preferences.some(
        (item) =>
          [item.memberAId, item.memberBId].sort().join(":") === "m-01:m-11",
      ),
    ).toBe(false);
  });
});
