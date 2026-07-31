import type { AgeGroup, Member, PairingRole } from "./domain";

export type MemberStatusFilter = "active" | "all" | "inactive";
export type MemberRoleFilter = "all" | PairingRole;
export type MemberAgeGroupFilter = "all" | AgeGroup | "unassigned";

export interface MemberFilters {
  search: string;
  status: MemberStatusFilter;
  role: MemberRoleFilter;
  ageGroup: MemberAgeGroupFilter;
}

export function normalizeMemberSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs")
    .trim();
}

function ageGroupSearchTerms(ageGroup: AgeGroup | null): string {
  if (ageGroup === "young") return "mladi mlady";
  if (ageGroup === "old") return "stari stary";
  return "nezarazeno nezarazeni bez zarazeni";
}

export function filterMembers(
  members: readonly Member[],
  filters: MemberFilters,
): Member[] {
  const searchTerms = normalizeMemberSearch(filters.search)
    .split(/\s+/)
    .filter(Boolean);

  return members
    .filter((member) => {
      if (filters.status === "active") return member.active;
      if (filters.status === "inactive") return !member.active;
      return true;
    })
    .filter(
      (member) => filters.role === "all" || member.role === filters.role,
    )
    .filter((member) => {
      if (filters.ageGroup === "all") return true;
      if (filters.ageGroup === "unassigned") return member.ageGroup === null;
      return member.ageGroup === filters.ageGroup;
    })
    .filter((member) => {
      const haystack = normalizeMemberSearch(
        `${member.fullName} ${member.shortName} ${ageGroupSearchTerms(member.ageGroup)}`,
      );
      return searchTerms.every((term) => haystack.includes(term));
    })
    .sort((first, second) =>
      first.fullName.localeCompare(second.fullName, "cs"),
    );
}
