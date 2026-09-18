import { describe, it, expect } from 'vitest';
import { initialRoster, playerById } from './data';
import {
  canSwap,
  eligible,
  optimizeLineup,
  startingProjection,
  swapPlayers,
  validRoster,
} from './model';

describe('lineup rules', () => {
  it('permits only RB, WR, and TE in the flex slot', () => {
    for (const id of ['barkley', 'chase', 'mcbride'])
      expect(eligible(playerById[id], 'FLEX')).toBe(true);
    for (const id of ['allen', 'aubrey', 'broncos'])
      expect(eligible(playerById[id], 'FLEX')).toBe(false);
  });
  it('validates both sides of a swap, including a starter going to flex', () => {
    expect(canSwap(initialRoster, 'slot-3', 'slot-6')).toBe(true);
    expect(canSwap(initialRoster, 'slot-1', 'slot-6')).toBe(false);
    expect(canSwap(initialRoster, 'slot-0', 'slot-11')).toBe(true);
    expect(canSwap(initialRoster, 'slot-0', 'slot-9')).toBe(false);
  });
  it('leaves incompatible, missing, and identical targets untouched', () => {
    expect(swapPlayers(initialRoster, 'slot-0', 'slot-1')).toBe(initialRoster);
    expect(swapPlayers(initialRoster, 'slot-0', 'outside')).toBe(initialRoster);
    expect(swapPlayers(initialRoster, 'slot-0', 'slot-0')).toBe(initialRoster);
  });
  it('swaps player assignments without moving slot identities or mutating the original', () => {
    const result = swapPlayers(initialRoster, 'slot-0', 'slot-11');
    expect(result[0]).toEqual({ id: 'slot-0', label: 'QB', playerId: 'herbert' });
    expect(result[11]).toEqual({ id: 'slot-11', label: 'BN', playerId: 'allen' });
    expect(initialRoster[0].playerId).toBe('allen');
    expect(validRoster(result)).toBe(true);
    expect(swapPlayers(result, 'slot-0', 'slot-11')).toEqual(initialRoster);
  });
  it('rejects malformed, duplicated, or illegally assigned persisted rosters', () => {
    expect(validRoster(null)).toBe(false);
    expect(validRoster(initialRoster.slice(1))).toBe(false);
    expect(
      validRoster(initialRoster.map((s, i) => (i === 1 ? { ...s, playerId: 'allen' } : s))),
    ).toBe(false);
    expect(
      validRoster(initialRoster.map((s, i) => (i === 0 ? { ...s, playerId: 'downs' } : s))),
    ).toBe(false);
    expect(validRoster(initialRoster.map((s, i) => (i === 0 ? { ...s, label: 'BN' } : s)))).toBe(
      false,
    );
    expect(validRoster(initialRoster)).toBe(true);
  });
});

describe('best lineup', () => {
  // The demo roster ships in its optimal arrangement, so every case here has to
  // break the lineup first or it asserts nothing.
  const starterIds = (roster: typeof initialRoster) =>
    roster
      .filter((s) => s.label !== 'BN')
      .map((s) => s.playerId)
      .sort();

  it('totals only the starting slots', () => {
    expect(startingProjection(initialRoster)).toBeCloseTo(151.9);
    expect(startingProjection(initialRoster.map((s) => ({ ...s, label: 'BN' as const })))).toBe(0);
  });
  it('returns the same roster when nothing can be improved', () => {
    expect(optimizeLineup(initialRoster)).toBe(initialRoster);
  });
  it('promotes a benched starter and demotes the player who took the slot', () => {
    const weakened = swapPlayers(initialRoster, 'slot-1', 'slot-14');
    expect(startingProjection(weakened)).toBeLessThan(startingProjection(initialRoster));
    expect(optimizeLineup(weakened)).toEqual(initialRoster);
  });
  it('gives flex the best player the fixed slots did not want', () => {
    // Cook is the strongest bench RB but Collins still outscores him, so flex
    // keeps Collins even though both are eligible.
    const weakened = swapPlayers(initialRoster, 'slot-6', 'slot-10');
    expect(weakened[6].playerId).toBe('cook');
    expect(optimizeLineup(weakened)[6].playerId).toBe('collins');
  });
  it('keeps untouched bench players in place and never mutates the input', () => {
    const weakened = swapPlayers(
      swapPlayers(initialRoster, 'slot-0', 'slot-11'),
      'slot-3',
      'slot-9',
    );
    const before = weakened.map((s) => ({ ...s }));
    const best = optimizeLineup(weakened);
    expect(weakened).toEqual(before);
    expect(validRoster(best)).toBe(true);
    expect(starterIds(best)).toEqual(starterIds(initialRoster));
    expect(startingProjection(best)).toBeCloseTo(startingProjection(initialRoster));
    // Cook was never promoted or demoted, so he keeps the slot he was in.
    expect(best[10].playerId).toBe('cook');
  });
  it('is idempotent', () => {
    const best = optimizeLineup(swapPlayers(initialRoster, 'slot-1', 'slot-14'));
    expect(optimizeLineup(best)).toBe(best);
  });
});
