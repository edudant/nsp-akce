import { describe, expect, it } from "vitest";
import type { AgeGroup, Member, PairingRole } from "./domain";
import { filterMembers, normalizeMemberSearch } from "./memberFilters";

function member(
  id: string,
  fullName: string,
  ageGroup: AgeGroup | null,
  options: { active?: boolean; role?: PairingRole } = {},
): Member {
  return {
    id,
    fullName,
    shortName: fullName.split(" ")[0],
    role: options.role ?? "leader",
    experience: "advanced",
    ageGroup,
    active: options.active ?? true,
    joinedAt: "2005-01-01",
  };
}

const members = [
  member("young", "Žofie Mladá", "young"),
  member("old", "Adam Starší", "old", { role: "follower" }),
  member("unassigned", "Čeněk Nový", null),
  member("inactive", "Bohumil Bývalý", "old", { active: false }),
];

describe("normalizeMemberSearch", () => {
  it("odstraní diakritiku a sjednotí velikost písmen", () => {
    expect(normalizeMemberSearch("  NEZAŘAZENÍ Žofie  ")).toBe(
      "nezarazeni zofie",
    );
  });
});

describe("filterMembers", () => {
  it.each([
    ["mladí", ["young"]],
    ["mladi", ["young"]],
    ["mladý", ["young"]],
    ["staří", ["old"]],
    ["starí", ["old"]],
    ["stari", ["old"]],
    ["starý", ["old"]],
    ["nezařazení", ["unassigned"]],
    ["nezarazeni", ["unassigned"]],
  ])("najde zařazení hledáním %s", (search, expectedIds) => {
    expect(
      filterMembers(members, {
        search,
        status: "active",
        role: "all",
        ageGroup: "all",
      }).map((item) => item.id),
    ).toEqual(expectedIds);
  });

  it("kombinuje stav, roli a zařazení", () => {
    expect(
      filterMembers(members, {
        search: "",
        status: "all",
        role: "follower",
        ageGroup: "old",
      }).map((item) => item.id),
    ).toEqual(["old"]);
  });

  it("filtruje nezařazené členy", () => {
    expect(
      filterMembers(members, {
        search: "cenek",
        status: "all",
        role: "all",
        ageGroup: "unassigned",
      }).map((item) => item.id),
    ).toEqual(["unassigned"]);
  });
});
