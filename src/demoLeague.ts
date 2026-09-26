type ProjectedPlayer = { playerId: string; position: string; slot: string };
type Team = { id: string; teamName: string };

// Temporary, repeatable numbers for the prototype. Replace this function when
// licensed weekly projections and league scoring rules are available.
export function demoProjection(player: Pick<ProjectedPlayer, 'playerId' | 'position'>): number {
  const baseline: Record<string, number> = { QB: 18, RB: 12, WR: 11, TE: 8, K: 7, DEF: 7 };
  let hash = 0;
  for (const char of player.playerId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Math.round(((baseline[player.position] ?? 8) + (hash % 81) / 10 - 4) * 10) / 10;
}

export function lineupProjection(roster: ProjectedPlayer[]): number {
  return (
    Math.round(
      roster
        .filter((player) => player.slot !== 'BN' && player.slot !== 'IR')
        .reduce((total, player) => total + demoProjection(player), 0) * 10,
    ) / 10
  );
}

export function demoMatchups(teams: Team[], week: number): [Team, Team][] {
  if (teams.length < 2 || teams.length % 2 !== 0) return [];
  const ordered = [...teams].sort((a, b) => Number(a.id) - Number(b.id));
  const fixed = ordered[0];
  const rotating = ordered.slice(1);
  for (let round = 1; round < week; round++) rotating.unshift(rotating.pop()!);
  const field = [fixed, ...rotating];
  return Array.from({ length: field.length / 2 }, (_, index) => [
    field[index],
    field[field.length - 1 - index],
  ]);
}
