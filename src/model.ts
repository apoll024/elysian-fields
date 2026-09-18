import { initialRoster, playerById, type RosterSlot, type Slot, type Player } from './data';
export function eligible(player: Player, slot: Slot) {
  return (
    slot === 'BN' ||
    slot === player.position ||
    (slot === 'FLEX' && ['RB', 'WR', 'TE'].includes(player.position))
  );
}
export function canSwap(roster: RosterSlot[], from: string, to: string) {
  const a = roster.find((s) => s.id === from),
    b = roster.find((s) => s.id === to);
  return (
    !!a &&
    !!b &&
    a.id !== b.id &&
    eligible(playerById[a.playerId], b.label) &&
    eligible(playerById[b.playerId], a.label)
  );
}
export function swapPlayers(roster: RosterSlot[], from: string, to: string): RosterSlot[] {
  if (!canSwap(roster, from, to)) return roster;
  const a = roster.find((s) => s.id === from)!,
    b = roster.find((s) => s.id === to)!;
  return roster.map((s) =>
    s.id === from
      ? { ...s, playerId: b.playerId }
      : s.id === to
        ? { ...s, playerId: a.playerId }
        : s,
  );
}
export function startingProjection(roster: RosterSlot[]) {
  return roster.reduce(
    (total, slot) => (slot.label === 'BN' ? total : total + playerById[slot.playerId].projection),
    0,
  );
}
export function optimizeLineup(roster: RosterSlot[]): RosterSlot[] {
  const order = new Map(roster.map((slot, i) => [slot.playerId, i]));
  // Highest projection first. Ties fall back to the current slot order so a
  // lineup that is already optimal keeps every player exactly where it is.
  const ranked = roster
    .map((slot) => slot.playerId)
    .sort(
      (a, b) =>
        playerById[b].projection - playerById[a].projection || order.get(a)! - order.get(b)!,
    );
  const used = new Set<string>();
  const claim = (label: Slot) => {
    const id = ranked.find((c) => !used.has(c) && eligible(playerById[c], label));
    if (id) used.add(id);
    return id;
  };
  const starters = new Map<string, string>();
  // Single-position slots go first because they never compete with each other,
  // so filling each with its own best player cannot cost more than it gains.
  // FLEX then takes the best player none of them wanted, which is the most any
  // legal lineup can score there.
  for (const slot of roster)
    if (slot.label !== 'BN' && slot.label !== 'FLEX') {
      const id = claim(slot.label);
      if (id) starters.set(slot.id, id);
    }
  for (const slot of roster)
    if (slot.label === 'FLEX') {
      const id = claim('FLEX');
      if (id) starters.set(slot.id, id);
    }
  // Bench players who were not promoted keep their own spot; whoever leaves the
  // starting lineup fills the bench slots that just opened up. Those two counts
  // always match, so no player is dropped or duplicated.
  const demoted = roster
    .filter((slot) => slot.label !== 'BN' && !used.has(slot.playerId))
    .map((slot) => slot.playerId);
  let next = 0;
  const lineup = roster.map((slot) => {
    const id =
      slot.label === 'BN'
        ? used.has(slot.playerId)
          ? demoted[next++]
          : slot.playerId
        : starters.get(slot.id);
    return id === undefined || id === slot.playerId ? slot : { ...slot, playerId: id };
  });
  // Players in equivalent starting slots may have been deliberately reordered.
  // A different arrangement is not an improvement when the projected total is
  // unchanged, so preserve it and avoid a misleading +0.0 activity entry.
  if (startingProjection(lineup) <= startingProjection(roster) + 1e-9) return roster;
  // Same convention as swapPlayers: an unchanged lineup returns the input, so
  // callers can treat identity as "there is nothing to improve".
  return lineup.some((slot, i) => slot.playerId !== roster[i].playerId) ? lineup : roster;
}
export function validRoster(value: unknown): value is RosterSlot[] {
  if (!Array.isArray(value) || value.length !== initialRoster.length) return false;
  const ids = new Set<string>();
  return value.every((s, i) => {
    if (
      !s ||
      s.id !== initialRoster[i].id ||
      s.label !== initialRoster[i].label ||
      !playerById[s.playerId] ||
      ids.has(s.playerId)
    )
      return false;
    ids.add(s.playerId);
    return eligible(playerById[s.playerId], s.label);
  });
}
export type Settings = {
  theme: 'dark' | 'dusk' | 'light';
  accent: 'mint' | 'lavender' | 'amber';
  density: 'comfortable' | 'compact';
  sound: boolean;
  motion: boolean;
  insights: boolean;
  teamName: string;
};
export const defaultSettings: Settings = {
  theme: 'dark',
  accent: 'mint',
  density: 'comfortable',
  sound: false,
  motion: true,
  insights: true,
  teamName: 'Sunday Scaries',
};
export interface Activity {
  id: string;
  text: string;
  time: string;
}
export interface ProfileState {
  roster: RosterSlot[];
  settings: Settings;
  watchlist: string[];
  activity: Activity[];
}
export function freshState(): ProfileState {
  return {
    roster: initialRoster.map((s) => ({ ...s })),
    settings: { ...defaultSettings },
    watchlist: [],
    activity: [],
  };
}
export function loadProfile(profile: string): ProfileState {
  const fallback = freshState();
  try {
    const raw = JSON.parse(
      localStorage.getItem(`elysian-fields:v1:${profile}`) ||
        localStorage.getItem(`sunday:v1:${profile}`) ||
        'null',
    );
    if (!raw || !validRoster(raw.roster)) return fallback;
    const s = raw.settings || {};
    return {
      roster: raw.roster,
      settings: {
        theme: ['dark', 'dusk', 'light'].includes(s.theme) ? s.theme : 'dark',
        accent: ['mint', 'lavender', 'amber'].includes(s.accent) ? s.accent : 'mint',
        density: s.density === 'compact' ? 'compact' : 'comfortable',
        sound: s.sound === true,
        motion: s.motion !== false,
        insights: s.insights !== false,
        teamName:
          typeof s.teamName === 'string' && s.teamName.trim()
            ? s.teamName.slice(0, 32)
            : defaultSettings.teamName,
      },
      watchlist: Array.isArray(raw.watchlist)
        ? raw.watchlist.filter((id: unknown) => typeof id === 'string' && playerById[id])
        : [],
      activity: Array.isArray(raw.activity)
        ? raw.activity
            .filter(
              (a: Activity) =>
                a &&
                typeof a.id === 'string' &&
                typeof a.text === 'string' &&
                typeof a.time === 'string',
            )
            .slice(0, 30)
        : [],
    };
  } catch {
    return fallback;
  }
}
let audioContext: AudioContext | undefined;
export function playSnap(enabled: boolean) {
  if (!enabled) return;
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume().catch(() => {});
    const ctx = audioContext;
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(640, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(360, ctx.currentTime + 0.075);
    gain.gain.setValueAtTime(0.045, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.1);
  } catch {
    /* Audio is optional and must never block a roster change. */
  }
}
