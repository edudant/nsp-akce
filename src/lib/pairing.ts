/**
 * Deterministic, dependency-free pairing engine.
 *
 * The engine intentionally knows nothing about Supabase or React. Callers map
 * persisted members and constraints to these small input types and persist the
 * returned IDs. Lower pair scores are better.
 */

export const PAIRING_ALGORITHM_VERSION = 'mvp-2';

export type ExperienceLevel = 'beginner' | 'advanced' | 'experienced';
export type PairingSeed = string | number;
export type DateInput = Date | string | number;

export interface PairingMember {
  id: string;
  displayName?: string;
  role: string;
  experienceLevel: ExperienceLevel;
  /** Defaults to true. */
  active?: boolean;
  /** Defaults to true. */
  available?: boolean;
  /** Number of recorded byes before this event. */
  byeCount?: number;
  /** Used to avoid giving the same person two consecutive byes. */
  lastByeAt?: DateInput | null;
}

export interface PairingPreference {
  memberAId: string;
  memberBId: string;
  kind: 'forbidden' | 'discouraged' | 'preferred';
  /** Multiplier between 0 and 1. Defaults to 1. */
  strength?: number;
  validFrom?: DateInput;
  validTo?: DateInput;
}

/**
 * A member's event-wide, directional wish to dance with another member.
 * Two opposite wishes for the same pair are treated as a stronger mutual wish.
 * Wishes are always soft: forbidden PairingPreferences remain hard constraints.
 */
export interface PartnerWish {
  memberId: string;
  partnerId: string;
  /** Multiplier between 0 and 1. Defaults to 1. */
  strength?: number;
}

/**
 * One named pairing assignment. An empty programItemIds list means that the
 * assignment applies to the whole event. Array order defines the legacy round.
 */
export interface PairingBlock {
  id: string;
  name: string;
  programItemIds?: readonly string[];
}

export interface PairingHistoryEntry {
  memberAId: string;
  memberBId: string;
  occurredAt: DateInput;
  /**
   * Number of occurrences represented per program item. Defaults to 1. Each
   * unique program item multiplies this count; a row without programs uses it
   * directly for backward-compatible aggregated history.
   */
  count?: number;
  /** Programs in which this pair actually shared the assignment. */
  programItemIds?: readonly string[];
  /**
   * Optional confidence/relevance multiplier for the repeat penalty. The
   * human-readable occurrence count remains unweighted. Defaults to 1.
   */
  occurrenceWeight?: number;
  /**
   * Confirmed, actually danced history has full weight. A proposal that was
   * never confirmed has only `weights.proposalHistoryFactor` weight.
   */
  actual?: boolean;
}

export interface LockedPair {
  memberAId: string;
  memberBId: string;
  /**
   * One-based round number. If omitted, the lock applies to round 1.
   * Use one row per round when a pair must be locked in multiple rounds.
   */
  round?: number;
  /** Preferred named-block target. Can be used instead of round. */
  blockId?: string;
}

export type CompatibleRolePair = readonly [leftRole: string, rightRole: string];

export interface PairingWeights {
  repeat: number;
  recency: number;
  beginnerBeginner: number;
  beginnerExperiencedBonus: number;
  preferredBonus: number;
  /** Reward for a one-sided, event-wide partner wish. */
  partnerWishBonus: number;
  /** Reward for a mutual, event-wide partner wish. Must exceed one-sided. */
  mutualPartnerWishBonus: number;
  discouraged: number;
  /** Strongly discourages, but does not forbid, a repeat in the same event. */
  sameEventRepeat: number;
  /**
   * Rewards pairing a person who has historically had more byes, thereby
   * rotating the next bye toward a person with fewer byes.
   */
  historicalByeFairness: number;
  /** Strong reward for pairing anyone who already had a bye in this event. */
  sameEventByeFairness: number;
  /** Additional reward for a person whose most recent recorded event was a bye. */
  consecutiveByeAvoidance: number;
  proposalHistoryFactor: number;
  recencyWindowDays: number;
  /** Seeded tie-breaker. Keep below one so it never outweighs an integer rule. */
  tieBreaker: number;
}

export interface PairingRequest {
  members: readonly PairingMember[];
  rounds?: number;
  /**
   * Named replacements for rounds. Array order is retained as the one-based
   * legacy round number. If omitted, `rounds` creates Kolo 1, Kolo 2, ...
   */
  pairingBlocks?: readonly PairingBlock[];
  /**
   * Explicit compatible role directions. All left roles must be disjoint from
   * all right roles. If omitted, exactly two distinct roles are inferred.
   */
  compatibleRolePairs?: readonly CompatibleRolePair[];
  preferences?: readonly PairingPreference[];
  /** Directional, event-wide soft wishes made by members. */
  partnerWishes?: readonly PartnerWish[];
  history?: readonly PairingHistoryEntry[];
  lockedPairs?: readonly LockedPair[];
  seed?: PairingSeed;
  /** Increment for the "another variant" action while retaining the base seed. */
  variant?: number;
  /**
   * Logical date for validity and recency. For full reproducibility pass the
   * event date. If omitted, the newest history date is used.
   */
  asOf?: DateInput;
  weights?: Partial<PairingWeights>;
}

export type PairingWarningCode =
  | 'DUPLICATE_MEMBER'
  | 'INVALID_MEMBER'
  | 'ROLE_CONFIGURATION'
  | 'INVALID_BLOCK'
  | 'DUPLICATE_BLOCK'
  | 'PROGRAM_ITEM_OVERLAP'
  | 'WHOLE_EVENT_BLOCK_CONFLICT'
  | 'UNSUPPORTED_ROLE'
  | 'INVALID_LOCK'
  | 'LOCK_CONFLICT'
  | 'LOCK_FORBIDDEN'
  | 'LOCK_ROLE_INCOMPATIBLE'
  | 'PAIR_REPEATED_IN_EVENT'
  | 'ROLE_IMBALANCE'
  | 'NO_ALLOWED_PARTNER'
  | 'CONSTRAINTS_PREVENT_COMPLETE_PAIRING';

export interface PairingWarning {
  code: PairingWarningCode;
  round?: number;
  blockId?: string;
  blockName?: string;
  memberIds: string[];
  message: string;
}

export interface GeneratedPair {
  round: number;
  blockId: string;
  blockName: string;
  programItemIds: string[];
  /** Number of history occurrences represented by this assignment. */
  occurrenceCount: number;
  memberAId: string;
  memberBId: string;
  locked: boolean;
  /** Lower is better; useful for diagnostics, not as a user-facing grade. */
  score: number;
  explanation: string;
}

export type PairingByeReason =
  | 'role-imbalance'
  | 'no-allowed-partner'
  | 'constraints';

export interface PairingBye {
  memberId: string;
  reason: PairingByeReason;
  explanation: string;
}

export interface PairingRoundResult {
  round: number;
  blockId: string;
  blockName: string;
  programItemIds: string[];
  pairs: GeneratedPair[];
  byes: PairingBye[];
  /** True only if every eligible member is paired. */
  complete: boolean;
}

export interface PairingResult {
  algorithmVersion: typeof PAIRING_ALGORITHM_VERSION;
  seed: string;
  variant: number;
  rounds: PairingRoundResult[];
  /** Named view of rounds. Contains the same block result objects as rounds. */
  blocks: PairingRoundResult[];
  warnings: PairingWarning[];
  eligibleMemberIds: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_PAIRING_WEIGHTS: Readonly<PairingWeights> = {
  repeat: 24,
  recency: 30,
  beginnerBeginner: 36,
  beginnerExperiencedBonus: 18,
  preferredBonus: 8,
  partnerWishBonus: 12,
  mutualPartnerWishBonus: 24,
  // Deliberately dominates all ordinary preferences: this edge is retained so
  // maximum attendance stays possible, but is otherwise a last resort.
  discouraged: 100_000,
  sameEventRepeat: 50_000,
  historicalByeFairness: 40,
  sameEventByeFairness: 1_000,
  consecutiveByeAvoidance: 80,
  proposalHistoryFactor: 0.2,
  recencyWindowDays: 365,
  tieBreaker: 0.001,
};

interface RoleConfiguration {
  pairs: CompatibleRolePair[];
  leftRoles: Set<string>;
  rightRoles: Set<string>;
  valid: boolean;
}

interface PairHistorySummary {
  weightedCount: number;
  actualCount: number;
  mostRecentAt?: number;
  mostRecentWeight?: number;
}

interface PairCost {
  score: number;
  explanation: string;
}

interface MatchingEdge {
  leftIndex: number;
  rightIndex: number;
  cost: number;
}

interface FlowEdge {
  to: number;
  reverseIndex: number;
  capacity: number;
  cost: number;
  matching?: MatchingEdge;
}

interface Match {
  leftIndex: number;
  rightIndex: number;
  cost: number;
}

interface PreferenceLookup {
  kind: PairingPreference['kind'];
  strength: number;
}

interface PartnerWishLookup {
  mutual: boolean;
  strength: number;
}

interface NormalizedPairingBlock {
  round: number;
  id: string;
  name: string;
  programItemIds: string[];
  occurrenceCount: number;
}

/**
 * Generate maximum-cardinality, minimum-cost pairs for one or more rounds.
 * Invalid contradictory locks are reported and skipped; hard constraints are
 * never silently violated.
 */
export function generatePairings(request: PairingRequest): PairingResult {
  const warnings: PairingWarning[] = [];
  const seed = String(request.seed ?? 'nsp-pairing');
  const variant = toNonNegativeInteger(request.variant, 0);
  const numberOfRounds = Math.max(1, toPositiveInteger(request.rounds, 1));
  const pairingBlocks = resolvePairingBlocks(
    request.pairingBlocks,
    numberOfRounds,
    warnings,
  );
  const weights: PairingWeights = {
    ...DEFAULT_PAIRING_WEIGHTS,
    ...request.weights,
  };

  const membersById = new Map<string, PairingMember>();
  for (const member of request.members) {
    const id = member.id.trim();
    if (!id || !member.role.trim()) {
      warnings.push({
        code: 'INVALID_MEMBER',
        memberIds: id ? [id] : [],
        message: 'Člen bez ID nebo párovací role byl z generování vyřazen.',
      });
      continue;
    }
    if (membersById.has(id)) {
      warnings.push({
        code: 'DUPLICATE_MEMBER',
        memberIds: [id],
        message: `Člen ${id} je ve vstupu vícekrát; použit byl první záznam.`,
      });
      continue;
    }
    if (member.active === false || member.available === false) {
      continue;
    }
    membersById.set(id, { ...member, id, role: member.role.trim() });
  }

  const members = [...membersById.values()].sort(compareMembers);
  const roleConfiguration = resolveRoleConfiguration(
    members,
    request.compatibleRolePairs,
    warnings,
  );
  const eligibleMembers = members.filter(
    (member) =>
      roleConfiguration.leftRoles.has(member.role) ||
      roleConfiguration.rightRoles.has(member.role),
  );

  for (const member of members) {
    if (
      !roleConfiguration.leftRoles.has(member.role) &&
      !roleConfiguration.rightRoles.has(member.role)
    ) {
      warnings.push({
        code: 'UNSUPPORTED_ROLE',
        memberIds: [member.id],
        message: `Role „${member.role}“ člena ${memberLabel(member)} není v konfiguraci párování.`,
      });
    }
  }

  if (!roleConfiguration.valid) {
    const rounds = pairingBlocks.map((block) => ({
      round: block.round,
      blockId: block.id,
      blockName: block.name,
      programItemIds: [...block.programItemIds],
      pairs: [],
      byes: members.map((member) => ({
        memberId: member.id,
        reason: 'constraints' as const,
        explanation: 'Člena nelze spárovat, dokud není opravena konfigurace rolí.',
      })),
      complete: members.length === 0,
    }));
    return {
      algorithmVersion: PAIRING_ALGORITHM_VERSION,
      seed,
      variant,
      rounds,
      blocks: rounds,
      warnings,
      eligibleMemberIds: [],
    };
  }

  const asOf = resolveAsOf(
    request.asOf,
    request.history ?? [],
    eligibleMembers,
  );
  const preferences = buildPreferenceLookup(
    request.preferences ?? [],
    asOf,
  );
  const partnerWishes = buildPartnerWishLookup(request.partnerWishes ?? []);
  const history = buildHistoryLookup(request.history ?? [], weights);
  const locksByRound = groupLocksByRound(
    request.lockedPairs ?? [],
    pairingBlocks,
    warnings,
  );
  const eventByeCounts = new Map<string, number>();
  const pairingsInEvent = new Map<string, number>();
  const roundResults: PairingRoundResult[] = [];

  for (const block of pairingBlocks) {
    const round = block.round;
    const pairedMemberIds = new Set<string>();
    const generatedPairs: GeneratedPair[] = [];
    const roundLocks = locksByRound.get(round) ?? [];

    for (const lock of roundLocks) {
      const memberA = membersById.get(lock.memberAId);
      const memberB = membersById.get(lock.memberBId);
      const lockIds = [lock.memberAId, lock.memberBId];

      if (
        !memberA ||
        !memberB ||
        !eligibleMembers.some((member) => member.id === memberA.id) ||
        !eligibleMembers.some((member) => member.id === memberB.id) ||
        memberA.id === memberB.id
      ) {
        warnings.push({
          code: 'INVALID_LOCK',
          round,
          blockId: block.id,
          blockName: block.name,
          memberIds: lockIds,
          message: `Uzamčený pár ${lockIds.join(' – ')} obsahuje neznámého, nezpůsobilého nebo stejného člena.`,
        });
        continue;
      }
      if (!rolesAreCompatible(memberA.role, memberB.role, roleConfiguration.pairs)) {
        warnings.push({
          code: 'LOCK_ROLE_INCOMPATIBLE',
          round,
          blockId: block.id,
          blockName: block.name,
          memberIds: lockIds,
          message: `Uzamčený pár ${memberLabel(memberA)} – ${memberLabel(memberB)} nemá kompatibilní párovací role.`,
        });
        continue;
      }
      if (pairedMemberIds.has(memberA.id) || pairedMemberIds.has(memberB.id)) {
        warnings.push({
          code: 'LOCK_CONFLICT',
          round,
          blockId: block.id,
          blockName: block.name,
          memberIds: lockIds,
          message: `Uzamčený pár ${memberLabel(memberA)} – ${memberLabel(memberB)} koliduje s jiným uzamčeným párem v tomto kole.`,
        });
        continue;
      }

      const preference = preferences.get(pairKey(memberA.id, memberB.id));
      if (preference?.kind === 'forbidden') {
        warnings.push({
          code: 'LOCK_FORBIDDEN',
          round,
          blockId: block.id,
          blockName: block.name,
          memberIds: lockIds,
          message: `Uzamčený pár ${memberLabel(memberA)} – ${memberLabel(memberB)} je zároveň zakázaný; zákaz má přednost.`,
        });
        continue;
      }

      const key = pairKey(memberA.id, memberB.id);
      const sameEventRepeatCount = pairingsInEvent.get(key) ?? 0;

      const cost = calculatePairCost({
        memberA,
        memberB,
        round,
        seed,
        variant,
        asOf,
        history: history.get(key),
        preference,
        partnerWish: partnerWishes.get(key),
        sameEventRepeatCount,
        eventByeCounts,
        weights,
        locked: true,
      });
      generatedPairs.push({
        round,
        blockId: block.id,
        blockName: block.name,
        programItemIds: [...block.programItemIds],
        occurrenceCount: block.occurrenceCount,
        memberAId: memberA.id,
        memberBId: memberB.id,
        locked: true,
        score: roundScore(cost.score),
        explanation: cost.explanation,
      });
      pairedMemberIds.add(memberA.id);
      pairedMemberIds.add(memberB.id);
      if (sameEventRepeatCount > 0) {
        warnings.push(
          repeatedPairWarning(memberA, memberB, block, sameEventRepeatCount),
        );
      }
      pairingsInEvent.set(key, sameEventRepeatCount + block.occurrenceCount);
    }

    const leftMembers = eligibleMembers.filter(
      (member) =>
        roleConfiguration.leftRoles.has(member.role) &&
        !pairedMemberIds.has(member.id),
    );
    const rightMembers = eligibleMembers.filter(
      (member) =>
        roleConfiguration.rightRoles.has(member.role) &&
        !pairedMemberIds.has(member.id),
    );
    const costLookup = new Map<string, PairCost>();
    const edges: MatchingEdge[] = [];

    for (let leftIndex = 0; leftIndex < leftMembers.length; leftIndex += 1) {
      const memberA = leftMembers[leftIndex];
      for (let rightIndex = 0; rightIndex < rightMembers.length; rightIndex += 1) {
        const memberB = rightMembers[rightIndex];
        if (
          memberA.id === memberB.id ||
          !rolesAreCompatible(
            memberA.role,
            memberB.role,
            roleConfiguration.pairs,
          )
        ) {
          continue;
        }
        const key = pairKey(memberA.id, memberB.id);
        const preference = preferences.get(key);
        if (preference?.kind === 'forbidden') {
          continue;
        }
        const sameEventRepeatCount = pairingsInEvent.get(key) ?? 0;
        const pairCost = calculatePairCost({
          memberA,
          memberB,
          round,
          seed,
          variant,
          asOf,
          history: history.get(key),
          preference,
          partnerWish: partnerWishes.get(key),
          sameEventRepeatCount,
          eventByeCounts,
          weights,
          locked: false,
        });
        const edgeKey = matchingEdgeKey(leftIndex, rightIndex);
        costLookup.set(edgeKey, pairCost);
        edges.push({
          leftIndex,
          rightIndex,
          cost: pairCost.score,
        });
      }
    }

    const matches = minimumCostMaximumMatching(
      leftMembers.length,
      rightMembers.length,
      edges,
    );
    for (const match of matches) {
      const memberA = leftMembers[match.leftIndex];
      const memberB = rightMembers[match.rightIndex];
      const pairCost = costLookup.get(
        matchingEdgeKey(match.leftIndex, match.rightIndex),
      );
      if (!pairCost) {
        continue;
      }
      generatedPairs.push({
        round,
        blockId: block.id,
        blockName: block.name,
        programItemIds: [...block.programItemIds],
        occurrenceCount: block.occurrenceCount,
        memberAId: memberA.id,
        memberBId: memberB.id,
        locked: false,
        score: roundScore(pairCost.score),
        explanation: pairCost.explanation,
      });
      pairedMemberIds.add(memberA.id);
      pairedMemberIds.add(memberB.id);
      const key = pairKey(memberA.id, memberB.id);
      const sameEventRepeatCount = pairingsInEvent.get(key) ?? 0;
      if (sameEventRepeatCount > 0) {
        warnings.push(
          repeatedPairWarning(memberA, memberB, block, sameEventRepeatCount),
        );
      }
      pairingsInEvent.set(key, sameEventRepeatCount + block.occurrenceCount);
    }

    generatedPairs.sort(compareGeneratedPairs);
    const byes: PairingBye[] = [];
    for (const member of eligibleMembers) {
      if (pairedMemberIds.has(member.id)) {
        continue;
      }
      const bye = classifyBye({
        member,
        members: eligibleMembers,
        pairedMemberIds,
        rolePairs: roleConfiguration.pairs,
        preferences,
      });
      byes.push(bye);
      eventByeCounts.set(member.id, (eventByeCounts.get(member.id) ?? 0) + 1);
      warnings.push(warningForBye(member, bye, block));
    }
    byes.sort((a, b) => compareIds(a.memberId, b.memberId));

    roundResults.push({
      round,
      blockId: block.id,
      blockName: block.name,
      programItemIds: [...block.programItemIds],
      pairs: generatedPairs,
      byes,
      complete: byes.length === 0,
    });
  }

  return {
    algorithmVersion: PAIRING_ALGORITHM_VERSION,
    seed,
    variant,
    rounds: roundResults,
    blocks: roundResults,
    warnings,
    eligibleMemberIds: eligibleMembers.map((member) => member.id),
  };
}

function resolvePairingBlocks(
  requestedBlocks: readonly PairingBlock[] | undefined,
  legacyRounds: number,
  warnings: PairingWarning[],
): NormalizedPairingBlock[] {
  if (!requestedBlocks || requestedBlocks.length === 0) {
    return Array.from({ length: legacyRounds }, (_, index) => ({
      round: index + 1,
      id: `round-${index + 1}`,
      name: `Kolo ${index + 1}`,
      programItemIds: [],
      occurrenceCount: 1,
    }));
  }

  const candidates: Omit<NormalizedPairingBlock, 'round'>[] = [];
  const seenBlockIds = new Set<string>();
  for (const requestedBlock of requestedBlocks) {
    const id = requestedBlock.id.trim();
    const name = requestedBlock.name.trim();
    if (!id || !name) {
      warnings.push({
        code: 'INVALID_BLOCK',
        blockId: id || undefined,
        blockName: name || undefined,
        memberIds: [],
        message: 'Párovací blok bez ID nebo názvu byl z generování vyřazen.',
      });
      continue;
    }
    if (seenBlockIds.has(id)) {
      warnings.push({
        code: 'DUPLICATE_BLOCK',
        blockId: id,
        blockName: name,
        memberIds: [],
        message: `Párovací blok „${name}“ má duplicitní ID ${id}; použit byl první blok.`,
      });
      continue;
    }
    seenBlockIds.add(id);
    const programItemIds = uniqueNonEmptyIds(requestedBlock.programItemIds ?? []);
    candidates.push({
      id,
      name,
      programItemIds,
      occurrenceCount: occurrenceCountForPrograms(programItemIds),
    });
  }

  const wholeEventBlock = candidates.find(
    (block) => block.programItemIds.length === 0,
  );
  if (wholeEventBlock && candidates.length > 1) {
    warnings.push({
      code: 'WHOLE_EVENT_BLOCK_CONFLICT',
      blockId: wholeEventBlock.id,
      blockName: wholeEventBlock.name,
      memberIds: [],
      message: `Blok „${wholeEventBlock.name}“ platí pro celou událost, proto nelze současně použít další párovací bloky.`,
    });
    return [{ ...wholeEventBlock, round: 1 }];
  }

  const claimedProgramItemIds = new Set<string>();
  const nonOverlapping: Omit<NormalizedPairingBlock, 'round'>[] = [];
  for (const candidate of candidates) {
    const overlappingIds = candidate.programItemIds.filter((id) =>
      claimedProgramItemIds.has(id),
    );
    if (overlappingIds.length > 0) {
      warnings.push({
        code: 'PROGRAM_ITEM_OVERLAP',
        blockId: candidate.id,
        blockName: candidate.name,
        memberIds: [],
        message: `Blok „${candidate.name}“ překrývá již použité části programu: ${overlappingIds.join(', ')}.`,
      });
      continue;
    }
    candidate.programItemIds.forEach((id) => claimedProgramItemIds.add(id));
    nonOverlapping.push(candidate);
  }

  return nonOverlapping.map((block, index) => ({
    ...block,
    round: index + 1,
  }));
}

function resolveRoleConfiguration(
  members: readonly PairingMember[],
  requestedPairs: readonly CompatibleRolePair[] | undefined,
  warnings: PairingWarning[],
): RoleConfiguration {
  let pairs: CompatibleRolePair[];
  if (requestedPairs && requestedPairs.length > 0) {
    pairs = requestedPairs
      .map(([left, right]) => [left.trim(), right.trim()] as const)
      .filter(([left, right]) => left.length > 0 && right.length > 0);
  } else {
    const roles = [...new Set(members.map((member) => member.role))].sort(compareIds);
    pairs = roles.length === 2 ? [[roles[0], roles[1]]] : [];
    if (members.length > 0 && roles.length !== 2) {
      warnings.push({
        code: 'ROLE_CONFIGURATION',
        memberIds: members.map((member) => member.id),
        message:
          'Párovací role nelze jednoznačně odvodit. Zadejte explicitní kompatibilní dvojice rolí.',
      });
    }
  }

  const leftRoles = new Set(pairs.map(([left]) => left));
  const rightRoles = new Set(pairs.map(([, right]) => right));
  const overlappingRoles = [...leftRoles].filter((role) => rightRoles.has(role));
  const hasSelfPair = pairs.some(([left, right]) => left === right);
  const valid = pairs.length > 0 && overlappingRoles.length === 0 && !hasSelfPair;
  if (!valid && pairs.length > 0) {
    warnings.push({
      code: 'ROLE_CONFIGURATION',
      memberIds: members.map((member) => member.id),
      message:
        'Levé a pravé párovací role se nesmějí překrývat ani párovat samy se sebou.',
    });
  }

  return { pairs, leftRoles, rightRoles, valid };
}

function buildPreferenceLookup(
  preferences: readonly PairingPreference[],
  asOf: number,
): Map<string, PreferenceLookup> {
  const result = new Map<string, PreferenceLookup>();
  const priority: Record<PairingPreference['kind'], number> = {
    preferred: 1,
    discouraged: 2,
    forbidden: 3,
  };

  for (const preference of preferences) {
    const validFrom = toTimestamp(preference.validFrom);
    const validTo = toTimestamp(preference.validTo);
    if (
      (validFrom !== undefined && asOf < validFrom) ||
      (validTo !== undefined && asOf > validTo)
    ) {
      continue;
    }
    const key = pairKey(preference.memberAId, preference.memberBId);
    const requestedStrength = preference.strength ?? 1;
    const candidate: PreferenceLookup = {
      kind: preference.kind,
      strength: clamp(
        Number.isFinite(requestedStrength) ? requestedStrength : 1,
        0,
        1,
      ),
    };
    const current = result.get(key);
    if (
      !current ||
      priority[candidate.kind] > priority[current.kind] ||
      (priority[candidate.kind] === priority[current.kind] &&
        candidate.strength > current.strength)
    ) {
      result.set(key, candidate);
    }
  }
  return result;
}

function buildPartnerWishLookup(
  wishes: readonly PartnerWish[],
): Map<string, PartnerWishLookup> {
  const directional = new Map<string, Map<string, number>>();
  for (const wish of wishes) {
    const memberId = wish.memberId.trim();
    const partnerId = wish.partnerId.trim();
    if (!memberId || !partnerId || memberId === partnerId) {
      continue;
    }
    const requestedStrength = wish.strength ?? 1;
    const strength = clamp(
      Number.isFinite(requestedStrength) ? requestedStrength : 1,
      0,
      1,
    );
    if (strength === 0) {
      continue;
    }
    const key = pairKey(memberId, partnerId);
    const byRequester = directional.get(key) ?? new Map<string, number>();
    byRequester.set(
      memberId,
      Math.max(byRequester.get(memberId) ?? 0, strength),
    );
    directional.set(key, byRequester);
  }

  const result = new Map<string, PartnerWishLookup>();
  for (const [key, byRequester] of directional) {
    const strengths = [...byRequester.values()];
    const mutual = strengths.length >= 2;
    const strength = mutual
      ? strengths.reduce((sum, value) => sum + value, 0) / strengths.length
      : (strengths[0] ?? 0);
    result.set(key, { mutual, strength });
  }
  return result;
}

function buildHistoryLookup(
  historyEntries: readonly PairingHistoryEntry[],
  weights: PairingWeights,
): Map<string, PairHistorySummary> {
  const result = new Map<string, PairHistorySummary>();
  for (const entry of historyEntries) {
    if (entry.memberAId === entry.memberBId) {
      continue;
    }
    const occurredAt = toTimestamp(entry.occurredAt);
    if (occurredAt === undefined) {
      continue;
    }
    const programItemIds = uniqueNonEmptyIds(entry.programItemIds ?? []);
    const requestedCount = entry.count ?? 1;
    const countPerProgram = Math.max(
      0,
      Number.isFinite(requestedCount) ? requestedCount : 1,
    );
    const count =
      countPerProgram * occurrenceCountForPrograms(programItemIds);
    const requestedOccurrenceWeight = entry.occurrenceWeight ?? 1;
    const occurrenceWeight = Math.max(
      0,
      Number.isFinite(requestedOccurrenceWeight)
        ? requestedOccurrenceWeight
        : 1,
    );
    if (count === 0) {
      continue;
    }
    const actual = entry.actual !== false;
    const key = pairKey(entry.memberAId, entry.memberBId);
    const current = result.get(key) ?? {
      weightedCount: 0,
      actualCount: 0,
    };
    current.weightedCount +=
      count * occurrenceWeight * (actual ? 1 : weights.proposalHistoryFactor);
    current.actualCount += actual ? count : 0;
    const recencyWeight =
      occurrenceWeight * (actual ? 1 : weights.proposalHistoryFactor);
    if (current.mostRecentAt === undefined || occurredAt > current.mostRecentAt) {
      current.mostRecentAt = occurredAt;
      current.mostRecentWeight = recencyWeight;
    } else if (occurredAt === current.mostRecentAt) {
      current.mostRecentWeight = Math.max(
        current.mostRecentWeight ?? 0,
        recencyWeight,
      );
    }
    result.set(key, current);
  }
  return result;
}

function groupLocksByRound(
  locks: readonly LockedPair[],
  blocks: readonly NormalizedPairingBlock[],
  warnings: PairingWarning[],
): Map<number, LockedPair[]> {
  const result = new Map<number, LockedPair[]>();
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const blocksByRound = new Map(blocks.map((block) => [block.round, block]));
  for (const lock of locks) {
    const requestedBlockId = lock.blockId?.trim();
    const requestedBlock = requestedBlockId
      ? blocksById.get(requestedBlockId)
      : undefined;
    const round = requestedBlock?.round ?? lock.round ?? 1;
    const resolvedBlock = blocksByRound.get(round);
    const targetsDifferentBlocks = Boolean(
      requestedBlock && lock.round !== undefined && lock.round !== requestedBlock.round,
    );
    if (
      (requestedBlockId && !requestedBlock) ||
      targetsDifferentBlocks ||
      !Number.isInteger(round) ||
      !resolvedBlock
    ) {
      warnings.push({
        code: 'INVALID_LOCK',
        blockId: requestedBlockId,
        memberIds: [lock.memberAId, lock.memberBId],
        message: requestedBlockId && !requestedBlock
          ? `Uzamčený pár odkazuje na neznámý blok ${requestedBlockId}.`
          : targetsDifferentBlocks
            ? `Uzamčený pár odkazuje současně na rozdílný blok a kolo.`
            : `Uzamčený pár má neplatné číslo kola ${String(round)}.`,
      });
      continue;
    }
    const normalized: LockedPair = {
      memberAId: lock.memberAId.trim(),
      memberBId: lock.memberBId.trim(),
      round,
      blockId: resolvedBlock.id,
    };
    const current = result.get(round) ?? [];
    current.push(normalized);
    result.set(round, current);
  }
  for (const roundLocks of result.values()) {
    roundLocks.sort((a, b) =>
      compareIds(
        pairKey(a.memberAId, a.memberBId),
        pairKey(b.memberAId, b.memberBId),
      ),
    );
  }
  return result;
}

function calculatePairCost(input: {
  memberA: PairingMember;
  memberB: PairingMember;
  round: number;
  seed: string;
  variant: number;
  asOf: number;
  history?: PairHistorySummary;
  preference?: PreferenceLookup;
  partnerWish?: PartnerWishLookup;
  sameEventRepeatCount: number;
  eventByeCounts: ReadonlyMap<string, number>;
  weights: PairingWeights;
  locked: boolean;
}): PairCost {
  const {
    memberA,
    memberB,
    round,
    seed,
    variant,
    asOf,
    history,
    preference,
    partnerWish,
    sameEventRepeatCount,
    eventByeCounts,
    weights,
    locked,
  } = input;
  let score = 0;
  const reasons: string[] = [];

  if (history && (history.weightedCount > 0 || history.actualCount > 0)) {
    score += history.weightedCount * weights.repeat;
    if (history.actualCount > 0) {
      reasons.push(
        `Společně tančili ${formatCount(history.actualCount)}× v evidované historii.`,
      );
    } else {
      reasons.push('V historii je pouze dřívější nepotvrzený návrh tohoto páru.');
    }
    if (history.mostRecentAt !== undefined && weights.recencyWindowDays > 0) {
      const ageDays = Math.max(
        0,
        Math.floor((asOf - history.mostRecentAt) / DAY_MS),
      );
      const recencyFactor = Math.max(
        0,
        1 - ageDays / weights.recencyWindowDays,
      );
      score +=
        recencyFactor * weights.recency * (history.mostRecentWeight ?? 1);
      if (recencyFactor > 0) {
        reasons.push(
          ageDays === 0
            ? 'Naposledy spolu tančili ve stejný den jako rozhodné datum.'
            : `Naposledy spolu tančili před ${ageDays} dny.`,
        );
      }
    }
  } else {
    reasons.push('V evidované historii spolu ještě netančili.');
  }

  if (sameEventRepeatCount > 0) {
    score += sameEventRepeatCount * weights.sameEventRepeat;
    reasons.push(
      `V této události už spolu tančili ${sameEventRepeatCount}×; opakování bylo použito až po silném znevýhodnění.`,
    );
  }

  const beginnerCount = Number(memberA.experienceLevel === 'beginner') +
    Number(memberB.experienceLevel === 'beginner');
  const experiencedCount = Number(memberA.experienceLevel === 'experienced') +
    Number(memberB.experienceLevel === 'experienced');
  if (beginnerCount === 1 && experiencedCount === 1) {
    score -= weights.beginnerExperiencedBonus;
    reasons.push('Začátečník je spárován se zkušeným členem.');
  } else if (beginnerCount === 2) {
    score += weights.beginnerBeginner;
    reasons.push('Dvojice dvou začátečníků byla použita až po zvážení ostatních možností.');
  }

  if (preference?.kind === 'preferred') {
    score -= weights.preferredBonus * preference.strength;
    reasons.push('Byla zohledněna mírná preference tohoto páru.');
  } else if (preference?.kind === 'discouraged') {
    score += weights.discouraged * preference.strength;
    reasons.push(
      'Pár je označen jako nevhodný a byl použit jen v rámci nejlepšího dostupného úplného řešení.',
    );
  }

  if (partnerWish?.mutual) {
    score -= weights.mutualPartnerWishBonus * partnerWish.strength;
    reasons.push('Bylo zohledněno vzájemné přání tohoto páru.');
  } else if (partnerWish) {
    score -= weights.partnerWishBonus * partnerWish.strength;
    reasons.push('Bylo zohledněno přání jednoho člena tančit v tomto páru.');
  }

  const sameEventByesA = eventByeCounts.get(memberA.id) ?? 0;
  const sameEventByesB = eventByeCounts.get(memberB.id) ?? 0;
  score -=
    (sameEventByesA + sameEventByesB) * weights.sameEventByeFairness;
  score -=
    ((memberA.byeCount ?? 0) + (memberB.byeCount ?? 0)) *
    weights.historicalByeFairness;

  const lastByeA = toTimestamp(memberA.lastByeAt);
  const lastByeB = toTimestamp(memberB.lastByeAt);
  const latestKnownHistory = Math.max(
    lastByeA ?? Number.NEGATIVE_INFINITY,
    lastByeB ?? Number.NEGATIVE_INFINITY,
  );
  if (Number.isFinite(latestKnownHistory)) {
    const daysSinceBye = Math.max(
      0,
      Math.floor((asOf - latestKnownHistory) / DAY_MS),
    );
    if (daysSinceBye <= 30) {
      score -= weights.consecutiveByeAvoidance * (1 - daysSinceBye / 31);
    }
  }

  score +=
    deterministicUnit(
      `${seed}|${variant}|${round}|${pairKey(memberA.id, memberB.id)}`,
    ) * weights.tieBreaker;

  if (locked) {
    reasons.unshift('Pár je pro toto kolo ručně uzamčený.');
  }
  if (reasons.length === 1 && !history) {
    reasons.push('Role jsou kompatibilní a pár nemá evidované omezení.');
  }

  return {
    score,
    explanation: reasons.join(' '),
  };
}

/**
 * Successive shortest augmenting paths. Sending flow until no path remains
 * makes cardinality primary; path costs then minimize the total soft penalty.
 */
function minimumCostMaximumMatching(
  leftCount: number,
  rightCount: number,
  matchingEdges: readonly MatchingEdge[],
): Match[] {
  if (leftCount === 0 || rightCount === 0 || matchingEdges.length === 0) {
    return [];
  }

  const source = 0;
  const firstLeft = 1;
  const firstRight = firstLeft + leftCount;
  const sink = firstRight + rightCount;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);

  const addEdge = (
    from: number,
    to: number,
    capacity: number,
    cost: number,
    matching?: MatchingEdge,
  ): void => {
    const forward: FlowEdge = {
      to,
      reverseIndex: graph[to].length,
      capacity,
      cost,
      matching,
    };
    const reverse: FlowEdge = {
      to: from,
      reverseIndex: graph[from].length,
      capacity: 0,
      cost: -cost,
    };
    graph[from].push(forward);
    graph[to].push(reverse);
  };

  for (let left = 0; left < leftCount; left += 1) {
    addEdge(source, firstLeft + left, 1, 0);
  }
  for (const edge of [...matchingEdges].sort(compareMatchingEdges)) {
    addEdge(
      firstLeft + edge.leftIndex,
      firstRight + edge.rightIndex,
      1,
      edge.cost,
      edge,
    );
  }
  for (let right = 0; right < rightCount; right += 1) {
    addEdge(firstRight + right, sink, 1, 0);
  }

  while (true) {
    const distances = Array<number>(graph.length).fill(Number.POSITIVE_INFINITY);
    const previousNode = Array<number>(graph.length).fill(-1);
    const previousEdge = Array<number>(graph.length).fill(-1);
    distances[source] = 0;

    // Bellman-Ford is intentionally used here: soft bonuses create negative
    // costs, and the graph is small (roughly 60 vertices in production).
    for (let iteration = 0; iteration < graph.length - 1; iteration += 1) {
      let changed = false;
      for (let node = 0; node < graph.length; node += 1) {
        if (!Number.isFinite(distances[node])) {
          continue;
        }
        for (let edgeIndex = 0; edgeIndex < graph[node].length; edgeIndex += 1) {
          const edge = graph[node][edgeIndex];
          if (edge.capacity <= 0) {
            continue;
          }
          const nextDistance = distances[node] + edge.cost;
          if (nextDistance < distances[edge.to] - 1e-12) {
            distances[edge.to] = nextDistance;
            previousNode[edge.to] = node;
            previousEdge[edge.to] = edgeIndex;
            changed = true;
          }
        }
      }
      if (!changed) {
        break;
      }
    }

    if (previousNode[sink] === -1) {
      break;
    }
    let node = sink;
    while (node !== source) {
      const from = previousNode[node];
      const edgeIndex = previousEdge[node];
      const edge = graph[from][edgeIndex];
      edge.capacity -= 1;
      graph[node][edge.reverseIndex].capacity += 1;
      node = from;
    }
  }

  const matches: Match[] = [];
  for (let left = 0; left < leftCount; left += 1) {
    const node = firstLeft + left;
    for (const edge of graph[node]) {
      if (edge.matching && edge.capacity === 0) {
        matches.push({
          leftIndex: edge.matching.leftIndex,
          rightIndex: edge.matching.rightIndex,
          cost: edge.matching.cost,
        });
      }
    }
  }
  return matches.sort((a, b) =>
    a.leftIndex - b.leftIndex || a.rightIndex - b.rightIndex,
  );
}

function classifyBye(input: {
  member: PairingMember;
  members: readonly PairingMember[];
  pairedMemberIds: ReadonlySet<string>;
  rolePairs: readonly CompatibleRolePair[];
  preferences: ReadonlyMap<string, PreferenceLookup>;
}): PairingBye {
  const {
    member,
    members,
    pairedMemberIds,
    rolePairs,
    preferences,
  } = input;
  const roleCompatible = members.filter(
    (candidate) =>
      candidate.id !== member.id &&
      rolesAreCompatible(member.role, candidate.role, rolePairs),
  );
  const allowed = roleCompatible.filter(
    (candidate) =>
      preferences.get(pairKey(member.id, candidate.id))?.kind !== 'forbidden',
  );
  const availablePartners = allowed.filter(
    (candidate) => !pairedMemberIds.has(candidate.id),
  );
  const sameSidePopulation = members.filter((candidate) =>
    rolesShareSide(member.role, candidate.role, rolePairs),
  ).length;

  if (roleCompatible.length === 0) {
    return {
      memberId: member.id,
      reason: 'role-imbalance',
      explanation: 'Pro člena není v tomto kole dostupná kompatibilní párovací role.',
    };
  }
  if (allowed.length === 0) {
    return {
      memberId: member.id,
      reason: 'no-allowed-partner',
      explanation: 'Všechny role-kompatibilní dvojice tohoto člena jsou zakázané.',
    };
  }
  if (availablePartners.length === 0) {
    if (sameSidePopulation > roleCompatible.length) {
      return {
        memberId: member.id,
        reason: 'role-imbalance',
        explanation: 'Kompatibilní partneři byli v tomto kole využiti v jiných párech.',
      };
    }
    return {
      memberId: member.id,
      reason: 'constraints',
      explanation: 'Úplnému párování brání kombinace zákazů a obsazení ostatních párů.',
    };
  }
  return {
    memberId: member.id,
    reason: 'constraints',
    explanation: 'Úplnému párování brání kombinace omezení ostatních členů.',
  };
}

function warningForBye(
  member: PairingMember,
  bye: PairingBye,
  block: NormalizedPairingBlock,
): PairingWarning {
  const label = memberLabel(member);
  const context = {
    round: block.round,
    blockId: block.id,
    blockName: block.name,
  };
  switch (bye.reason) {
    case 'no-allowed-partner':
      return {
        code: 'NO_ALLOWED_PARTNER',
        ...context,
        memberIds: [member.id],
        message: `Nelze spárovat člena ${label}: neexistuje povolený protějšek.`,
      };
    case 'constraints':
      return {
        code: 'CONSTRAINTS_PREVENT_COMPLETE_PAIRING',
        ...context,
        memberIds: [member.id],
        message: `Nelze spárovat člena ${label}: úplnému řešení brání kombinace omezení.`,
      };
    case 'role-imbalance':
    default:
      return {
        code: 'ROLE_IMBALANCE',
        ...context,
        memberIds: [member.id],
        message: `Člen ${label} v tomto kole střídá kvůli nevyváženému počtu rolí.`,
      };
  }
}

function repeatedPairWarning(
  memberA: PairingMember,
  memberB: PairingMember,
  block: NormalizedPairingBlock,
  previousCount: number,
): PairingWarning {
  return {
    code: 'PAIR_REPEATED_IN_EVENT',
    round: block.round,
    blockId: block.id,
    blockName: block.name,
    memberIds: [memberA.id, memberB.id],
    message: `Pár ${memberLabel(memberA)} – ${memberLabel(memberB)} se v bloku „${block.name}“ opakuje; v události už spolu tančili ${previousCount}×.`,
  };
}

function rolesAreCompatible(
  roleA: string,
  roleB: string,
  pairs: readonly CompatibleRolePair[],
): boolean {
  return pairs.some(
    ([left, right]) =>
      (roleA === left && roleB === right) ||
      (roleA === right && roleB === left),
  );
}

function rolesShareSide(
  roleA: string,
  roleB: string,
  pairs: readonly CompatibleRolePair[],
): boolean {
  const leftRoles = new Set(pairs.map(([left]) => left));
  const rightRoles = new Set(pairs.map(([, right]) => right));
  return (
    (leftRoles.has(roleA) && leftRoles.has(roleB)) ||
    (rightRoles.has(roleA) && rightRoles.has(roleB))
  );
}

function resolveAsOf(
  requestedAsOf: DateInput | undefined,
  history: readonly PairingHistoryEntry[],
  members: readonly PairingMember[],
): number {
  const explicit = toTimestamp(requestedAsOf);
  if (explicit !== undefined) {
    return explicit;
  }
  const historyDates = history
    .map((entry) => toTimestamp(entry.occurredAt))
    .filter((value): value is number => value !== undefined);
  const byeDates = members
    .map((member) => toTimestamp(member.lastByeAt))
    .filter((value): value is number => value !== undefined);
  const knownDates = [...historyDates, ...byeDates];
  return knownDates.length > 0 ? Math.max(...knownDates) : 0;
}

function toTimestamp(value: DateInput | null | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const timestamp =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function uniqueNonEmptyIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function occurrenceCountForPrograms(programItemIds: readonly string[]): number {
  return programItemIds.length > 0 ? programItemIds.length : 1;
}

function pairKey(memberAId: string, memberBId: string): string {
  return compareIds(memberAId, memberBId) <= 0
    ? `${memberAId}\u0000${memberBId}`
    : `${memberBId}\u0000${memberAId}`;
}

function matchingEdgeKey(leftIndex: number, rightIndex: number): string {
  return `${leftIndex}:${rightIndex}`;
}

function compareMembers(a: PairingMember, b: PairingMember): number {
  return compareIds(a.id, b.id);
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareMatchingEdges(a: MatchingEdge, b: MatchingEdge): number {
  return (
    a.leftIndex - b.leftIndex ||
    a.rightIndex - b.rightIndex ||
    a.cost - b.cost
  );
}

function compareGeneratedPairs(a: GeneratedPair, b: GeneratedPair): number {
  return (
    compareIds(a.memberAId, b.memberAId) ||
    compareIds(a.memberBId, b.memberBId)
  );
}

function deterministicUnit(value: string): number {
  // FNV-1a plus a final avalanche; stable across browsers and Node.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

function roundScore(score: number): number {
  return Math.round(score * 1_000) / 1_000;
}

function formatCount(count: number): string {
  return Number.isInteger(count) ? String(count) : count.toFixed(1);
}

function memberLabel(member: PairingMember): string {
  return member.displayName?.trim() || member.id;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function toPositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? (value as number) : fallback;
}

function toNonNegativeInteger(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isInteger(value) && (value ?? -1) >= 0
    ? (value as number)
    : fallback;
}
