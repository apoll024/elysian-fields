import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  CalendarClock,
  Crown,
  LogOut,
  Swords,
  Settings2,
  Shield,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import Entrance from './Entrance';
import { demoMatchups, demoProjection, lineupProjection } from './demoLeague';
import './league.css';

type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
type Slot = Position | 'FLEX' | 'BN' | 'IR';
type Player = {
  playerId: string;
  name: string;
  position: Position;
  nflTeam: string;
  slot: Slot;
};
type Account = {
  id: string;
  name: string;
  teamName: string;
  role: 'commissioner' | 'member';
  version: number;
  waiverPriority?: number;
};
type Team = { team: Account; roster: Player[] };
type Settings = {
  name: string;
  scoring: string;
  waivers: string;
  tradeDeadline: string;
  lineupLock: string;
};
type League = { teams: Account[]; settings: Settings };
type Claim = {
  id: number;
  playerId: string;
  playerName: string;
  position: Position;
  dropPlayerId: string;
  status: string;
  reason: string | null;
};
type AvailablePlayer = Omit<Player, 'slot'>;
type View = 'roster' | 'matchups' | 'league' | 'waivers' | 'appearance' | 'commissioner';
type Appearance = {
  theme: 'light' | 'dusk' | 'dark';
  accent: 'mint' | 'lavender' | 'amber';
  density: 'comfortable' | 'compact';
  motion: boolean;
};
const defaultAppearance: Appearance = {
  theme: 'light',
  accent: 'amber',
  density: 'comfortable',
  motion: true,
};
const navigation: { id: View; label: string; icon: typeof Shield }[] = [
  { id: 'roster', label: 'My team', icon: Shield },
  { id: 'matchups', label: 'Matchups', icon: Swords },
  { id: 'league', label: 'League', icon: Users },
  { id: 'waivers', label: 'Waivers', icon: CalendarClock },
  { id: 'appearance', label: 'Appearance', icon: SlidersHorizontal },
  { id: 'commissioner', label: 'Commissioner', icon: Settings2 },
];

function readAppearance(account: Account): Appearance {
  try {
    const saved = localStorage.getItem(`elysian-fields:appearance:${account.id}`);
    const legacy = localStorage.getItem(`elysian-fields:v1:${account.name}`);
    const raw = saved ? JSON.parse(saved) : legacy ? JSON.parse(legacy)?.settings : null;
    return {
      theme: ['light', 'dusk', 'dark'].includes(raw?.theme) ? raw.theme : defaultAppearance.theme,
      accent: ['mint', 'lavender', 'amber'].includes(raw?.accent)
        ? raw.accent
        : defaultAppearance.accent,
      density: raw?.density === 'compact' ? 'compact' : 'comfortable',
      motion: raw?.motion !== false,
    };
  } catch {
    return defaultAppearance;
  }
}

async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}

function fits(player: Player, slot: Slot) {
  return (
    slot === 'BN' ||
    slot === 'IR' ||
    slot === player.position ||
    (slot === 'FLEX' && ['RB', 'WR', 'TE'].includes(player.position))
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function LeagueApp() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [league, setLeague] = useState<League | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [view, setView] = useState<View>('roster');
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [teamError, setTeamError] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [available, setAvailable] = useState<AvailablePlayer[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [dropPlayerId, setDropPlayerId] = useState('');
  const [adminDropId, setAdminDropId] = useState('');
  const [adminAddId, setAdminAddId] = useState('');
  const [newPlayer, setNewPlayer] = useState({ name: '', position: 'RB' as Position, nflTeam: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance);
  const [matchupWeek, setMatchupWeek] = useState(2);

  function updateAppearance(next: Appearance) {
    setAppearance(next);
    if (!account) return;
    try {
      localStorage.setItem(`elysian-fields:appearance:${account.id}`, JSON.stringify(next));
    } catch {
      // Appearance remains usable when browser storage is unavailable.
    }
  }

  useEffect(() => {
    if (account) setAppearance(readAppearance(account));
  }, [account?.id]);
  useEffect(() => {
    document.documentElement.dataset.theme = appearance.theme;
    document.documentElement.dataset.accent = appearance.accent;
    document.documentElement.dataset.density = appearance.density;
    document.documentElement.dataset.motion = appearance.motion ? 'on' : 'off';
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    themeColor?.setAttribute('content', appearance.theme === 'light' ? '#f7f4ec' : '#0f1418');
  }, [appearance]);

  const loadLeague = useCallback(async () => {
    const next = await api<League>('/api/league');
    setLeague(next);
    setSettings(next.settings);
  }, []);
  const loadTeam = useCallback(async (id: string) => {
    setTeamError('');
    const next = await api<Team>('/api/teams/' + encodeURIComponent(id));
    setTeam(next);
    setSelectedPlayer(null);
  }, []);
  const loadWaivers = useCallback(async () => {
    const [pool, history] = await Promise.all([
      api<{ available: AvailablePlayer[] }>('/api/players'),
      api<{ claims: Claim[] }>('/api/waivers'),
    ]);
    setAvailable(pool.available);
    setClaims(history.claims);
  }, []);

  useEffect(() => {
    let alive = true;
    api<{ account: Account }>('/api/session')
      .then(({ account: next }) => {
        if (alive) setAccount(next);
      })
      .catch(() => {
        if (alive) setAccount(null);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!account) return;
    setSelectedTeam(account.id);
    void loadLeague().catch((cause: Error) => setError(cause.message));
  }, [account?.id, loadLeague]);
  useEffect(() => {
    if (!selectedTeam) return;
    setTeam(null);
    void loadTeam(selectedTeam).catch((cause: Error) => setTeamError(cause.message));
  }, [selectedTeam, loadTeam]);
  useEffect(() => {
    if (view !== 'waivers' || !account) return;
    void loadWaivers().catch((cause: Error) => setError(cause.message));
  }, [view, account?.id, loadWaivers]);
  useEffect(() => {
    if (view !== 'roster' || account?.role !== 'commissioner') return;
    void api<{ available: AvailablePlayer[] }>('/api/players')
      .then((result) => setAvailable(result.available))
      .catch((cause: Error) => setError(cause.message));
  }, [view, selectedTeam, account?.role]);

  async function login(username: string, password: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ account: Account }>('/api/login', 'POST', { username, password });
      setAccount(result.account);
      setNotice('');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api('/api/logout', 'POST', {});
      setAccount(null);
      setLeague(null);
      setTeam(null);
      setView('roster');
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveTeam(roster: Player[]) {
    if (!team) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await api<Team>('/api/teams/' + encodeURIComponent(team.team.id), 'PUT', {
        roster,
        version: team.team.version,
      });
      setTeam(next);
      setLeague(
        (old) =>
          old && {
            ...old,
            teams: old.teams.map((item) =>
              item.id === next.team.id ? { ...item, ...next.team } : item,
            ),
          },
      );
      setSelectedPlayer(null);
      setNotice('Team saved.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function selectRosterRow(index: number) {
    if (!team || busy) return;
    if (selectedPlayer === null) {
      setSelectedPlayer(index);
      setNotice('Choose a second roster slot to swap.');
      return;
    }
    if (selectedPlayer === index) {
      setSelectedPlayer(null);
      setNotice('');
      return;
    }
    const roster = [...team.roster];
    const first = roster[selectedPlayer];
    const second = roster[index];
    if (!fits(first, second.slot) || !fits(second, first.slot)) {
      setError('Those players cannot exchange positions.');
      setSelectedPlayer(null);
      return;
    }
    roster[selectedPlayer] = { ...second, slot: first.slot };
    roster[index] = { ...first, slot: second.slot };
    void saveTeam(roster);
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError('');
    try {
      const next = await api<{ settings: Settings }>('/api/league/settings', 'PUT', settings);
      setSettings(next.settings);
      setLeague((old) => old && { ...old, settings: next.settings });
      setNotice('League settings saved.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function claim(player: AvailablePlayer) {
    if (!dropPlayerId) {
      setError('Choose a player to drop first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/waivers', 'POST', { playerId: player.playerId, dropPlayerId });
      await loadWaivers();
      setNotice('Waiver claim submitted.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancelClaim(id: number) {
    setBusy(true);
    try {
      await api('/api/waivers/' + id, 'DELETE');
      await loadWaivers();
      setNotice('Claim cancelled.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addFreeAgent(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/players', 'POST', newPlayer);
      setNewPlayer({ name: '', position: 'RB', nflTeam: '' });
      await loadWaivers();
      setNotice('Free agent added.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function processClaims() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ results: { status: string }[] }>(
        '/api/waivers/process',
        'POST',
        {},
      );
      await Promise.all([loadWaivers(), loadLeague(), loadTeam(selectedTeam)]);
      setNotice(
        `Processed ${result.results.length} claims; ${result.results.filter((item) => item.status === 'success').length} succeeded.`,
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function replaceForCommissioner(event: FormEvent) {
    event.preventDefault();
    if (!team || !adminDropId || !adminAddId) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api<Team>(
        '/api/admin/teams/' + encodeURIComponent(team.team.id) + '/replace',
        'POST',
        { dropPlayerId: adminDropId, playerId: adminAddId, version: team.team.version },
      );
      setTeam(updated);
      setAdminDropId('');
      setAdminAddId('');
      const pool = await api<{ available: AvailablePlayer[] }>('/api/players');
      setAvailable(pool.available);
      setNotice('Team roster updated.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (account === undefined) return <div className="league-loading">Opening the gates…</div>;
  if (account === null) return <Entrance onEnter={login} error={error} busy={busy} />;
  const commissioner = account.role === 'commissioner';
  const ownTeam = selectedTeam === account.id;
  const selectedAccount = league?.teams.find((item) => item.id === selectedTeam);
  return (
    <div className="league-app">
      <aside className="league-sidebar">
        <div className="league-brand">
          <Crown size={27} />
          <span>
            elysian
            <br />
            fields.
          </span>
        </div>
        <p className="league-label">THE LEAGUE</p>
        <strong className="league-league-name">
          {league?.settings.name || 'Fantasy Football'}
        </strong>
        <nav aria-label="Main navigation">
          {navigation
            .filter((item) => commissioner || item.id !== 'commissioner')
            .map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={view === id ? 'current' : ''}
                onClick={() => {
                  if (id === 'roster' || id === 'waivers') setSelectedTeam(account.id);
                  setView(id);
                  setError('');
                  setNotice('');
                }}
              >
                <Icon size={18} /> {label}
              </button>
            ))}
        </nav>
        <div className="league-sidebar-bottom">
          <span className="league-avatar">{initials(account.name)}</span>
          <span>
            <strong>{account.name}</strong>
            <small>{commissioner ? 'Commissioner' : 'Team manager'}</small>
          </span>
          <button
            className="league-logout"
            aria-label="Sign out"
            onClick={() => void logout()}
            disabled={busy}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="league-main">
        <header className="league-topbar">
          <span>
            {league?.settings.name || 'League'} <ArrowRight size={13} />{' '}
            {view === 'roster'
              ? 'Team'
              : view === 'matchups'
                ? 'Matchups'
                : view === 'league'
                  ? 'League'
                  : view === 'waivers'
                    ? 'Waivers'
                    : view === 'appearance'
                      ? 'Appearance'
                      : 'Commissioner'}
          </span>
          <span>
            {account.name}
            {commissioner && <Crown size={14} aria-label="Commissioner" />}
            <button
              className="league-top-logout"
              aria-label="Sign out"
              onClick={() => void logout()}
              disabled={busy}
            >
              <LogOut size={17} />
            </button>
          </span>
        </header>
        <main className="league-content">
          {error && (
            <div className="league-message error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="league-message" role="status">
              {notice}
            </div>
          )}
          {view === 'roster' && (
            <>
              <div className="league-heading">
                <div>
                  <span className="league-eyebrow">WHERE LEGENDS PLAY</span>
                  <h1>
                    {team?.team.teamName ||
                      selectedAccount?.teamName ||
                      (ownTeam ? account.teamName : 'Team')}
                  </h1>
                </div>
                {commissioner && (
                  <select
                    aria-label="Edit team"
                    value={selectedTeam}
                    onChange={(event) => setSelectedTeam(event.target.value)}
                  >
                    {league?.teams.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.teamName} · {item.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <section
                className="league-card league-roster"
                aria-label={ownTeam ? 'Your roster' : 'Selected team roster'}
              >
                <div className="league-card-title">
                  <h2>{ownTeam ? 'Your lineup' : selectedAccount?.teamName}</h2>
                  <span>
                    {team
                      ? `${lineupProjection(team.roster).toFixed(1)} demo projected pts`
                      : 'Loading'}
                  </span>
                </div>
                <p className="league-demo-note">
                  Demo projections for layout preview. No live stats feed is connected.
                </p>
                {team?.roster.map((player, index) => (
                  <button
                    key={player.playerId}
                    className={`league-player-row ${selectedPlayer === index ? 'selected' : ''}`}
                    onClick={() => selectRosterRow(index)}
                    disabled={busy}
                    aria-label={`${selectedPlayer === null ? 'Choose' : 'Swap with'} ${player.name}, ${player.slot}`}
                  >
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
                    <ArrowLeftRight size={16} />
                  </button>
                ))}
                {!team &&
                  (teamError ? (
                    <div className="league-empty" role="alert">
                      <p>Couldn’t load this roster: {teamError}</p>
                      <button
                        onClick={() =>
                          void loadTeam(selectedTeam).catch((cause: Error) =>
                            setTeamError(cause.message),
                          )
                        }
                      >
                        Try again
                      </button>
                    </div>
                  ) : (
                    <p className="league-empty">Loading roster…</p>
                  ))}
              </section>
              {commissioner && team && (
                <form
                  className="league-card league-admin-replace"
                  onSubmit={replaceForCommissioner}
                >
                  <div className="league-card-title">
                    <h2>Commissioner roster edit</h2>
                  </div>
                  <div className="league-form-grid">
                    <label>
                      REPLACE PLAYER
                      <select
                        value={adminDropId}
                        required
                        onChange={(event) => setAdminDropId(event.target.value)}
                      >
                        <option value="">Choose roster player</option>
                        {team.roster.map((player) => (
                          <option key={player.playerId} value={player.playerId}>
                            {player.name} · {player.slot}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      WITH FREE AGENT
                      <select
                        value={adminAddId}
                        required
                        onChange={(event) => setAdminAddId(event.target.value)}
                      >
                        <option value="">Choose free agent</option>
                        {available.map((player) => (
                          <option key={player.playerId} value={player.playerId}>
                            {player.name} · {player.position}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" disabled={busy || !adminDropId || !adminAddId}>
                      Replace player
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          {view === 'matchups' && (
            <>
              <div className="league-heading">
                <div>
                  <span className="league-eyebrow">LEAGUE SCHEDULE</span>
                  <h1>Matchups</h1>
                  <p>
                    Preview schedule · opponents are placeholders until the league season is set.
                  </p>
                </div>
                <label className="league-week-select">
                  Week
                  <select
                    value={matchupWeek}
                    onChange={(event) => setMatchupWeek(Number(event.target.value))}
                  >
                    {Array.from({ length: 9 }, (_, index) => index + 1).map((week) => (
                      <option key={week} value={week}>
                        Week {week}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <section className="league-card league-matchups" aria-label="Demo matchups">
                <div className="league-card-title">
                  <h2>Week {matchupWeek} pairings</h2>
                  <span>Demo schedule</span>
                </div>
                {demoMatchups(league?.teams ?? [], matchupWeek).map(([home, away]) => (
                  <div
                    className={`league-matchup-row ${home.id === account.id || away.id === account.id ? 'mine' : ''}`}
                    key={`${home.id}-${away.id}`}
                  >
                    <div>
                      <span className="league-avatar">{initials(home.teamName)}</span>
                      <strong>{home.teamName}</strong>
                    </div>
                    <span className="league-versus">VS</span>
                    <div>
                      <span className="league-avatar">{initials(away.teamName)}</span>
                      <strong>{away.teamName}</strong>
                    </div>
                    {(home.id === account.id || away.id === account.id) && (
                      <span className="league-your-game">Your matchup</span>
                    )}
                  </div>
                ))}
                {!league && <p className="league-empty">Loading matchups…</p>}
              </section>
            </>
          )}
          {view === 'league' && (
            <>
              <div className="league-heading">
                <div>
                  <span className="league-eyebrow">THE OLYMPUS TABLE</span>
                  <h1>{league?.settings.name || 'The league'}</h1>
                  <p>Ten teams. One field.</p>
                </div>
              </div>
              <div className="league-card league-standings">
                <div className="league-card-title">
                  <h2>Teams</h2>
                  <span>{league?.teams.length ?? 0} managers</span>
                </div>
                {league?.teams.map((item) => (
                  <div className="league-team-row" key={item.id}>
                    <span className="league-avatar">{initials(item.teamName)}</span>
                    <div>
                      <strong>{item.teamName}</strong>
                      <small>
                        {item.name}
                        {item.role === 'commissioner' ? ' · Commissioner' : ''}
                      </small>
                    </div>
                    <span>Waiver #{item.waiverPriority}</span>
                    {(commissioner || item.id === account.id) && (
                      <button
                        onClick={() => {
                          setSelectedTeam(item.id);
                          setView('roster');
                        }}
                      >
                        View team <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {view === 'waivers' && (
            <>
              <div className="league-heading">
                <div>
                  <span className="league-eyebrow">THE WAIVER WIRE</span>
                  <h1>Find your next player.</h1>
                  <p>
                    Claims process daily at 3:00 a.m. Pacific in rolling priority order. Successful
                    claims move to the end of the order.
                  </p>
                </div>
              </div>
              <div className="league-card league-waiver-controls">
                <label htmlFor="drop-player">PLAYER TO DROP</label>
                <select
                  id="drop-player"
                  value={dropPlayerId}
                  onChange={(event) => setDropPlayerId(event.target.value)}
                >
                  <option value="">Choose a player</option>
                  {league &&
                    team &&
                    (ownTeam ? team.roster : []).map((player) => (
                      <option key={player.playerId} value={player.playerId}>
                        {player.name} · {player.slot}
                      </option>
                    ))}
                </select>
                <small>
                  Your waiver priority: #
                  {league?.teams.find((item) => item.id === account.id)?.waiverPriority ?? '…'}
                </small>
              </div>
              <div className="league-card">
                <div className="league-card-title">
                  <h2>Available players</h2>
                  <span>{available.length}</span>
                </div>
                {available.map((player) => (
                  <div className="league-team-row" key={player.playerId}>
                    <span className="league-slot">{player.position}</span>
                    <div>
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
                    </div>
                    <button onClick={() => void claim(player)} disabled={busy || !dropPlayerId}>
                      Claim <ArrowRight size={14} />
                    </button>
                  </div>
                ))}
                {available.length === 0 && (
                  <p className="league-empty">
                    No free agents are listed yet. The commissioner can add players from the waiver
                    controls.
                  </p>
                )}
              </div>
              <div className="league-card">
                <div className="league-card-title">
                  <h2>Your claims</h2>
                  <span>{claims.length}</span>
                </div>
                {claims.map((claim) => (
                  <div className="league-team-row" key={claim.id}>
                    <span className="league-slot">{claim.position}</span>
                    <div>
                      <strong>{claim.playerName}</strong>
                      <small>
                        {claim.status}
                        {claim.reason ? ' · ' + claim.reason : ''}
                      </small>
                    </div>
                    {claim.status === 'pending' && (
                      <button onClick={() => void cancelClaim(claim.id)} disabled={busy}>
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
                {claims.length === 0 && <p className="league-empty">No claims submitted.</p>}
              </div>
              {commissioner && (
                <div className="league-card league-commissioner-tools">
                  <div className="league-card-title">
                    <h2>Commissioner waiver controls</h2>
                  </div>
                  <form onSubmit={addFreeAgent} className="league-form-grid">
                    <label>
                      PLAYER NAME
                      <input
                        value={newPlayer.name}
                        required
                        maxLength={70}
                        onChange={(event) =>
                          setNewPlayer({ ...newPlayer, name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      POSITION
                      <select
                        value={newPlayer.position}
                        onChange={(event) =>
                          setNewPlayer({ ...newPlayer, position: event.target.value as Position })
                        }
                      >
                        {(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const).map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      NFL TEAM
                      <input
                        value={newPlayer.nflTeam}
                        required
                        maxLength={3}
                        onChange={(event) =>
                          setNewPlayer({ ...newPlayer, nflTeam: event.target.value })
                        }
                      />
                    </label>
                    <button type="submit" disabled={busy}>
                      Add free agent
                    </button>
                  </form>
                  <button onClick={() => void processClaims()} disabled={busy}>
                    Process pending claims now
                  </button>
                </div>
              )}
            </>
          )}
          {view === 'appearance' && (
            <>
              <div className="league-heading">
                <div>
                  <span className="league-eyebrow">MAKE IT YOURS</span>
                  <h1>Appearance.</h1>
                </div>
              </div>
              <section className="league-card league-appearance" aria-label="Appearance settings">
                <fieldset>
                  <legend>Theme</legend>
                  <div className="league-choice-grid">
                    {(['light', 'dusk', 'dark'] as const).map((theme) => (
                      <button
                        key={theme}
                        type="button"
                        className={appearance.theme === theme ? 'chosen' : ''}
                        aria-pressed={appearance.theme === theme}
                        onClick={() => updateAppearance({ ...appearance, theme })}
                      >
                        <span className={`league-theme-preview ${theme}`} aria-hidden="true" />
                        {theme === 'light'
                          ? 'Marble day'
                          : theme === 'dusk'
                            ? 'Oracle dusk'
                            : 'Elysian night'}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Accent</legend>
                  <div className="league-choice-grid">
                    {(['mint', 'lavender', 'amber'] as const).map((accent) => (
                      <button
                        key={accent}
                        type="button"
                        className={appearance.accent === accent ? 'chosen' : ''}
                        aria-pressed={appearance.accent === accent}
                        onClick={() => updateAppearance({ ...appearance, accent })}
                      >
                        <span className={`league-accent-swatch ${accent}`} aria-hidden="true" />
                        {accent === 'mint' ? 'Laurel' : accent === 'lavender' ? 'Oracle' : 'Bronze'}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Layout</legend>
                  <div className="league-choice-grid two">
                    {(['comfortable', 'compact'] as const).map((density) => (
                      <button
                        key={density}
                        type="button"
                        className={appearance.density === density ? 'chosen' : ''}
                        aria-pressed={appearance.density === density}
                        onClick={() => updateAppearance({ ...appearance, density })}
                      >
                        {density === 'comfortable' ? 'Comfortable rows' : 'Compact rows'}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Motion</legend>
                  <button
                    type="button"
                    className={`league-motion-choice ${appearance.motion ? 'chosen' : ''}`}
                    aria-pressed={appearance.motion}
                    onClick={() => updateAppearance({ ...appearance, motion: !appearance.motion })}
                  >
                    Subtle animations {appearance.motion ? 'on' : 'off'}
                  </button>
                </fieldset>
                <p>Saved on this device for {account.name}.</p>
              </section>
            </>
          )}
          {view === 'commissioner' && commissioner && settings && (
            <>
              <div className="league-heading">
                <div>
                  <span className="league-eyebrow">COMMISSIONER'S CHAMBER</span>
                  <h1>League settings.</h1>
                  <p>Only Ryan can change these settings and edit every team.</p>
                </div>
              </div>
              <form className="league-card league-settings" onSubmit={saveSettings}>
                <label>
                  LEAGUE NAME
                  <input
                    value={settings.name}
                    maxLength={80}
                    onChange={(event) => setSettings({ ...settings, name: event.target.value })}
                  />
                </label>
                <label>
                  SCORING
                  <select
                    value={settings.scoring}
                    onChange={(event) => setSettings({ ...settings, scoring: event.target.value })}
                  >
                    <option>Full PPR</option>
                    <option>Half PPR</option>
                    <option>Standard</option>
                  </select>
                </label>
                <label>
                  WAIVERS
                  <input value={settings.waivers} readOnly aria-describedby="waiver-rule-note" />
                </label>
                <p id="waiver-rule-note" className="league-rule-note">
                  Claims process automatically at 3:00 a.m. Pacific using rolling priority.
                </p>
                <label>
                  TRADE DEADLINE
                  <input
                    value={settings.tradeDeadline}
                    maxLength={80}
                    onChange={(event) =>
                      setSettings({ ...settings, tradeDeadline: event.target.value })
                    }
                  />
                </label>
                <label>
                  LINEUP LOCK
                  <input
                    value={settings.lineupLock}
                    maxLength={80}
                    onChange={(event) =>
                      setSettings({ ...settings, lineupLock: event.target.value })
                    }
                  />
                </label>
                <button type="submit" disabled={busy}>
                  Save league settings
                </button>
              </form>
              <div className="league-card">
                <div className="league-card-title">
                  <h2>Edit a team</h2>
                </div>
                {league?.teams.map((item) => (
                  <div className="league-team-row" key={item.id}>
                    <span className="league-avatar">{initials(item.teamName)}</span>
                    <div>
                      <strong>{item.teamName}</strong>
                      <small>{item.name}</small>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedTeam(item.id);
                        setView('roster');
                      }}
                    >
                      Edit <ArrowRight size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
