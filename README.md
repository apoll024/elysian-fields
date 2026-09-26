# Elysian Fields

An Olympus-themed fantasy football league app. Ten password-protected accounts and their Week 2, 2026 rosters come from the supplied Yahoo Starting Rosters HTML export. Ryan is the sole commissioner. The API stores teams, sessions, league settings, and waiver claims in SQLite; the frontend no longer depends on browser-local demo profiles.

## Accounts and rosters

| Account             | Team                            |
| ------------------- | ------------------------------- |
| Ryan (commissioner) | balls deep                      |
| Gary                | Dumpster phoenix                |
| Rick                | Happy Gollodays!                |
| Reo                 | Garbage Day                     |
| Kyle                | Joyzee Balwurs                  |
| Jeff                | Little lebowski urban acheivers |
| Joel                | Str8UpLazy                      |
| Kunal               | Fumbling Drunkards              |
| Marko               | 1.21 Gigawatts                  |
| Jonny               | Caleb Me Maybe                  |

The source export has 158 player entries, including bench and IR. `data/league-seed.json` preserves its lineup slots and Yahoo player IDs. Supplied team names take precedence where they differ from Yahoo's spelling. Recreate the seed from a saved export with `python scripts/import_yahoo_rosters.py INPUT.html data/league-seed.json` after installing `beautifulsoup4`.

## Local setup

Python 3.9+ and Node.js 24 LTS are recommended.

```powershell
npm ci
$env:ELYSIAN_DB_PATH = "$PWD/server/league.db"
$env:ELYSIAN_SEED_PASSWORD = "123"
python server/app.py --seed
Remove-Item Env:ELYSIAN_SEED_PASSWORD
python server/app.py
```

In another terminal run `npm run dev`, then open http://127.0.0.1:5173. Vite proxies `/api` to Python on localhost port 8765. The initial password is `123` for every account; password hashes, not plaintext, are stored in SQLite. The database is ignored by Git. Seeding refuses to overwrite an existing database.

## Team and commissioner actions

Managers can view their assigned roster, swap eligible lineup slots, and submit or cancel waiver claims. Team names are fixed to their imported accounts. Each roster change is saved by the server and checked against roster membership and position eligibility. A failed save leaves the current roster visible with an error message.

Each account can choose a light, dusk, or dark theme, a laurel, oracle, or bronze accent, comfortable or compact rows, and reduced motion from Appearance. These display preferences are saved in that browser for the account.

Ryan alone can open other teams for editing, change league settings, add players to the free-agent pool, and process waiver claims on demand. These restrictions are enforced by API checks in addition to the UI. A shared password means someone who signs in _as Ryan_ can use commissioner controls; use a unique Ryan password if that access must be exclusive to him.

Waivers use rolling priority, initially ordered as the accounts above. Claims run daily after 3:00 a.m. America/Los_Angeles. A successful claim replaces the nominated drop player, moves the claimant to the end of the priority list, and holds the dropped player for 24 hours. The supplied export contains rosters but no free-agent list; Ryan can add free agents in the waiver view.

Roster rows show clearly labeled demo projected points. The Matchups section displays a fabricated nine-week round robin. These are layout previews, not live scores or provider projections. [Player data options](docs/player-data-options.md) compares sources for a future integration. The league setting labels are stored but scoring calculations and game-time lineup locks are not yet enforced.

## Deployment

See [OCI deployment notes](docs/oci-deployment.md) for the Python service, SQLite storage, Caddy API proxy, and static frontend release. The server deployment requires both the API and the frontend; publishing only `dist/` will leave the login unable to connect.

The generated Olympus entrance artwork is bundled locally. Its prompt and packaging are described in [artwork notes](docs/olympus-artwork.md).
