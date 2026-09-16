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
