import { expect, it } from "vitest";
import { formatSetName } from "./formatters";
it("includes Prague date and minutes in default set names", () => {
  expect(formatSetName("2026-10-01T14:07:59Z")).toBe("1. 10. 2026 16:07");
  expect(formatSetName("2026-12-31T23:08:00Z")).toBe("1. 1. 2027 00:08");
});
