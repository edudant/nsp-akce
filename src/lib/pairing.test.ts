import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAIRING_WEIGHTS,
  generatePairings,
  type PairingMember,
  type PairingRequest,
} from './pairing';

const rolePairs = [['M', 'F']] as const;

function member(
  id: string,
  role: 'M' | 'F',
  experienceLevel: PairingMember['experienceLevel'] = 'advanced',
  extra: Partial<PairingMember> = {},
): PairingMember {
  return {
    id,
    displayName: id,
    role,
    experienceLevel,
    ...extra,
  };
}

function generatedPairs(
  request: Omit<PairingRequest, 'compatibleRolePairs'>,
): string[][] {
  return generatePairings({
    ...request,
    compatibleRolePairs: rolePairs,
  }).rounds.map((round) =>
    round.pairs.map((pair) => `${pair.memberAId}-${pair.memberBId}`).sort(),
  );
}

describe('generatePairings', () => {
  it('finds a maximum-cardinality solution instead of taking a locally attractive edge', () => {
    const result = generatePairings({
      members: [
        member('M1', 'M'),
        member('M2', 'M'),
        member('F1', 'F'),
        member('F2', 'F'),
      ],
      compatibleRolePairs: rolePairs,
      preferences: [
        { memberAId: 'M1', memberBId: 'F2', kind: 'forbidden' },
        // A greedy preference-first implementation could consume F1 for M2.
        { memberAId: 'M2', memberBId: 'F1', kind: 'preferred' },
      ],
      seed: 'maximum',
    });

    expect(result.rounds[0].pairs).toHaveLength(2);
    expect(result.rounds[0].pairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberAId: 'M1', memberBId: 'F1' }),
        expect.objectContaining({ memberAId: 'M2', memberBId: 'F2' }),
      ]),
    );
    expect(result.rounds[0].byes).toEqual([]);
  });

  it('never produces a forbidden pair, even when it leaves members unresolved', () => {
    const result = generatePairings({
      members: [member('M1', 'M'), member('F1', 'F')],
      compatibleRolePairs: rolePairs,
      preferences: [
        { memberAId: 'F1', memberBId: 'M1', kind: 'forbidden' },
      ],
    });

    expect(result.rounds[0].pairs).toEqual([]);
    expect(result.rounds[0].byes).toHaveLength(2);
    expect(result.rounds[0].byes.every((bye) => bye.reason === 'no-allowed-partner')).toBe(true);
    expect(result.warnings.filter((warning) => warning.code === 'NO_ALLOWED_PARTNER')).toHaveLength(2);
  });

  it('preserves valid locked pairs and optimizes only the remaining members', () => {
    const result = generatePairings({
      members: [
        member('M1', 'M', 'beginner'),
        member('M2', 'M', 'experienced'),
        member('F1', 'F', 'beginner'),
        member('F2', 'F', 'experienced'),
      ],
      compatibleRolePairs: rolePairs,
      lockedPairs: [{ memberAId: 'M1', memberBId: 'F1', round: 1 }],
      seed: 5,
    });

    expect(result.rounds[0].pairs).toEqual([
      expect.objectContaining({
        memberAId: 'M1',
        memberBId: 'F1',
        locked: true,
      }),
      expect.objectContaining({
        memberAId: 'M2',
        memberBId: 'F2',
        locked: false,
      }),
    ]);
    expect(result.rounds[0].pairs[0].explanation).toContain('ručně uzamčený');
  });

  it('reports contradictory locks instead of violating a hard constraint', () => {
    const result = generatePairings({
      members: [member('M1', 'M'), member('F1', 'F')],
      compatibleRolePairs: rolePairs,
      preferences: [
        { memberAId: 'M1', memberBId: 'F1', kind: 'forbidden' },
      ],
      lockedPairs: [{ memberAId: 'M1', memberBId: 'F1' }],
    });

    expect(result.rounds[0].pairs).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'LOCK_FORBIDDEN', round: 1 }),
      ]),
    );
  });

  it('rejects role-incompatible and overlapping locks explicitly', () => {
    const result = generatePairings({
      members: [
        member('M1', 'M'),
        member('M2', 'M'),
        member('F1', 'F'),
        member('F2', 'F'),
      ],
      compatibleRolePairs: rolePairs,
      lockedPairs: [
        { memberAId: 'M1', memberBId: 'M2', round: 1 },
        { memberAId: 'M1', memberBId: 'F1', round: 1 },
        { memberAId: 'M1', memberBId: 'F2', round: 1 },
      ],
      seed: 'invalid-locks',
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'LOCK_ROLE_INCOMPATIBLE' }),
        expect.objectContaining({ code: 'LOCK_CONFLICT' }),
      ]),
    );
    expect(
      result.rounds[0].pairs.filter((pair) => pair.locked),
    ).toHaveLength(1);
  });

  it('uses a discouraged pair when that is necessary for maximum attendance', () => {
    const result = generatePairings({
      members: [
        member('M1', 'M'),
        member('M2', 'M'),
        member('F1', 'F'),
        member('F2', 'F'),
      ],
      compatibleRolePairs: rolePairs,
      preferences: [
        { memberAId: 'M1', memberBId: 'F2', kind: 'forbidden' },
        { memberAId: 'M2', memberBId: 'F2', kind: 'discouraged' },
      ],
      seed: 'discouraged',
    });

    expect(result.rounds[0].pairs).toHaveLength(2);
    const discouraged = result.rounds[0].pairs.find(
      (pair) => pair.memberAId === 'M2' && pair.memberBId === 'F2',
    );
    expect(discouraged?.explanation).toContain('označen jako nevhodný');
  });

  it('prefers beginner + experienced combinations over two beginner pairs', () => {
    const result = generatePairings({
      members: [
        member('M-beginner', 'M', 'beginner'),
        member('M-experienced', 'M', 'experienced'),
        member('F-beginner', 'F', 'beginner'),
        member('F-experienced', 'F', 'experienced'),
      ],
      compatibleRolePairs: rolePairs,
      seed: 'experience',
    });

    expect(result.rounds[0].pairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          memberAId: 'M-beginner',
          memberBId: 'F-experienced',
        }),
        expect.objectContaining({
          memberAId: 'M-experienced',
          memberBId: 'F-beginner',
        }),
      ]),
    );
    for (const pair of result.rounds[0].pairs) {
      expect(pair.explanation).toContain('Začátečník je spárován se zkušeným');
    }
  });

  it('penalizes repeated and recent historical pairs', () => {
    const result = generatePairings({
      members: [
        member('M1', 'M'),
        member('M2', 'M'),
        member('F1', 'F'),
        member('F2', 'F'),
      ],
      compatibleRolePairs: rolePairs,
      asOf: '2026-07-27T00:00:00Z',
      history: [
        {
          memberAId: 'M1',
          memberBId: 'F1',
          occurredAt: '2026-07-26T00:00:00Z',
          count: 3,
          actual: true,
        },
        {
          memberAId: 'M2',
          memberBId: 'F2',
          occurredAt: '2026-07-20T00:00:00Z',
          count: 2,
          actual: true,
        },
      ],
      seed: 'history',
    });

    expect(result.rounds[0].pairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberAId: 'M1', memberBId: 'F2' }),
        expect.objectContaining({ memberAId: 'M2', memberBId: 'F1' }),
      ]),
    );
    expect(result.rounds[0].pairs.every((pair) => pair.explanation.includes('ještě netančili'))).toBe(true);
  });

  it('gives confirmed history more weight than an unconfirmed proposal', () => {
    const base = {
      members: [
        member('M1', 'M'),
        member('M2', 'M'),
        member('F1', 'F'),
        member('F2', 'F'),
      ],
      compatibleRolePairs: rolePairs,
      asOf: '2026-07-27',
      seed: 'actual-history',
    } satisfies PairingRequest;
    const result = generatePairings({
      ...base,
      history: [
        {
          memberAId: 'M1',
          memberBId: 'F1',
          occurredAt: '2026-07-20',
          actual: true,
        },
        {
          memberAId: 'M1',
          memberBId: 'F2',
          occurredAt: '2026-07-20',
          actual: false,
        },
      ],
      weights: {
        ...DEFAULT_PAIRING_WEIGHTS,
        recency: 0,
      },
    });

    expect(result.rounds[0].pairs).toContainEqual(
      expect.objectContaining({ memberAId: 'M1', memberBId: 'F2' }),
    );
  });

  it('is deterministic for the same seed regardless of member input order', () => {
    const members = [
      member('M1', 'M'),
      member('M2', 'M'),
      member('M3', 'M'),
      member('F1', 'F'),
      member('F2', 'F'),
      member('F3', 'F'),
    ];
    const first = generatedPairs({
      members,
      rounds: 2,
      seed: 'stable',
      variant: 0,
    });
    const second = generatedPairs({
      members: [...members].reverse(),
      rounds: 2,
      seed: 'stable',
      variant: 0,
    });

    expect(second).toEqual(first);
  });

  it('supports deterministic alternate seed variants', () => {
    const members = [
      member('M1', 'M'),
      member('M2', 'M'),
      member('M3', 'M'),
      member('M4', 'M'),
      member('F1', 'F'),
      member('F2', 'F'),
      member('F3', 'F'),
      member('F4', 'F'),
    ];
    const variants = Array.from({ length: 8 }, (_, variant) =>
      JSON.stringify(
        generatedPairs({
          members,
          seed: 'variants',
          variant,
        }),
      ),
    );

    expect(new Set(variants).size).toBeGreaterThan(1);
    expect(
      generatedPairs({ members, seed: 'variants', variant: 3 }),
    ).toEqual(
      generatedPairs({ members, seed: 'variants', variant: 3 }),
    );
  });

  it('does not repeat a pair within a multi-round event', () => {
    const result = generatePairings({
      members: [
        member('M1', 'M'),
        member('M2', 'M'),
        member('M3', 'M'),
        member('F1', 'F'),
        member('F2', 'F'),
        member('F3', 'F'),
      ],
      compatibleRolePairs: rolePairs,
      rounds: 3,
      seed: 'rounds',
    });
    const keys = result.rounds.flatMap((round) =>
      round.pairs.map((pair) => [pair.memberAId, pair.memberBId].sort().join(':')),
    );

    expect(keys).toHaveLength(9);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.rounds.every((round) => round.complete)).toBe(true);
  });

  it('reuses the only compatible pair in a later round with an explicit warning', () => {
    const result = generatePairings({
      members: [member('M1', 'M'), member('F1', 'F')],
      compatibleRolePairs: rolePairs,
      rounds: 2,
      seed: 'exhausted',
    });

    expect(result.rounds[0].pairs).toHaveLength(1);
    expect(result.rounds[1].pairs).toEqual([
      expect.objectContaining({
        memberAId: 'M1',
        memberBId: 'F1',
      }),
    ]);
    expect(result.rounds[1].pairs[0].score).toBeGreaterThan(
      result.rounds[0].pairs[0].score,
    );
    expect(result.rounds[1].pairs[0].explanation).toContain(
      'už spolu tančili 1×',
    );
    expect(result.rounds[1].byes).toEqual([]);
    expect(
      result.warnings.filter(
        (warning) => warning.code === 'PAIR_REPEATED_IN_EVENT',
      ),
    ).toEqual([
      expect.objectContaining({
        round: 2,
        memberIds: ['M1', 'F1'],
      }),
    ]);
  });

  it('distinguishes a constraint bottleneck from a simple role imbalance', () => {
    const result = generatePairings({
      members: [
        member('M1', 'M'),
        member('M2', 'M'),
        member('F1', 'F'),
        member('F2', 'F'),
      ],
      compatibleRolePairs: rolePairs,
      preferences: [
        { memberAId: 'M1', memberBId: 'F2', kind: 'forbidden' },
        { memberAId: 'M2', memberBId: 'F2', kind: 'forbidden' },
      ],
      seed: 'bottleneck',
    });

    expect(result.rounds[0].pairs).toHaveLength(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CONSTRAINTS_PREVENT_COMPLETE_PAIRING',
        }),
        expect.objectContaining({ code: 'NO_ALLOWED_PARTNER' }),
      ]),
    );
  });

  it('rotates byes fairly across rounds when roles are imbalanced', () => {
    const result = generatePairings({
      members: [
        member('M1', 'M'),
        member('M2', 'M'),
        member('M3', 'M'),
        member('F1', 'F'),
        member('F2', 'F'),
      ],
      compatibleRolePairs: rolePairs,
      rounds: 3,
      seed: 'bye-rotation',
    });
    const maleByes = result.rounds.map((round) =>
      round.byes.find((bye) => bye.memberId.startsWith('M'))?.memberId,
    );

    expect(new Set(maleByes).size).toBe(3);
    expect(result.rounds.every((round) => round.pairs.length === 2)).toBe(true);
  });

  it('uses historical bye counts to protect members who have sat out more often', () => {
    const result = generatePairings({
      members: [
        member('M-few-byes', 'M', 'advanced', { byeCount: 0 }),
        member('M-many-byes', 'M', 'advanced', { byeCount: 4 }),
        member('F1', 'F'),
      ],
      compatibleRolePairs: rolePairs,
      seed: 'historical-byes',
    });

    expect(result.rounds[0].pairs[0]).toEqual(
      expect.objectContaining({ memberAId: 'M-many-byes' }),
    );
    expect(result.rounds[0].byes[0].memberId).toBe('M-few-byes');
  });

  it('ignores inactive and unavailable members', () => {
    const result = generatePairings({
      members: [
        member('M-active', 'M'),
        member('M-inactive', 'M', 'advanced', { active: false }),
        member('F-available', 'F'),
        member('F-away', 'F', 'advanced', { available: false }),
      ],
      compatibleRolePairs: rolePairs,
    });

    expect(result.eligibleMemberIds).toEqual(['F-available', 'M-active']);
    expect(result.rounds[0].pairs).toHaveLength(1);
  });

  it('handles roughly 60 members and multiple rounds comfortably', () => {
    const members = Array.from({ length: 30 }, (_, index) =>
      member(`M${String(index).padStart(2, '0')}`, 'M', index < 8 ? 'beginner' : 'experienced'),
    ).concat(
      Array.from({ length: 30 }, (_, index) =>
        member(`F${String(index).padStart(2, '0')}`, 'F', index < 8 ? 'beginner' : 'experienced'),
      ),
    );
    const startedAt = performance.now();
    const result = generatePairings({
      members,
      compatibleRolePairs: rolePairs,
      rounds: 5,
      seed: 'sixty-members',
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.rounds).toHaveLength(5);
    expect(result.rounds.every((round) => round.pairs.length === 30)).toBe(true);
    expect(elapsedMs).toBeLessThan(2_000);
  });
});
