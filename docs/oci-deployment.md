# OCI deployment

The production app now has two parts: a static Vite frontend and a Python account/roster API. Caddy serves the frontend from `/srv/elysian-fields/current` and proxies `/api/*` to `127.0.0.1:8765`. The API database is persistent at `/var/lib/elysian-fields/league.db`; it must survive static release changes.

## First-time API provisioning

1. Copy `server/app.py` and `data/league-seed.json` to `/opt/elysian-fields/server/app.py` and `/opt/elysian-fields/data/league-seed.json`. Keep the tree root-owned and readable by `www-data`.
2. Install `deploy/elysian-fields-api.service` as `/etc/systemd/system/elysian-fields-api.service`. Create `/var/lib/elysian-fields` owned by `www-data` with mode 0700.
3. Set the initial password to the user-requested value `123` only for the one-time seed command. Do not commit a database or password environment file. For example, run:

   ```sh
   sudo -u www-data env ELYSIAN_DB_PATH=/var/lib/elysian-fields/league.db ELYSIAN_SEED_PASSWORD=123 python3 /opt/elysian-fields/server/app.py --seed
   sudo systemctl daemon-reload
   sudo systemctl enable --now elysian-fields-api
   curl --fail http://127.0.0.1:8765/api/health
   ```

The seed command refuses to replace an existing database. Preserve the SQLite file during future updates. Run the service as `www-data` with no public listening port.

## Frontend and Caddy

Build on a workstation with `npm ci` and `npm run build`. Upload only `dist/` into a new `/srv/elysian-fields/releases/RELEASE_ID`, then point `current` at the new release after extraction. Keep the previous release for rollback.

Update `/etc/caddy/Caddyfile` from `deploy/Caddyfile` so `/api/*` reaches the Python service. Validate with `sudo caddy validate --config /etc/caddy/Caddyfile` before reloading Caddy. The frontend's `connect-src 'self'` policy permits only its same-origin API. The API itself binds to loopback, and Caddy provides HTTPS.

Roll back the static site by pointing `current` to the previous release and reloading Caddy. Rolling back API code may require a compatible database backup; make a copy of `league.db` before API upgrades.

## Verification after deployment

- `/health` returns `ok`; `/api/health` returns JSON `{"status":"ok"}`.
- The entrance asks for an account and password.
- Ryan sees commissioner settings and team-edit controls; another account does not.
- A roster swap saves and remains visible without refreshing.
- Waiver claims and priorities persist across sessions.

The saved Yahoo page is an input to the import script, not a runtime dependency. Its third-party scripts are never executed.
