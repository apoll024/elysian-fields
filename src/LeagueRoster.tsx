import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  closestCenter,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { GripVertical, Check, X } from 'lucide-react';
import type { Player } from './LeagueApp';
import { demoProjection } from './demoLeague';

export function canExchange(first: Player, second: Player) {
  const fits = (player: Player, slot: Player['slot']) =>
    slot === 'BN' ||
    slot === 'IR' ||
    slot === player.position ||
    (slot === 'FLEX' && ['RB', 'WR', 'TE'].includes(player.position));
  return first.playerId !== second.playerId && fits(first, second.slot) && fits(second, first.slot);
}

const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  if (!['ArrowUp', 'ArrowDown'].includes(event.code)) return;
  event.preventDefault();
  const rects = [...context.droppableRects.entries()].sort((a, b) => a[1].top - b[1].top);
  if (!rects.length) return currentCoordinates;
  const current = rects.reduce(
    (best, item, index) =>
      Math.abs(item[1].top - currentCoordinates.y) <
      Math.abs(rects[best][1].top - currentCoordinates.y)
        ? index
        : best,
    0,
  );
  const next = rects[current + (event.code === 'ArrowDown' ? 1 : -1)];
  return next ? { x: currentCoordinates.x, y: next[1].top } : currentCoordinates;
};

function PlayerDetails({ player }: { player: Player }) {
  return (
    <>
      <span className="league-slot">{player.slot}</span>
      <span className="league-player">
        <span className="league-player-primary">
          <strong className="player-name" data-position={player.position}>
            {player.name}
          </strong>
          <span
            className="league-projected-points"
            aria-label={`${demoProjection(player).toFixed(1)} demo projected points`}
          >
            {demoProjection(player).toFixed(1)} <small>proj</small>
          </span>
        </span>
        <small>
          {player.nflTeam} · {player.position}
        </small>
      </span>
    </>
  );
}

function RosterRow({
  player,
  index,
  source,
  selected,
  busy,
  onSelect,
}: {
  player: Player;
  index: number;
  source: Player | null;
  selected: number | null;
  busy: boolean;
  onSelect: (index: number) => void;
}) {
  const drag = useDraggable({ id: player.playerId, disabled: busy });
  const drop = useDroppable({ id: index, disabled: busy });
  const eligible = source && canExchange(source, player);
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      className={`league-roster-slot ${selected === index ? 'selected' : ''} ${drag.isDragging ? 'dragging' : ''} ${source && source.playerId !== player.playerId ? (eligible ? 'eligible' : 'ineligible') : ''} ${drop.isOver && source ? (eligible ? 'drop-ready' : 'drop-blocked') : ''}`}
      data-slot-index={index}
    >
      <button
        className="league-player-row"
        onClick={() => onSelect(index)}
        disabled={busy}
        aria-pressed={selected === index}
        aria-label={`${selected === null ? 'Choose' : 'Swap with'} ${player.name}, ${player.slot}`}
      >
        <PlayerDetails player={player} />
        {source && eligible && (
          <Check size={16} className="league-drop-check" aria-label="Eligible slot" />
        )}
      </button>
      <button
        ref={drag.setActivatorNodeRef}
        {...drag.attributes}
        {...drag.listeners}
        className="league-drag-handle"
        disabled={busy}
        aria-label={`Drag ${player.name}`}
        onClick={() => onSelect(index)}
        title="Drag to swap, or tap to choose"
      >
        <GripVertical size={21} />
      </button>
    </div>
  );
}

export default function LeagueRoster({
  roster,
  selected,
  busy,
  onSelect,
  onSwap,
  onCancel,
}: {
  roster: Player[];
  selected: number | null;
  busy: boolean;
  onSelect: (index: number) => void;
  onSwap: (from: number, to: number) => void;
  onCancel: () => void;
}) {
  const [active, setActive] = useState<Player | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );
  const source = active ?? roster[selected ?? -1] ?? null;
  const draggedPlayer = (id: string | number) => roster.find((player) => player.playerId === id)!;
  const reducedMotion =
    document.documentElement.dataset.motion === 'off' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) =>
        args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)
      }
      autoScroll={{ threshold: { x: 0, y: 0.18 }, acceleration: 8 }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Press Space to pick up a player. Use Up and Down to choose a slot, then Space to drop. Escape cancels. You can also select two players to swap.',
        },
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up ${draggedPlayer(active.id).name}. Eligible slots are highlighted.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${roster[Number(over.id)].slot}: ${canExchange(draggedPlayer(active.id), roster[Number(over.id)]) ? 'eligible' : 'cannot swap'}`
              : 'Outside the roster.',
          onDragEnd: ({ active, over }) =>
            over && canExchange(draggedPlayer(active.id), roster[Number(over.id)])
              ? 'Saving lineup.'
              : 'Player returned to their slot.',
          onDragCancel: () => 'Move cancelled.',
        },
      }}
      onDragStart={({ active }) => {
        onCancel();
        setActive(draggedPlayer(active.id));
      }}
      onDragCancel={() => setActive(null)}
      onDragEnd={({ active, over }) => {
        setActive(null);
        if (over)
          onSwap(
            roster.findIndex((player) => player.playerId === active.id),
            Number(over.id),
          );
      }}
    >
      <div className="league-roster-help" role="status">
        <span>
          {busy
            ? 'Saving lineup…'
            : source
              ? `Move ${source.name} to a highlighted slot`
              : 'Drag the grip to move a player, or tap two players to swap.'}
        </span>
        {selected !== null && (
          <button onClick={onCancel} aria-label="Cancel move">
            <X size={16} /> Cancel
          </button>
        )}
      </div>
      {roster.map((player, index) => (
        <div key={player.playerId}>
          {(index === 0 ||
            (player.slot === 'BN' && roster[index - 1].slot !== 'BN') ||
            (player.slot === 'IR' && roster[index - 1].slot !== 'IR')) && (
            <div className="league-roster-group">
              {player.slot === 'BN'
                ? 'Bench'
                : player.slot === 'IR'
                  ? 'Injured reserve'
                  : 'Starters'}
            </div>
          )}
          <RosterRow
            player={player}
            index={index}
            source={source}
            selected={selected}
            busy={busy}
            onSelect={onSelect}
          />
        </div>
      ))}
      {createPortal(
        <DragOverlay
          dropAnimation={
            reducedMotion ? null : { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
          }
        >
          {active !== null && (
            <div className="league-drag-preview">
              <PlayerDetails player={active} />
              <GripVertical size={21} />
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
