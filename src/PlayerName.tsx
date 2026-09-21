import type { Player } from './data';

/** Color follows the player's actual position, including on the bench or in FLEX. */
export default function PlayerName({ player }: { player: Pick<Player, 'name' | 'position'> }) {
  return (
    <span className="player-name" data-position={player.position}>
      {player.name}
    </span>
  );
}
