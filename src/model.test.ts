import { describe, it, expect } from 'vitest';
import { initialRoster, playerById } from './data';
import { canSwap, eligible, swapPlayers, validRoster } from './model';

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
