# Elysian Fields

**Where legends take the field.** A responsive fantasy football design prototype with an Olympus entrance, a light marble and gold default theme, tactile roster management, and personal layouts.

## Run locally

Node.js 24 LTS is recommended.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Build production assets with `npm run build` and inspect them with `npm run preview`.

## What works

- Roster swaps with mouse, touch, keyboard, or two clicks. Both players must fit their destination positions. Nearby valid targets snap into place; invalid drops and Escape cancel safely.
- Undo for the last 20 lineup changes in the current session, with a persistent activity feed.
- Projected totals update immediately with the lineup. Matchup comparison, standings, searchable player pool, player details, and saved watchlists.
- An illustrated Elysian Gates entrance with Joel and Guest demo profile selection. Entering is remembered for the browser tab; return via Your profile → Return to the gates.
- Position-colored player names across the roster, bench, FLEX, drag overlay, player pool, matchup, and details. QB is pink; RB green; WR blue; TE ochre; K violet; DEF slate.
- Three themes (marble daylight by default), three accent colors, two densities, a collapsible context rail, optional synthesized snap sounds, and reduced-motion support.
- Independent Joel and Guest demo profiles. Rosters, names, preferences, activity, and watchlists persist in browser storage.
- Responsive layouts, visible keyboard focus, native modal focus management, and drag announcements.

All sports data is **illustrative**, including player/team associations, schedules, records, projections, and player status. The demo week is fixed at Week 9. This prototype has no AI features.

## Design preview boundaries

Local profiles demonstrate personalization; they are not authenticated accounts. Browser data does not sync between devices. Live statistics, transactions and waivers, trades, league administration, real accounts, server persistence, and scoring integrations are not implemented yet. The player pool currently supports discovery and watchlists.

## Structure

| File                | Responsibility                                                                 |
| ------------------- | ------------------------------------------------------------------------------ |
| `src/App.tsx`       | Views, accessible dialogs, roster interactions, and local state                |
| `src/styles.css`    | Theme tokens, responsive layouts, and motion                                   |
| `src/data.ts`       | Typed demo fixtures; replace via a provider adapter when paid data is selected |
| `src/model.ts`      | Eligibility, immutable swaps, persisted-state validation, and optional audio   |
| `src/model.test.ts` | Lineup rules and corrupt-data protection                                       |
| `tests/app.spec.ts` | Browser interaction and mobile regression checks                               |

Future API keys belong in a server-side integration. Do not place credentials in `VITE_*` variables, browser code, or committed files. The future backend should own account authorization, roster locks, transactions, and authoritative scoring; client projections remain a presentation layer.

Fonts and entrance artwork are bundled locally. The built frontend makes no third-party requests. Existing saved theme choices are respected; new profiles default to marble daylight with a gold accent. See [artwork notes](docs/olympus-artwork.md) for the generated asset and prompt.

## Checks

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

If Microsoft Edge is already installed, PowerShell can use it without a browser download:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

## OCI deployment

See [docs/oci-deployment.md](docs/oci-deployment.md). Production is a native Caddy systemd service serving versioned static releases. SSH keys and OCI connection details are not part of the repository.
