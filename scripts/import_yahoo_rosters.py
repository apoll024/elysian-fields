"""Convert a saved Yahoo Starting Rosters page into Elysian's seed catalog.

Run locally with beautifulsoup4 installed. Never run the saved page's scripts.
"""
import argparse
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup


OWNERS = [
    ("balls deep", "Ryan"),
    ("Dumpster phoenix", "Gary"),
    ("Happy Gollodays!", "Rick"),
    ("Garbage Day", "Reo"),
    ("Joyzee Balwurs", "Kyle"),
    ("Little lebowski urban acheivers", "Jeff"),
    ("Str8UpLazy", "Joel"),
    ("Fumbling Drunkards", "Kunal"),
    ("1.21 Gigawatts", "Marko"),
    ("Caleb Me Maybe", "Jonny"),
]
PLAYER_RE = re.compile(r"([A-Za-z]{2,3}) - (QB|RB|WR|TE|K|DEF)")


def parse(path: Path) -> dict:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    tables = soup.select("table[id^='Tst-team-']")
    if len(tables) != len(OWNERS):
        raise ValueError(f"Expected {len(OWNERS)} team tables, found {len(tables)}")
    teams = []
    seen = set()
    for index, table in enumerate(tables):
        source_name = table.parent.select_one("p a.Grid-u").get_text(" ", strip=True)
        roster = []
        for row in table.select("tbody tr"):
            link = row.select_one("a.name[data-ys-playerid]")
            if link is None:
                raise ValueError(f"Player row missing in {source_name}")
            yahoo_id = link["data-ys-playerid"]
            if yahoo_id in seen:
                raise ValueError(f"Duplicate Yahoo player ID {yahoo_id}")
            seen.add(yahoo_id)
            matches = PLAYER_RE.findall(row.get_text(" ", strip=True))
            if len(matches) != 1:
                raise ValueError(f"Expected one team and position for {link['title']}: {matches}")
            nfl_team, position = matches[0]
            slot = row.select_one("td").get_text(" ", strip=True)
            if slot not in {"QB", "RB", "WR", "TE", "W/R/T", "K", "DEF", "BN", "IR"}:
                raise ValueError(f"Unexpected slot {slot}")
            roster.append({
                "playerId": yahoo_id,
                "name": link["title"],
                "position": position,
                "nflTeam": nfl_team.upper(),
                "slot": "FLEX" if slot == "W/R/T" else slot,
            })
        team_name, account_name = OWNERS[index]
        teams.append({
            "id": str(index + 1),
            "teamName": team_name,
            "accountName": account_name,
            "commissioner": account_name == "Ryan",
            "sourceTeamName": source_name,
            "roster": roster,
        })
    return {"source": "Yahoo Starting Rosters, Week 2, 2026", "teams": teams}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("html", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = parse(args.html)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(result['teams'])} teams and {sum(len(t['roster']) for t in result['teams'])} roster entries")
