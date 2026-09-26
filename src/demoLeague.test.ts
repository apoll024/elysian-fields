import { describe, expect, it } from 'vitest';
import { demoMatchups, demoProjection, lineupProjection } from './demoLeague';

describe('demo league data', () => {
  it('pairs every team once per week and every opponent once across nine weeks', () => {
    const teams = Array.from({ length: 10 }, (_, index) => ({
      id: String(index + 1),
      teamName: `Team ${index + 1}`,
    }));
    const pairs = new Set<string>();
    for (let week = 1; week <= 9; week++) {
      const matchups = demoMatchups(teams, week);
      expect(matchups).toHaveLength(5);
      expect(new Set(matchups.flat().map((team) => team.id)).size).toBe(10);
      for (const [first, second] of matchups) {
        pairs.add([first.id, second.id].sort().join('-'));
      }
    }
    expect(pairs.size).toBe(45);
  });

  it('uses player points for starters and excludes bench and IR from team totals', () => {
    const starters = [
      { playerId: 'a', position: 'QB', slot: 'QB' },
      { playerId: 'b', position: 'RB', slot: 'RB' },
    ];
    const roster = [
      ...starters,
      { playerId: 'c', position: 'WR', slot: 'BN' },
      { playerId: 'd', position: 'TE', slot: 'IR' },
    ];
    expect(lineupProjection(roster)).toBeCloseTo(
      demoProjection(starters[0]) + demoProjection(starters[1]),
      1,
    );
  });
});
