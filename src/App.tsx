import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Activity as ActivityIcon,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  GripVertical,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  MoreHorizontal,
  Search,
  Settings2,
  Shield,
  SlidersHorizontal,
  Star,
  Sun,
  Swords,
  TrendingUp,
  Trophy,
  Undo2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  allPlayers,
  freeAgents,
  playerById,
  standings,
  type Player,
  type RosterSlot,
} from './data';
import {
  canSwap,
  loadProfile,
  playSnap,
  swapPlayers,
  type ProfileState,
  type Settings,
} from './model';

type Page = 'team' | 'matchup' | 'players' | 'league' | 'activity';
const navigation: { id: Page; label: string; icon: typeof Users }[] = [
  { id: 'team', label: 'My team', icon: LayoutDashboard },
  { id: 'matchup', label: 'Matchup', icon: Swords },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'league', label: 'League', icon: Trophy },
  { id: 'activity', label: 'Activity', icon: ActivityIcon },
];
const fmt = (n: number) => n.toFixed(1);
const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('');
function Avatar({ player, small = false }: { player: Player; small?: boolean }) {
  return (
    <span
      className={`player-avatar ${small ? 'small' : ''}`}
      style={{ '--player-color': player.color } as CSSProperties}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M15 7 7 12 2 23l9 5 3-5v21h20V23l3 5 9-5-5-11-8-5-9 5Z" fill="currentColor" />
        <path d="m17 7 7 5 7-5" fill="none" stroke="var(--surface)" strokeWidth="3" />
      </svg>
      <b>{player.number}</b>
    </span>
  );
}
function TeamBadge({ gold = false, small = false }: { gold?: boolean; small?: boolean }) {
  return (
    <span className={`team-badge ${gold ? 'gold' : ''} ${small ? 'small' : ''}`}>
      {gold ? (
        <Zap size={small ? 20 : 29} fill="currentColor" />
      ) : (
        <Sun size={small ? 22 : 31} strokeWidth={1.8} />
      )}
    </span>
  );
}
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description: string;
}) {
  return (
    <div className="toggle-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button
        className={`toggle ${checked ? 'on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
      >
        <span />
      </button>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      className={`modal ${wide ? 'wide' : ''}`}
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <div>
          <h2 id="modal-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function PlayerRow({
  slot,
  roster,
  moving,
  active,
  selected,
  flash,
  onMove,
  onDetails,
  onTarget,
}: {
  slot: RosterSlot;
  roster: RosterSlot[];
  moving: string | null;
  active: string | null;
  selected: string | null;
  flash: string[];
  onMove: (id: string) => void;
  onDetails: (p: Player) => void;
  onTarget: (id: string) => void;
}) {
  const p = playerById[slot.playerId],
    valid = !!moving && canSwap(roster, moving, slot.id);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, isOver } =
    useSortable({
      id: slot.id,
      disabled: { droppable: !!active && !canSwap(roster, active, slot.id) && active !== slot.id },
    });
  return (
    <div
      ref={setNodeRef}
      data-testid={slot.id}
      className={`roster-row ${isDragging ? 'dragging' : ''} ${valid ? 'valid-target' : ''} ${isOver && valid ? 'over' : ''} ${selected === slot.id ? 'selected' : ''} ${flash.includes(slot.id) ? 'snapped' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`Move ${p.name}`}
      >
        <GripVertical size={16} />
      </button>
      <span className={`position position-${slot.label.toLowerCase()}`}>{slot.label}</span>
      <button
        className="player-identity"
        onClick={() => (selected && valid ? onTarget(slot.id) : onDetails(p))}
      >
        <Avatar player={p} />
        <span>
          <strong>
            {p.name}
            {p.note && (
              <i className="injury" title={p.note}>
                Q
              </i>
            )}
          </strong>
          <small>
            {p.team}
            <span>·</span>
            {p.position}
          </small>
        </span>
      </button>
      <div className="opponent">
        <strong>{p.opponent}</strong>
        <small>{p.time}</small>
      </div>
      <div className="projection">
        {fmt(p.projection)}
        <span className="projection-bar">
          <i style={{ width: `${(p.projection / 32) * 100}%` }} />
        </span>
      </div>
      <button
        className={`row-action ${selected && valid ? 'target-action' : ''}`}
        onClick={() => (selected && valid ? onTarget(slot.id) : onMove(slot.id))}
        aria-label={selected && valid ? `Swap with ${p.name}` : `Choose position for ${p.name}`}
        title={selected && valid ? 'Swap here' : 'Move player'}
      >
        {selected && valid ? <Check size={17} /> : <ArrowDownUp size={15} />}
      </button>
    </div>
  );
}
export default function App() {
  const [profile, setProfile] = useState(() => {
    try {
      return localStorage.getItem('sunday:profile') === 'guest' ? 'guest' : 'joel';
    } catch {
      return 'joel';
    }
  });
  function changeProfile(next: string) {
    try {
      localStorage.setItem('sunday:profile', next);
    } catch {
      /* Workspace reports storage errors. */
    }
    setProfile(next);
  }
  return <Workspace key={profile} profile={profile} changeProfile={changeProfile} />;
}
function Workspace({
  profile,
  changeProfile,
}: {
  profile: string;
  changeProfile: (p: string) => void;
}) {
  const [state, setState] = useState<ProfileState>(() => loadProfile(profile));
  const { roster, settings, watchlist, activity } = state;
  const [page, setPage] = useState<Page>('team'),
    [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState<'settings' | 'profile' | 'help' | null>(null),
    [detail, setDetail] = useState<Player | null>(null);
  const [active, setActive] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [flash, setFlash] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'starters' | 'bench'>('all'),
    [query, setQuery] = useState(''),
    [position, setPosition] = useState('ALL'),
    [pool, setPool] = useState<'available' | 'all' | 'watchlist'>('available');
  const [history, setHistory] = useState<RosterSlot[][]>([]),
    [toast, setToast] = useState(''),
    [saved, setSaved] = useState(true);
  const [smallScreen, setSmallScreen] = useState(
    () => window.matchMedia('(max-width: 650px)').matches,
  );
  useEffect(() => {
    const q = window.matchMedia('(max-width: 650px)');
    const listener = () => setSmallScreen(q.matches);
    q.addEventListener('change', listener);
    return () => q.removeEventListener('change', listener);
  }, []);
  const [reduceMotion, setReduceMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const moving = active || selected,
    projection = roster
      .filter((s) => s.label !== 'BN')
      .reduce((n, s) => n + playerById[s.playerId].projection, 0);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = () => setReduceMotion(q.matches);
    q.addEventListener('change', listener);
    return () => q.removeEventListener('change', listener);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(`sunday:v1:${profile}`, JSON.stringify(state));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [state, profile]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent;
    document.documentElement.dataset.density = settings.density;
    document.documentElement.dataset.motion = settings.motion && !reduceMotion ? 'on' : 'off';
  }, [settings, reduceMotion]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!flash.length) return;
    const timer = setTimeout(() => setFlash([]), 650);
    return () => clearTimeout(timer);
  }, [flash]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        setMobileNav(false);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setState((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));
  function navigate(next: Page) {
    setPage(next);
    setMobileNav(false);
    setSelected(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function addActivity(text: string) {
    return { id: crypto.randomUUID(), text, time: new Date().toISOString() };
  }
  function swap(from: string, to: string) {
    if (!canSwap(roster, from, to)) {
      setSelected(null);
      return;
    }
    const a = roster.find((s) => s.id === from)!,
      b = roster.find((s) => s.id === to)!;
    const text = `Swapped ${playerById[a.playerId].name} and ${playerById[b.playerId].name}`;
    setHistory((h) => [...h.slice(-19), roster.map((s) => ({ ...s }))]);
    setState((s) => ({
      ...s,
      roster: swapPlayers(s.roster, from, to),
      activity: [addActivity(text), ...s.activity].slice(0, 30),
    }));
    setSelected(null);
    setFlash([from, to]);
    setToast(text);
    playSnap(settings.sound);
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setState((s) => ({
      ...s,
      roster: previous,
      activity: [addActivity('Undid the last lineup change'), ...s.activity].slice(0, 30),
    }));
    setHistory((h) => h.slice(0, -1));
    setToast('Lineup restored');
    playSnap(settings.sound);
  }
  function toggleWatch(p: Player) {
    const watched = watchlist.includes(p.id);
    setState((s) => ({
      ...s,
      watchlist: watched ? s.watchlist.filter((id) => id !== p.id) : [...s.watchlist, p.id],
    }));
    setToast(`${p.name} ${watched ? 'removed from' : 'added to'} watchlist`);
  }
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 170, tolerance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const collision: CollisionDetection = useCallback(
    (args) => {
      const containers = args.droppableContainers.filter(
        (c) => c.id === args.active.id || canSwap(roster, String(args.active.id), String(c.id)),
      );
      if (args.pointerCoordinates) {
        const { x, y } = args.pointerCoordinates;
        const near = containers.filter((c) => {
          const r = args.droppableRects.get(c.id);
          return (
            r && x >= r.left - 20 && x <= r.right + 20 && y >= r.top - 12 && y <= r.bottom + 12
          );
        });
        return closestCenter({ ...args, droppableContainers: near });
      }
      return closestCenter({ ...args, droppableContainers: containers });
    },
    [roster],
  );
  function dragEnd(e: DragEndEvent) {
    setActive(null);
    if (e.over) swap(String(e.active.id), String(e.over.id));
  }
  const filteredPlayers = (pool === 'available' ? freeAgents : allPlayers).filter(
    (p) =>
      (pool !== 'watchlist' || watchlist.includes(p.id)) &&
      (position === 'ALL' || p.position === position) &&
      `${p.name} ${p.team}`.toLowerCase().includes(query.toLowerCase()),
  );
  const currentPage = navigation.find((n) => n.id === page)!;
  const displayedRoster = roster.filter(
    (s) => filter === 'all' || (filter === 'bench' ? s.label === 'BN' : s.label !== 'BN'),
  );
  const activePlayer = active ? playerById[roster.find((s) => s.id === active)!.playerId] : null;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside inert={smallScreen && !mobileNav} className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('team');
          }}
        >
          <Sun size={30} strokeWidth={2} />
          <span>
            sunday<span className="brand-dot">.</span>
          </span>
        </a>
        <button className="league-picker" onClick={() => navigate('league')}>
          <span className="league-icon">
            <Shield size={19} />
          </span>
          <span>
            <strong>The Sunday League</strong>
            <small>8 teams · Full PPR</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-caption">YOUR CLUBHOUSE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              onClick={() => navigate(id)}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === 'team' && <span className="nav-dot" />}
              {id === 'activity' && activity.length > 0 && <small>{activity.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="little-sun">
              <Sun size={20} />
            </span>
            <strong>
              A little less noise.
              <br />A lot more football.
            </strong>
            <p>Your Sunday starts here.</p>
          </div>
          <button className="nav-item" onClick={() => setModal('settings')}>
            <Settings2 size={18} />
            <span>Make it yours</span>
          </button>
          <button className="nav-item" onClick={() => setModal('help')}>
            <CircleHelp size={18} />
            <span>A little help</span>
          </button>
          <button className="profile-button" onClick={() => setModal('profile')}>
            <span className="user-avatar">{profile === 'joel' ? 'JS' : 'G'}</span>
            <span>
              <strong>{profile === 'joel' ? 'Joel Shelton' : 'Guest profile'}</strong>
              <small>Local demo profile</small>
            </span>
            <MoreHorizontal size={19} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>The Sunday League</span>
            <ChevronRight size={13} />
            <strong>{currentPage.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-label">
              <i />
              Demo season
            </span>
            <button
              className="icon-button"
              aria-label="Search players"
              onClick={() => {
                navigate('players');
                setTimeout(() => document.getElementById('player-search')?.focus(), 0);
              }}
            >
              <Search size={19} />
            </button>
            <button
              className="icon-button notification-button"
              aria-label="View activity"
              onClick={() => navigate('activity')}
            >
              <Bell size={19} />
              {activity.length > 0 && <i />}
            </button>
            <button
              className="user-avatar top-avatar"
              aria-label="Your profile"
              onClick={() => setModal('profile')}
            >
              {profile === 'joel' ? 'JS' : 'G'}
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === 'team'
                  ? 'FANTASY, IN FOCUS'
                  : page === 'matchup'
                    ? 'EVERY POINT COUNTS'
                    : page === 'players'
                      ? 'FIND YOUR NEXT STARTER'
                      : page === 'league'
                        ? 'GOOD COMPANY. GREAT COMPETITION.'
                        : 'THE LATEST IN YOUR CLUBHOUSE'}
              </div>
              <h1>
                {page === 'team'
                  ? 'Your team. Your Sunday.'
                  : page === 'matchup'
                    ? 'This week’s matchup.'
                    : page === 'players'
                      ? 'A deeper bench starts here.'
                      : page === 'league'
                        ? 'The Sunday League.'
                        : 'The play-by-play.'}
              </h1>
              <p>
                {page === 'team'
                  ? 'A clear view of your lineup. A little edge for the weekend.'
                  : page === 'matchup'
                    ? 'Two teams. One win. Here’s how you stack up.'
                    : page === 'players'
                      ? 'Find a player, take a closer look, and keep an eye on your favorites.'
                      : page === 'league'
                        ? 'Your people, your standings, your season.'
                        : 'Every lineup move, all in one place.'}
              </p>
            </div>
            <button
              className="button secondary customize-button"
              onClick={() => setModal('settings')}
            >
              <SlidersHorizontal size={16} />
              Customize
            </button>
          </div>
          {page === 'team' && (
            <>
              <section className="team-overview">
                <div className="team-info">
                  <TeamBadge />
                  <div>
                    <div className="team-name-line">
                      <h2>{settings.teamName}</h2>
                      <span className="streak">
                        <TrendingUp size={12} />
                        W3
                      </span>
                    </div>
                    <p>
                      Looking good at the top.<span>Keep the streak alive.</span>
                    </p>
                  </div>
                </div>
                <div className="team-metrics">
                  <div>
                    <small>RECORD</small>
                    <strong>
                      6<span>–</span>2
                    </strong>
                  </div>
                  <div>
                    <small>LEAGUE RANK</small>
                    <strong>
                      1<span className="ordinal">st</span>
                      <small className="metric-of">/ 8</small>
                    </strong>
                  </div>
                  <div>
                    <small>POINTS FOR</small>
                    <strong>
                      1,128<span>.4</span>
                    </strong>
                  </div>
                </div>
              </section>
              <div className={`dashboard-grid ${!settings.insights ? 'no-rail' : ''}`}>
                <section className="roster-card card">
                  <div className="card-heading">
                    <div className="section-title">
                      <h2>Your lineup</h2>
                      <span className="subtle-badge">Week 9</span>
                    </div>
                    <div className="saved-state">
                      {saved ? <Check size={13} /> : <CircleHelp size={13} />}
                      <span>{saved ? 'Saved on this device' : 'Storage unavailable'}</span>
                    </div>
                  </div>
                  <div className="lineup-toolbar">
                    <div className="tabs" aria-label="Roster filter">
                      {(['all', 'starters', 'bench'] as const).map((f) => (
                        <button
                          key={f}
                          className={filter === f ? 'active' : ''}
                          aria-pressed={filter === f}
                          onClick={() => {
                            setFilter(f);
                            setSelected(null);
                          }}
                        >
                          {f === 'all' ? 'All players' : f === 'starters' ? 'Starters' : 'Bench'}
                          <span>{f === 'all' ? 15 : f === 'starters' ? 9 : 6}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Undo last lineup change"
                      disabled={!history.length}
                      onClick={undo}
                      title="Undo last change"
                    >
                      <Undo2 size={17} />
                    </button>
                  </div>
                  {selected ? (
                    <div className="move-hint">
                      <ArrowDownUp size={15} />
                      <span>
                        Choose a highlighted spot for{' '}
                        <b>{playerById[roster.find((s) => s.id === selected)!.playerId].name}</b>.
                      </span>
                      <button onClick={() => setSelected(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div className="roster-hint">
                      <GripVertical size={14} />
                      <span>Drag to adjust your lineup. We’ll show you where everyone fits.</span>
                    </div>
                  )}
                  <div className="roster-columns">
                    <span>SLOT</span>
                    <span>PLAYER</span>
                    <span>
                      MATCHUP <small>ET</small>
                    </span>
                    <span>PROJ.</span>
                    <span />
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={collision}
                    onDragStart={(e) => {
                      setSelected(null);
                      setActive(String(e.active.id));
                      setFilter('all');
                    }}
                    onDragEnd={dragEnd}
                    onDragCancel={() => setActive(null)}
                    accessibility={{
                      screenReaderInstructions: {
                        draggable:
                          'Press Space to pick up a player. Use arrow keys to move to an eligible slot. Press Space to swap, or Escape to cancel. You can also use the Choose position button.',
                      },
                      announcements: {
                        onDragStart: ({ active: a }) =>
                          `Picked up ${playerById[roster.find((s) => s.id === a.id)!.playerId].name}. Eligible positions are highlighted.`,
                        onDragOver: ({ over }) =>
                          over
                            ? `Over ${roster.find((s) => s.id === over.id)?.label} slot.`
                            : 'Outside a valid position.',
                        onDragEnd: ({ active: a, over }) =>
                          over && canSwap(roster, String(a.id), String(over.id))
                            ? 'Players swapped. Undo is available.'
                            : 'No lineup change.',
                        onDragCancel: () => 'Move canceled. Lineup unchanged.',
                      },
                    }}
                  >
                    <SortableContext
                      items={roster.map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {displayedRoster.map((slot, i) => (
                        <div key={slot.id}>
                          {slot.label === 'BN' &&
                            (i === 0 || displayedRoster[i - 1].label !== 'BN') && (
                              <div className="bench-heading">
                                <span>ON THE BENCH</span>
                                <small>Ready when you need them</small>
                              </div>
                            )}
                          <PlayerRow
                            slot={slot}
                            roster={roster}
                            moving={moving}
                            active={active}
                            selected={selected}
                            flash={flash}
                            onDetails={setDetail}
                            onMove={(id) => {
                              setFilter('all');
                              setSelected(id === selected ? null : id);
                            }}
                            onTarget={(id) => selected && swap(selected, id)}
                          />
                        </div>
                      ))}
                    </SortableContext>
                    <DragOverlay
                      dropAnimation={
                        settings.motion && !reduceMotion
                          ? { duration: 230, easing: 'cubic-bezier(.2,.9,.3,1.15)' }
                          : null
                      }
                    >
                      {activePlayer ? (
                        <div className="drag-preview">
                          <GripVertical size={17} />
                          <Avatar player={activePlayer} />
                          <div>
                            <strong>{activePlayer.name}</strong>
                            <small>
                              {activePlayer.position} · {activePlayer.team}
                            </small>
                          </div>
                          <span>{fmt(activePlayer.projection)}</span>
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                  <div className="lineup-footer">
                    <span>
                      <Shield size={14} />
                      Full PPR · 9 starters
                    </span>
                    <span>
                      Projected total<strong>{fmt(projection)}</strong>
                    </span>
                  </div>
                </section>
                {settings.insights && (
                  <aside className="right-rail">
                    <section className="matchup-card card">
                      <div className="card-heading">
                        <h2>This week</h2>
                        <span className="subtle-badge">WEEK 9</span>
                      </div>
                      <div className="matchup-teams">
                        <div>
                          <TeamBadge small />
                          <strong>{settings.teamName}</strong>
                          <small>6–2 · 1st</small>
                        </div>
                        <span className="versus">vs</span>
                        <div>
                          <TeamBadge gold small />
                          <strong>Fourth & Gold</strong>
                          <small>6–2 · 2nd</small>
                        </div>
                      </div>
                      <div className="matchup-scores">
                        <strong>{fmt(projection)}</strong>
                        <span>PROJECTED</span>
                        <strong>143.6</strong>
                      </div>
                      <div className="matchup-balance">
                        <span style={{ width: `${(projection / (projection + 143.6)) * 100}%` }} />
                      </div>
                      <div className="matchup-caption">
                        <span>Your edge</span>
                        <strong>
                          {projection >= 143.6 ? '+' : '−'}
                          {fmt(Math.abs(projection - 143.6))} pts
                        </strong>
                      </div>
                      <button className="button full secondary" onClick={() => navigate('matchup')}>
                        View matchup
                        <ArrowRight size={15} />
                      </button>
                    </section>
                    <section className="field-card">
                      <div className="field-art" aria-hidden="true">
                        <div className="field-line line-one" />
                        <div className="field-line line-two" />
                        <div className="field-line line-three" />
                        <span className="field-number">50</span>
                        <svg viewBox="0 0 300 150">
                          <path d="M65 132V83Q65 59 95 59H195Q226 59 226 29" />
                          <path d="m214 39 12-12 12 12" />
                          <circle cx="65" cy="132" r="7" />
                        </svg>
                        <span className="field-x x-one">×</span>
                        <span className="field-x x-two">×</span>
                        <span className="field-o" />
                      </div>
                      <div className="field-copy">
                        <span className="eyebrow">SET. SWAP. SUNDAY.</span>
                        <h3>
                          Good calls start
                          <br />
                          with a clear view.
                        </h3>
                        <p>
                          Make your moves. We’ll keep
                          <br />
                          everything in its place.
                        </p>
                        <button onClick={() => setModal('help')}>
                          Get to know your lineup
                          <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </section>
                    <section className="league-snapshot card">
                      <div className="card-heading">
                        <h2>The top of the table</h2>
                        <Trophy size={16} />
                      </div>
                      {standings.slice(0, 3).map((t, i) => (
                        <div className={`mini-standing ${i === 0 ? 'you' : ''}`} key={t.name}>
                          <span>{i + 1}</span>
                          <span
                            className="mini-team"
                            style={{ '--team-color': t.color } as CSSProperties}
                          >
                            {t.initials}
                          </span>
                          <strong>
                            {i === 0 ? settings.teamName : t.name}
                            {i === 0 && <small>YOU</small>}
                          </strong>
                          <span>{t.record}</span>
                        </div>
                      ))}
                      <button className="text-button" onClick={() => navigate('league')}>
                        Full standings
                        <ArrowRight size={14} />
                      </button>
                    </section>
                    <p className="demo-footnote">
                      <span />A little preview of what’s ahead.
                      <br />
                      All players, scores, and schedules are demo data.
                    </p>
                  </aside>
                )}
              </div>
            </>
          )}
          {page === 'matchup' && (
            <section className="card full-matchup">
              <div className="card-heading">
                <span className="subtle-badge">WEEK 9 · DEMO MATCHUP</span>
                <span className="muted">Full PPR</span>
              </div>
              <div className="matchup-hero">
                <div>
                  <TeamBadge />
                  <h2>{settings.teamName}</h2>
                  <p>6–2 · 1st place</p>
                  <strong>{fmt(projection)}</strong>
                </div>
                <div className="matchup-center">
                  <span>VS</span>
                  <small>Projected points</small>
                  <span className="subtle-badge">Upcoming</span>
                </div>
                <div>
                  <TeamBadge gold />
                  <h2>Fourth & Gold</h2>
                  <p>6–2 · 2nd place</p>
                  <strong>143.6</strong>
                </div>
              </div>
              <div className="matchup-note">
                <TrendingUp size={17} />
                Your current lineup is projected {fmt(Math.abs(projection - 143.6))} points{' '}
                {projection >= 143.6 ? 'ahead' : 'behind'}. Projections are illustrative.
              </div>
              <div className="head-to-head-header">
                <span>YOUR LINEUP</span>
                <span>PROJ.</span>
                <span>VS.</span>
                <span>PROJ.</span>
                <span>FOURTH & GOLD</span>
              </div>
              {roster
                .filter((s) => s.label !== 'BN')
                .map((s, i) => {
                  const p = playerById[s.playerId];
                  const opponents = [
                    ['Lamar Jackson', 25.2],
                    ['Bijan Robinson', 20.1],
                    ['De’Von Achane', 18.2],
                    ['Justin Jefferson', 20.7],
                    ['Amon-Ra St. Brown', 17.2],
                    ['George Kittle', 13.8],
                    ['Drake London', 14.5],
                    ['Jake Bates', 7.2],
                    ['Pittsburgh Steelers', 6.7],
                  ] as const;
                  return (
                    <div className="head-to-head" key={s.id}>
                      <button onClick={() => setDetail(p)}>
                        <Avatar player={p} small />
                        <span>
                          {p.name}
                          <small>{p.team}</small>
                        </span>
                      </button>
                      <strong className={p.projection > opponents[i][1] ? 'winning' : ''}>
                        {fmt(p.projection)}
                      </strong>
                      <span className={`position position-${s.label.toLowerCase()}`}>
                        {s.label}
                      </span>
                      <strong>{fmt(opponents[i][1])}</strong>
                      <span className="opposing-player">{opponents[i][0]}</span>
                    </div>
                  );
                })}
              <div className="lineup-footer">
                <span>Demo scores · No games in progress</span>
                <button className="text-button" onClick={() => navigate('team')}>
                  Manage lineup
                  <ArrowRight size={14} />
                </button>
              </div>
            </section>
          )}
          {page === 'players' && (
            <section className="card player-market">
              <div className="market-toolbar">
                <label className="search-input">
                  <Search size={18} />
                  <input
                    id="player-search"
                    placeholder="Search players or teams…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      className="icon-button"
                      aria-label="Clear search"
                      onClick={() => setQuery('')}
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                <select
                  aria-label="Player availability"
                  value={pool}
                  onChange={(e) => setPool(e.target.value as typeof pool)}
                >
                  <option value="available">Available players</option>
                  <option value="all">All players</option>
                  <option value="watchlist">My watchlist ({watchlist.length})</option>
                </select>
              </div>
              <div className="position-filters">
                {['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => (
                  <button
                    key={p}
                    className={position === p ? 'active' : ''}
                    aria-pressed={position === p}
                    onClick={() => setPosition(p)}
                  >
                    {p === 'ALL' ? 'All positions' : p}
                  </button>
                ))}
                <span>{filteredPlayers.length} players</span>
              </div>
              <div className="market-columns">
                <span>PLAYER</span>
                <span>MATCHUP</span>
                <span>PROJ.</span>
                <span>WATCH</span>
              </div>
              {filteredPlayers.map((p) => (
                <div className="market-row" key={p.id}>
                  <button className="player-identity" onClick={() => setDetail(p)}>
                    <Avatar player={p} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.team}
                        <span>·</span>
                        {p.position}
                        {roster.some((s) => s.playerId === p.id) && <em>On your team</em>}
                      </small>
                    </span>
                  </button>
                  <div className="opponent">
                    <strong>{p.opponent}</strong>
                    <small>{p.time} ET</small>
                  </div>
                  <strong className="projection">{fmt(p.projection)}</strong>
                  <button
                    className={`icon-button watch-button ${watchlist.includes(p.id) ? 'watched' : ''}`}
                    aria-label={`${watchlist.includes(p.id) ? 'Unwatch' : 'Watch'} ${p.name}`}
                    aria-pressed={watchlist.includes(p.id)}
                    onClick={() => toggleWatch(p)}
                  >
                    <Star size={19} fill={watchlist.includes(p.id) ? 'currentColor' : 'none'} />
                  </button>
                </div>
              ))}
              {!filteredPlayers.length && (
                <div className="empty-state">
                  <Search size={30} />
                  <h3>
                    {pool === 'watchlist' ? 'Your watchlist is waiting.' : 'No players found.'}
                  </h3>
                  <p>
                    {pool === 'watchlist'
                      ? 'Star a player to keep them close.'
                      : 'Try a different name or position.'}
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setQuery('');
                      setPosition('ALL');
                      setPool('all');
                    }}
                  >
                    Browse all players
                  </button>
                </div>
              )}
              <div className="lineup-footer">
                <span>Demo player pool · Watchlists are saved to your profile.</span>
              </div>
            </section>
          )}
          {page === 'league' && (
            <>
              <div className="league-summary">
                <div className="card">
                  <Shield size={22} />
                  <span>
                    THE FORMAT<strong>Full PPR</strong>
                  </span>
                </div>
                <div className="card">
                  <Users size={22} />
                  <span>
                    THE COMPETITION<strong>8 teams</strong>
                  </span>
                </div>
                <div className="card">
                  <LayoutGrid size={22} />
                  <span>
                    THE LINEUP<strong>9 starters · 6 bench</strong>
                  </span>
                </div>
              </div>
              <section className="card standings-card">
                <div className="card-heading">
                  <h2>League standings</h2>
                  <span className="subtle-badge">THROUGH WEEK 8</span>
                </div>
                <div className="standings-header">
                  <span>RANK</span>
                  <span>TEAM</span>
                  <span>W–L</span>
                  <span>POINTS FOR</span>
                  <span>STREAK</span>
                </div>
                {standings.map((t, i) => (
                  <div className={`standings-row ${i === 0 ? 'you' : ''}`} key={t.name}>
                    <span className="rank">
                      {i + 1}
                      {i === 0 && <Trophy size={14} />}
                    </span>
                    <div className="standing-team">
                      <span
                        className="mini-team"
                        style={{ '--team-color': t.color } as CSSProperties}
                      >
                        {t.initials}
                      </span>
                      <span>
                        <strong>
                          {i === 0 ? settings.teamName : t.name}
                          {i === 0 && <span className="you-tag">YOU</span>}
                        </strong>
                        <small>{t.owner}</small>
                      </span>
                    </div>
                    <strong>{t.record}</strong>
                    <span>{t.points.toLocaleString('en-US', { minimumFractionDigits: 1 })}</span>
                    <span className={t.streak.startsWith('W') ? 'winning' : 'muted'}>
                      {t.streak}
                    </span>
                  </div>
                ))}
                <div className="lineup-footer">
                  <span>Illustrative league · Standings are fixed demo data.</span>
                </div>
              </section>
            </>
          )}
          {page === 'activity' && (
            <section className="card activity-card">
              <div className="card-heading">
                <h2>Your recent moves</h2>
                <span className="subtle-badge">{activity.length} UPDATES</span>
              </div>
              {activity.length ? (
                activity.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <span className="activity-icon">
                      <ArrowDownUp size={18} />
                    </span>
                    <div>
                      <strong>{a.text}</strong>
                      <small>
                        {new Date(a.time).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </small>
                    </div>
                    <Check size={15} />
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <ActivityIcon size={32} />
                  <h3>A fresh start.</h3>
                  <p>Make a lineup change and it will show up here.</p>
                  <button className="button primary" onClick={() => navigate('team')}>
                    Go to your lineup
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>
              <Sun size={13} />
              sunday.
            </span>
            <span>More game. Less noise.</span>
            <button onClick={() => setModal('help')}>
              Built for your Sunday
              <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check">
            <Check size={16} />
          </span>
          <span>{toast}</span>
          {history.length > 0 && (toast.startsWith('Swapped ') || toast === 'Lineup restored') && (
            <button onClick={undo}>Undo</button>
          )}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === 'settings' && (
        <Modal
          title="Make it yours."
          subtitle="A familiar home, with your own finishing touches."
          onClose={() => setModal(null)}
        >
          <div className="settings-body">
            <label className="field-label">
              TEAM NAME
              <input
                maxLength={32}
                value={settings.teamName}
                onChange={(e) => updateSetting('teamName', e.target.value)}
                onBlur={() => {
                  if (!settings.teamName.trim()) updateSetting('teamName', 'Sunday Scaries');
                }}
              />
            </label>
            <fieldset>
              <legend>SET THE MOOD</legend>
              <div className="theme-options">
                {(['dark', 'dusk', 'light'] as const).map((t) => (
                  <button
                    className={`theme-option ${settings.theme === t ? 'chosen' : ''}`}
                    key={t}
                    onClick={() => updateSetting('theme', t)}
                    aria-pressed={settings.theme === t}
                  >
                    <span className={`theme-preview preview-${t}`}>
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>
                      {t === 'dark' ? 'Clubhouse' : t === 'dusk' ? 'After hours' : 'Day game'}
                      {settings.theme === t && <Check size={13} />}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>YOUR ACCENT</legend>
              <div className="accent-options">
                {(['mint', 'lavender', 'amber'] as const).map((a) => (
                  <button
                    key={a}
                    className={`accent-option accent-${a} ${settings.accent === a ? 'chosen' : ''}`}
                    aria-pressed={settings.accent === a}
                    onClick={() => updateSetting('accent', a)}
                  >
                    <span>{settings.accent === a && <Check size={12} />}</span>
                    {a[0].toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>A LITTLE BREATHING ROOM</legend>
              <div className="segmented">
                {(['comfortable', 'compact'] as const).map((d) => (
                  <button
                    key={d}
                    className={settings.density === d ? 'active' : ''}
                    aria-pressed={settings.density === d}
                    onClick={() => updateSetting('density', d)}
                  >
                    {d[0].toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </fieldset>
            <Toggle
              label="The extra context"
              description="Show matchup and league cards beside your lineup."
              checked={settings.insights}
              onChange={() => updateSetting('insights', !settings.insights)}
            />
            <Toggle
              label="A satisfying little click"
              description="Play a soft sound when a player snaps into place."
              checked={settings.sound}
              onChange={() => {
                updateSetting('sound', !settings.sound);
                playSnap(!settings.sound);
              }}
            />
            <Toggle
              label="A little motion"
              description={
                reduceMotion
                  ? 'Your device’s reduced-motion preference takes priority.'
                  : 'Smooth lifts, gentle snaps, and a soft landing.'
              }
              checked={settings.motion}
              onChange={() => updateSetting('motion', !settings.motion)}
            />
            <p className="settings-note">
              <Check size={14} />
              {saved
                ? 'Saved automatically to this local profile.'
                : 'Browser storage is unavailable. Changes last for this session.'}
            </p>
          </div>
        </Modal>
      )}
      {modal === 'profile' && (
        <Modal
          title="Your corner of the league."
          subtitle="Try separate profiles, each with its own lineup and settings."
          onClose={() => setModal(null)}
        >
          <div className="profile-options">
            {[
              { id: 'joel', name: 'Joel Shelton', letters: 'JS' },
              { id: 'guest', name: 'Guest profile', letters: 'G' },
            ].map((p) => (
              <button
                key={p.id}
                className={profile === p.id ? 'chosen' : ''}
                onClick={() => {
                  if (profile !== p.id) changeProfile(p.id);
                  else setModal(null);
                }}
              >
                <span className="user-avatar">{p.letters}</span>
                <span>
                  <strong>{p.name}</strong>
                  <small>Local demo profile</small>
                </span>
                {profile === p.id ? <Check size={18} /> : <ArrowRight size={18} />}
              </button>
            ))}
          </div>
          <p className="modal-note">
            Profiles are stored in this browser. Account sign-in and cross-device sync will be added
            when the backend is connected.
          </p>
        </Modal>
      )}
      {modal === 'help' && (
        <Modal
          title="Less friction. More football."
          subtitle="A few small things that make your lineup feel right."
          onClose={() => setModal(null)}
        >
          <div className="help-items">
            <div>
              <GripVertical />
              <span>
                <h3>Pick up. Put down. Done.</h3>
                <p>
                  Drag the handle beside a player. Compatible positions light up. Drop near a
                  highlighted row to swap both players.
                </p>
              </span>
            </div>
            <div>
              <ArrowDownUp />
              <span>
                <h3>A tap works, too.</h3>
                <p>
                  Use the swap button at the end of a row, then choose a highlighted position. With
                  a keyboard, focus the drag handle, press Space, use the arrows, then Space again.
                </p>
              </span>
            </div>
            <div>
              <Undo2 />
              <span>
                <h3>You have room to change your mind.</h3>
                <p>
                  Press Escape or drop outside the lineup to cancel. Undo brings back your last
                  move. Ineligible swaps never change your roster.
                </p>
              </span>
            </div>
            <div>
              <SlidersHorizontal />
              <span>
                <h3>Make yourself at home.</h3>
                <p>
                  Choose a theme, accent, or compact layout. Enable a soft snap sound if you like.
                  Your preferences stay with your local profile.
                </p>
              </span>
            </div>
          </div>
          <div className="help-demo">
            <strong>You’re exploring a design preview.</strong>
            <p>
              Players, schedules, projections, and standings are illustrative fixtures. Live data,
              waivers, real accounts, and league administration come after the design.
            </p>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal
          title="Player overview"
          subtitle="Demo player profile · Week 9"
          onClose={() => setDetail(null)}
        >
          <div className="player-detail">
            <div className="detail-identity">
              <Avatar player={detail} />
              <div>
                <h2>{detail.name}</h2>
                <p>
                  {detail.team} · {detail.position} · #{detail.number}
                </p>
              </div>
              <button
                className={`icon-button ${watchlist.includes(detail.id) ? 'watched' : ''}`}
                aria-label={`${watchlist.includes(detail.id) ? 'Unwatch' : 'Watch'} ${detail.name}`}
                aria-pressed={watchlist.includes(detail.id)}
                onClick={() => toggleWatch(detail)}
              >
                <Star size={21} fill={watchlist.includes(detail.id) ? 'currentColor' : 'none'} />
              </button>
            </div>
            {detail.note && <div className="injury-note">{detail.note}</div>}
            <div className="detail-stats">
              <div>
                <small>WEEK 9 PROJECTION</small>
                <strong>
                  {fmt(detail.projection)}
                  <span>pts</span>
                </strong>
              </div>
              <div>
                <small>MATCHUP</small>
                <strong className="detail-matchup">{detail.opponent}</strong>
                <small>{detail.time} ET</small>
              </div>
            </div>
            <div className="trend-heading">
              <h3>A little perspective</h3>
              <span>Demo points · Full PPR</span>
            </div>
            <div
              className="trend-chart"
              role="img"
              aria-label={`Illustrative points, weeks 5 to 9: ${detail.trend.join(', ')}`}
            >
              {detail.trend.map((n, i) => (
                <div className={`trend-bar ${i === 4 ? 'current' : ''}`} key={i}>
                  <strong>{fmt(n)}</strong>
                  <span style={{ height: `${(n / Math.max(...detail.trend)) * 110}px` }} />
                  <small>
                    W{i + 5}
                    {i === 4 ? ' · Proj.' : ''}
                  </small>
                </div>
              ))}
            </div>
            <button className="button secondary full" onClick={() => toggleWatch(detail)}>
              <Star size={16} fill={watchlist.includes(detail.id) ? 'currentColor' : 'none'} />
              {watchlist.includes(detail.id) ? 'Remove from watchlist' : 'Add to watchlist'}
            </button>
            <p className="modal-note">Illustrative data for exploring the design.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
