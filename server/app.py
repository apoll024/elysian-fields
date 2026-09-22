"""Small same-origin account and roster API for the Elysian Fields frontend."""
import argparse
import hashlib
import hmac
import http.cookies
import json
import os
import secrets
import sqlite3
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.environ.get("ELYSIAN_DB_PATH", ROOT / "server" / "league.db"))
SEED_PATH = ROOT / "data" / "league-seed.json"
COOKIE = "__Host-ef_session"
SESSION_SECONDS = 7 * 24 * 60 * 60
POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF"}
SLOTS = POSITIONS | {"FLEX", "BN", "IR"}
DEFAULT_SETTINGS = {
    "name": "Bros b4 Hoes",
    "scoring": "Full PPR",
    "waivers": "Rolling priority · Daily 3 AM Pacific",
    "tradeDeadline": "League decision pending",
    "lineupLock": "At game time",
}
LOGIN_ATTEMPTS = {}
LOGIN_LOCK = threading.Lock()


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def hash_password(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)


def seed_database(password):
    if DB_PATH.exists():
        raise ValueError(f"Database already exists: {DB_PATH}")
    if not password:
        raise ValueError("ELYSIAN_SEED_PASSWORD is required")
    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    if len(seed["teams"]) != 10:
        raise ValueError("Expected exactly ten teams")
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = connect()
    try:
        db.executescript("""
            CREATE TABLE accounts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                team_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('commissioner','member')),
                salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                roster_json TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE sessions (
                token_hash TEXT PRIMARY KEY,
                account_id TEXT NOT NULL REFERENCES accounts(id),
                expires INTEGER NOT NULL
            );
            CREATE TABLE league_settings (id INTEGER PRIMARY KEY CHECK(id=1), settings_json TEXT NOT NULL);
            CREATE TABLE players (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                position TEXT NOT NULL,
                nfl_team TEXT NOT NULL
            );
            CREATE TABLE waiver_claims (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id TEXT NOT NULL REFERENCES accounts(id),
                player_id TEXT NOT NULL REFERENCES players(id),
                drop_player_id TEXT NOT NULL REFERENCES players(id),
                status TEXT NOT NULL DEFAULT 'pending',
                reason TEXT,
                created_at INTEGER NOT NULL,
                processed_at INTEGER
            );
            CREATE TABLE waiver_priority (
                account_id TEXT PRIMARY KEY REFERENCES accounts(id),
                priority INTEGER NOT NULL UNIQUE
            );
            CREATE TABLE waiver_cooldowns (
                player_id TEXT PRIMARY KEY REFERENCES players(id),
                available_at INTEGER NOT NULL
            );
            CREATE TABLE waiver_schedule (id INTEGER PRIMARY KEY CHECK(id=1), last_day TEXT);
        """)
        for team in seed["teams"]:
            salt = secrets.token_bytes(24)
            db.execute(
                "INSERT INTO accounts(id,name,team_name,role,salt,password_hash,roster_json) VALUES(?,?,?,?,?,?,?)",
                (
                    team["id"], team["accountName"], team["teamName"],
                    "commissioner" if team["commissioner"] else "member",
                    salt, hash_password(password, salt),
                    json.dumps(team["roster"], ensure_ascii=False),
                ),
            )
            db.execute(
                "INSERT INTO waiver_priority(account_id,priority) VALUES(?,?)",
                (team["id"], int(team["id"])),
            )
            for player in team["roster"]:
                db.execute(
                    "INSERT INTO players(id,name,position,nfl_team) VALUES(?,?,?,?)",
                    (player["playerId"], player["name"], player["position"], player["nflTeam"]),
                )
        db.execute(
            "INSERT INTO league_settings(id,settings_json) VALUES(1,?)",
            (json.dumps(DEFAULT_SETTINGS),),
        )
        db.execute("INSERT INTO waiver_schedule(id,last_day) VALUES(1,NULL)")
        db.commit()
    except Exception:
        db.close()
        DB_PATH.unlink(missing_ok=True)
        raise
    finally:
        db.close()
    os.chmod(DB_PATH, 0o600)
    print(f"Seeded {len(seed['teams'])} accounts in {DB_PATH}")


def public_account(row):
    return {
        "id": row["id"], "name": row["name"], "teamName": row["team_name"],
        "role": row["role"], "version": row["version"],
    }


def roster_valid(current, requested):
    if not isinstance(requested, list) or len(requested) != len(current):
        return False
    expected = {player["playerId"]: player for player in current}
    if len(expected) != len(current):
        return False
    ids = [entry.get("playerId") if isinstance(entry, dict) else None for entry in requested]
    if len(set(ids)) != len(ids) or set(ids) != set(expected):
        return False
    for old, entry in zip(current, requested):
        if not isinstance(entry, dict) or entry.get("slot") != old["slot"]:
            return False
        position = expected[entry["playerId"]]["position"]
        slot = old["slot"]
        if slot not in SLOTS or position not in POSITIONS:
            return False
        if slot not in {"BN", "IR", "FLEX", position}:
            return False
        if slot == "FLEX" and position not in {"RB", "WR", "TE"}:
            return False
    return True


def owned_ids(db):
    owned = set()
    for row in db.execute("SELECT roster_json FROM accounts"):
        owned.update(player["playerId"] for player in json.loads(row["roster_json"]))
    return owned


def available_ids(db):
    now = int(time.time())
    cooldown = {
        row["player_id"] for row in db.execute(
            "SELECT player_id FROM waiver_cooldowns WHERE available_at>?", (now,)
        )
    }
    return {row["id"] for row in db.execute("SELECT id FROM players")} - owned_ids(db) - cooldown


def process_waivers(db):
    """Process pending claims in rolling priority order within one SQLite transaction."""
    db.execute("BEGIN IMMEDIATE")
    now = int(time.time())
    rows = db.execute(
        """SELECT c.*,p.priority FROM waiver_claims c
           JOIN waiver_priority p ON p.account_id=c.account_id
           WHERE c.status='pending' ORDER BY p.priority,c.created_at,c.id"""
    ).fetchall()
    results = []
    for claim in rows:
        account = db.execute("SELECT * FROM accounts WHERE id=?", (claim["account_id"],)).fetchone()
        roster = json.loads(account["roster_json"])
        drop = next((i for i, player in enumerate(roster) if player["playerId"] == claim["drop_player_id"]), None)
        if claim["player_id"] not in available_ids(db):
            status, reason = "failed", "Player is no longer available"
        elif drop is None:
            status, reason = "failed", "Drop player is no longer on the team"
        else:
            new_player = db.execute("SELECT * FROM players WHERE id=?", (claim["player_id"],)).fetchone()
            slot = roster[drop]["slot"]
            if slot not in {"BN", "IR", new_player["position"]} and not (
                slot == "FLEX" and new_player["position"] in {"RB", "WR", "TE"}
            ):
                status, reason = "failed", "Claimed player cannot fill the drop player's slot"
            else:
                dropped_id = roster[drop]["playerId"]
                roster[drop] = {
                    "playerId": new_player["id"], "name": new_player["name"],
                    "position": new_player["position"], "nflTeam": new_player["nfl_team"],
                    "slot": slot,
                }
                db.execute(
                    "UPDATE accounts SET roster_json=?,version=version+1 WHERE id=?",
                    (json.dumps(roster, ensure_ascii=False), account["id"]),
                )
                db.execute(
                    "INSERT OR REPLACE INTO waiver_cooldowns(player_id,available_at) VALUES(?,?)",
                    (dropped_id, now + 86400),
                )
                order = [
                    item["account_id"] for item in db.execute(
                        "SELECT account_id FROM waiver_priority ORDER BY priority"
                    )
                ]
                order.remove(account["id"])
                order.append(account["id"])
                # Temporary negative values avoid the UNIQUE constraint while rotating.
                db.execute("UPDATE waiver_priority SET priority=-priority")
                for priority, account_id in enumerate(order, 1):
                    db.execute(
                        "UPDATE waiver_priority SET priority=? WHERE account_id=?",
                        (priority, account_id),
                    )
                status, reason = "success", None
        db.execute(
            "UPDATE waiver_claims SET status=?,reason=?,processed_at=? WHERE id=?",
            (status, reason, now, claim["id"]),
        )
        results.append({"id": claim["id"], "status": status, "reason": reason})
    db.commit()
    return results


def daily_waiver_worker():
    """Run claims once each calendar day at 03:00 America/Los_Angeles."""
    while True:
        try:
            now = datetime.now(ZoneInfo("America/Los_Angeles"))
            day = now.date().isoformat()
            if now.hour >= 3:
                db = connect()
                try:
                    last = db.execute("SELECT last_day FROM waiver_schedule WHERE id=1").fetchone()[0]
                    if last != day:
                        process_waivers(db)
                        db.execute("UPDATE waiver_schedule SET last_day=? WHERE id=1", (day,))
                        db.commit()
                finally:
                    db.close()
        except Exception as exc:
            print(f"Waiver worker: {exc}", flush=True)
        time.sleep(30)


class Handler(BaseHTTPRequestHandler):
    server_version = "ElysianAPI/1"

    def json_response(self, status, data, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        size = int(self.headers.get("Content-Length", "0"))
        if size < 1 or size > 131072 or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            raise ValueError("Expected a JSON body under 128 KB")
        data = json.loads(self.rfile.read(size))
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object")
        return data

    def origin_allowed(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        parsed = urlsplit(origin)
        return parsed.scheme in {"http", "https"} and parsed.netloc == self.headers.get("Host")

    def account(self, db):
        jar = http.cookies.SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie", ""))
            token = jar[COOKIE].value
        except (KeyError, http.cookies.CookieError):
            return None
        digest = hashlib.sha256(token.encode()).hexdigest()
        return db.execute(
            """SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id
               WHERE s.token_hash=? AND s.expires>?""",
            (digest, int(time.time())),
        ).fetchone()

    def route(self, method):
        path = urlsplit(self.path).path
        if not path.startswith("/api/"):
            return self.json_response(404, {"error": "Not found"})
        if method != "GET" and not self.origin_allowed():
            return self.json_response(403, {"error": "Origin denied"})
        if path == "/api/health" and method == "GET":
            return self.json_response(200, {"status": "ok"})
        try:
            db = connect()
            try:
                return self.dispatch(db, method, path)
            finally:
                db.close()
        except (ValueError, json.JSONDecodeError, TypeError) as exc:
            return self.json_response(400, {"error": str(exc)})

    def dispatch(self, db, method, path):
        if path == "/api/login" and method == "POST":
            data = self.body()
            username = str(data.get("username", "")).strip()
            password = str(data.get("password", ""))
            if len(password) > 1024:
                return self.json_response(400, {"error": "Invalid password"})
            client_ip = self.client_address[0]
            with LOGIN_LOCK:
                attempts = [stamp for stamp in LOGIN_ATTEMPTS.get(client_ip, []) if stamp > time.time() - 60]
                LOGIN_ATTEMPTS[client_ip] = attempts
                if len(attempts) >= 10:
                    return self.json_response(429, {"error": "Too many sign-in attempts. Try again shortly."})
            account = db.execute("SELECT * FROM accounts WHERE name=? COLLATE NOCASE", (username,)).fetchone()
            # Equal-cost verification for unknown accounts.
            salt = account["salt"] if account else b"\0" * 24
            expected = account["password_hash"] if account else b"\0" * 32
            if not hmac.compare_digest(hash_password(password, salt), expected) or not account:
                with LOGIN_LOCK:
                    LOGIN_ATTEMPTS[client_ip].append(time.time())
                return self.json_response(401, {"error": "Incorrect account or password"})
            with LOGIN_LOCK:
                LOGIN_ATTEMPTS.pop(client_ip, None)
            token = secrets.token_urlsafe(32)
            db.execute(
                "INSERT INTO sessions(token_hash,account_id,expires) VALUES(?,?,?)",
                (hashlib.sha256(token.encode()).hexdigest(), account["id"], int(time.time()) + SESSION_SECONDS),
            )
            db.commit()
            cookie = f"{COOKIE}={token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={SESSION_SECONDS}"
            return self.json_response(200, {"account": public_account(account)}, cookie)
        account = self.account(db)
        if not account:
            return self.json_response(401, {"error": "Sign in required"})
        if path == "/api/logout" and method == "POST":
            jar = http.cookies.SimpleCookie()
            jar.load(self.headers.get("Cookie", ""))
            if COOKIE in jar:
                db.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(jar[COOKIE].value.encode()).hexdigest(),))
                db.commit()
            return self.json_response(200, {"ok": True}, f"{COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0")
        if path == "/api/session" and method == "GET":
            return self.json_response(200, {"account": public_account(account)})
        if path == "/api/league" and method == "GET":
            settings = json.loads(db.execute("SELECT settings_json FROM league_settings WHERE id=1").fetchone()[0])
            rows = db.execute("SELECT id,name,team_name,role,version FROM accounts ORDER BY CAST(id AS INTEGER)").fetchall()
            priorities = {r["account_id"]: r["priority"] for r in db.execute("SELECT * FROM waiver_priority")}
            return self.json_response(200, {
                "settings": settings,
                "teams": [{**public_account(r), "waiverPriority": priorities[r["id"]]} for r in rows],
            })
        if path == "/api/league/settings" and method == "PUT":
            if account["role"] != "commissioner":
                return self.json_response(403, {"error": "Commissioner access required"})
            data = self.body()
            if not isinstance(data, dict) or set(data) != set(DEFAULT_SETTINGS):
                return self.json_response(400, {"error": "Invalid league settings"})
            if not all(isinstance(v, str) and 1 <= len(v.strip()) <= 80 for v in data.values()):
                return self.json_response(400, {"error": "Settings must be short text"})
            if data["scoring"] not in {"Full PPR", "Half PPR", "Standard"}:
                return self.json_response(400, {"error": "Invalid scoring"})
            if data["waivers"] != DEFAULT_SETTINGS["waivers"]:
                return self.json_response(400, {"error": "Waiver processing is fixed to rolling priority"})
            db.execute("UPDATE league_settings SET settings_json=? WHERE id=1", (json.dumps(data),))
            db.commit()
            return self.json_response(200, {"settings": data})
        if path == "/api/players" and method == "GET":
            available = available_ids(db)
            rows = db.execute("SELECT * FROM players ORDER BY name").fetchall()
            return self.json_response(200, {"available": [
                {"playerId": r["id"], "name": r["name"], "position": r["position"], "nflTeam": r["nfl_team"]}
                for r in rows if r["id"] in available
            ]})
        if path == "/api/players" and method == "POST":
            if account["role"] != "commissioner":
                return self.json_response(403, {"error": "Commissioner access required"})
            data = self.body()
            name = str(data.get("name", "")).strip()
            position = data.get("position")
            nfl_team = str(data.get("nflTeam", "")).strip().upper()
            if not 1 <= len(name) <= 70 or position not in POSITIONS or not 2 <= len(nfl_team) <= 3:
                return self.json_response(400, {"error": "Invalid player details"})
            player_id = "custom-" + secrets.token_hex(12)
            db.execute(
                "INSERT INTO players(id,name,position,nfl_team) VALUES(?,?,?,?)",
                (player_id, name, position, nfl_team),
            )
            db.commit()
            return self.json_response(201, {"player": {
                "playerId": player_id, "name": name, "position": position, "nflTeam": nfl_team,
            }})
        if path == "/api/waivers" and method == "GET":
            rows = db.execute(
                """SELECT c.*,p.name AS player_name,p.position,p.nfl_team
                   FROM waiver_claims c JOIN players p ON p.id=c.player_id
                   WHERE c.account_id=? ORDER BY c.id DESC LIMIT 100""",
                (account["id"],),
            ).fetchall()
            return self.json_response(200, {"claims": [{
                "id": r["id"], "playerId": r["player_id"], "playerName": r["player_name"],
                "position": r["position"], "dropPlayerId": r["drop_player_id"],
                "status": r["status"], "reason": r["reason"],
            } for r in rows]})
        if path == "/api/waivers" and method == "POST":
            data = self.body()
            player_id = str(data.get("playerId", ""))
            drop_id = str(data.get("dropPlayerId", ""))
            if player_id not in available_ids(db):
                return self.json_response(400, {"error": "Player is not currently available"})
            roster = json.loads(account["roster_json"])
            dropped = next((p for p in roster if p["playerId"] == drop_id), None)
            player = db.execute("SELECT * FROM players WHERE id=?", (player_id,)).fetchone()
            if not dropped:
                return self.json_response(400, {"error": "Drop player is not on your team"})
            slot = dropped["slot"]
            if slot not in {"BN", "IR", player["position"]} and not (
                slot == "FLEX" and player["position"] in {"RB", "WR", "TE"}
            ):
                return self.json_response(400, {"error": "Claimed player cannot fill the drop player's slot"})
            pending = db.execute(
                "SELECT COUNT(*) FROM waiver_claims WHERE account_id=? AND status='pending'",
                (account["id"],),
            ).fetchone()[0]
            if pending >= 5:
                return self.json_response(400, {"error": "Maximum of five pending claims"})
            db.execute(
                "INSERT INTO waiver_claims(account_id,player_id,drop_player_id,created_at) VALUES(?,?,?,?)",
                (account["id"], player_id, drop_id, int(time.time())),
            )
            db.commit()
            return self.json_response(201, {"ok": True})
        if path.startswith("/api/waivers/") and method == "DELETE":
            claim_id = path.removeprefix("/api/waivers/")
            if not claim_id.isdigit():
                return self.json_response(404, {"error": "Claim not found"})
            changed = db.execute(
                "UPDATE waiver_claims SET status='cancelled' WHERE id=? AND account_id=? AND status='pending'",
                (claim_id, account["id"]),
            ).rowcount
            db.commit()
            return self.json_response(200 if changed else 404, {"ok": bool(changed)})
        if path == "/api/waivers/process" and method == "POST":
            if account["role"] != "commissioner":
                return self.json_response(403, {"error": "Commissioner access required"})
            return self.json_response(200, {"results": process_waivers(db)})
        if path.startswith("/api/admin/teams/") and path.endswith("/replace") and method == "POST":
            if account["role"] != "commissioner":
                return self.json_response(403, {"error": "Commissioner access required"})
            team_id = path.removeprefix("/api/admin/teams/").removesuffix("/replace")
            target = db.execute("SELECT * FROM accounts WHERE id=?", (team_id,)).fetchone()
            if not target:
                return self.json_response(404, {"error": "Team not found"})
            data = self.body()
            player_id = str(data.get("playerId", ""))
            drop_id = str(data.get("dropPlayerId", ""))
            version = data.get("version")
            if type(version) is not int or version != target["version"]:
                return self.json_response(409, {"error": "Team changed elsewhere; reload it before saving"})
            db.execute("BEGIN IMMEDIATE")
            if player_id not in available_ids(db):
                db.rollback()
                return self.json_response(400, {"error": "Player is not available"})
            roster = json.loads(target["roster_json"])
            index = next((i for i, player in enumerate(roster) if player["playerId"] == drop_id), None)
            if index is None:
                db.rollback()
                return self.json_response(400, {"error": "Drop player is not on that team"})
            player = db.execute("SELECT * FROM players WHERE id=?", (player_id,)).fetchone()
            slot = roster[index]["slot"]
            if slot not in {"BN", "IR", player["position"]} and not (
                slot == "FLEX" and player["position"] in {"RB", "WR", "TE"}
            ):
                db.rollback()
                return self.json_response(400, {"error": "Player cannot fill that slot"})
            roster[index] = {
                "playerId": player["id"], "name": player["name"],
                "position": player["position"], "nflTeam": player["nfl_team"], "slot": slot,
            }
            changed = db.execute(
                "UPDATE accounts SET roster_json=?,version=version+1 WHERE id=? AND version=?",
                (json.dumps(roster, ensure_ascii=False), team_id, version),
            ).rowcount
            if not changed:
                db.rollback()
                return self.json_response(409, {"error": "Team changed elsewhere; reload it before saving"})
            db.commit()
            updated = db.execute("SELECT * FROM accounts WHERE id=?", (team_id,)).fetchone()
            return self.json_response(200, {"team": public_account(updated), "roster": roster})
        if path.startswith("/api/teams/") and method in {"GET", "PUT"}:
            team_id = path.removeprefix("/api/teams/")
            row = db.execute("SELECT * FROM accounts WHERE id=?", (team_id,)).fetchone()
            if not row:
                return self.json_response(404, {"error": "Team not found"})
            if account["id"] != team_id and account["role"] != "commissioner":
                return self.json_response(403, {"error": "Team access denied"})
            if method == "GET":
                return self.json_response(200, {"team": public_account(row), "roster": json.loads(row["roster_json"])})
            data = self.body()
            roster = data.get("roster") if isinstance(data, dict) else None
            name = data.get("teamName") if isinstance(data, dict) else None
            version = data.get("version") if isinstance(data, dict) else None
            if not isinstance(name, str) or not 1 <= len(name.strip()) <= 64:
                return self.json_response(400, {"error": "Invalid team name"})
            if not roster_valid(json.loads(row["roster_json"]), roster):
                return self.json_response(400, {"error": "Roster players or positions do not match this team"})
            if type(version) is not int or version != row["version"]:
                return self.json_response(409, {"error": "Team changed elsewhere; reload it before saving"})
            players = {p["playerId"]: p for p in json.loads(row["roster_json"])}
            normalized = [{**players[entry["playerId"]], "slot": entry["slot"]} for entry in roster]
            changed = db.execute(
                "UPDATE accounts SET team_name=?,roster_json=?,version=version+1 WHERE id=? AND version=?",
                (name.strip(), json.dumps(normalized, ensure_ascii=False), team_id, version),
            ).rowcount
            if not changed:
                db.rollback()
                return self.json_response(409, {"error": "Team changed elsewhere; reload it before saving"})
            db.commit()
            updated = db.execute("SELECT * FROM accounts WHERE id=?", (team_id,)).fetchone()
            return self.json_response(200, {"team": public_account(updated), "roster": normalized})
        return self.json_response(404, {"error": "Not found"})

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def do_DELETE(self):
        self.route("DELETE")

    def log_message(self, format_string, *args):
        # Avoid request headers, passwords, and session cookies in logs.
        print("%s %s" % (self.address_string(), format_string % args), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", action="store_true")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.seed:
        seed_database(os.environ.get("ELYSIAN_SEED_PASSWORD", ""))
    else:
        if not DB_PATH.exists():
            raise SystemExit(f"Database missing: {DB_PATH}")
        threading.Thread(target=daily_waiver_worker, daemon=True).start()
        ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
