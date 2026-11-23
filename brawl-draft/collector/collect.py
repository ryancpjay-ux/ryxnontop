#!/usr/bin/env python3
"""Collect Brawl Stars Ranked (draft) battles from the official API.

How it works
------------
1. Seed player tags from the global and per-country trophy leaderboards.
2. Fetch each player's battle log (their last 25 battles).
3. Keep only Ranked draft games (battle.type == "soloRanked").
4. Snowball: every player seen in a kept Ranked game is queued too, so the crawl
   quickly moves from "high trophy players" to "people who actually play Ranked".
5. Each game is stored once (deduped by time + the six player tags).

Output is JSON Lines, one game per line:
  {"id", "time", "map", "eid", "mode", "teams": [[id,id,id],[id,id,id]],
   "bans": [[id|null x3],[...]], "tiers": [[int x3],[...]], "tags": [[tag x3],[...]],
   "winner": 0|1, "dur"}

Auth
----
* Default base URL is the RoyaleAPI proxy (https://bsproxy.royaleapi.dev/v1), which
  needs an API key whitelisted for IP 45.79.218.79.
* If BRAWL_STARS_API_KEY is set it is sent as a Bearer token. In a Claude cloud
  session the network proxy injects the saved key, so leave it unset there.
* Running on your own computer with a key whitelisted for your own IP:
    BRAWL_API_BASE=https://api.brawlstars.com/v1 BRAWL_STARS_API_KEY=... python3 collect.py

Only the Python standard library is used.
"""

from __future__ import annotations

import argparse
import collections
import heapq
import itertools
import json
import os
import random
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED

DEFAULT_BASE = "https://bsproxy.royaleapi.dev/v1"

# Countries with big Brawl Stars player bases. Each leaderboard returns up to 200 players.
DEFAULT_COUNTRIES = (
    "US,BR,MX,DE,FR,ES,IT,GB,TR,RU,UA,PL,NL,BE,PT,AR,CL,CO,PE,VE,EC,CA,AU,JP,KR,TW,HK,CN,"
    "VN,TH,ID,MY,PH,SG,IN,PK,SA,AE,EG,MA,DZ,TN,IL,IR,IQ,KZ,RO,HU,CZ,SK,AT,CH,SE,NO,DK,FI,"
    "GR,BG,RS,HR,BY,LT,LV,EE,UZ,AZ,GE,AM,DO,BO,PY,UY,CR,GT,NZ,ZA,NG,KW,QA,JO,LB"
)


class Api:
    def __init__(self, base: str, key: str | None, rps: float):
        self.base = base.rstrip("/")
        self.key = key
        self.min_interval = 1.0 / rps if rps > 0 else 0
        self._lock = threading.Lock()
        self._next_at = 0.0
        self.calls = 0
        self.errors = collections.Counter()

    def _throttle(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait_for = self._next_at - now
            self._next_at = max(now, self._next_at) + self.min_interval
        if wait_for > 0:
            time.sleep(wait_for)

    def get(self, path: str, retries: int = 4):
        url = self.base + path
        headers = {"Accept": "application/json", "User-Agent": "brawl-draft-collector/1.0"}
        if self.key:
            headers["Authorization"] = "Bearer " + self.key
        delay = 1.0
        for attempt in range(retries + 1):
            self._throttle()
            self.calls += 1
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return json.load(resp)
            except urllib.error.HTTPError as e:
                self.errors[e.code] += 1
                if e.code == 404:
                    return None
                if e.code in (401, 403):
                    body = e.read().decode("utf-8", "ignore")[:300]
                    raise SystemExit(f"API refused the request ({e.code}). Check the key / IP whitelist.\n{body}")
                if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                    time.sleep(delay + random.random())
                    delay *= 2
                    continue
                return None
            except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as e:
                self.errors[type(e).__name__] += 1
                if attempt < retries:
                    time.sleep(delay + random.random())
                    delay *= 2
                    continue
                return None
        return None


def tag_path(tag: str) -> str:
    return urllib.parse.quote(tag if tag.startswith("#") else "#" + tag, safe="")


def normalize(item: dict, owner_tag: str) -> tuple[dict | None, list[tuple[str, int]]]:
    """Turn a battle-log entry into a compact game record. Returns (game, participants)."""
    battle = item.get("battle") or {}
    if battle.get("type") != "soloRanked":
        return None, []
    teams = battle.get("teams")
    if not teams or len(teams) != 2 or any(len(t) != 3 for t in teams):
        return None, []
    result = battle.get("result")
    if result not in ("victory", "defeat"):
        return None, []  # draws / missing results carry no win signal

    owner_team = None
    participants = []
    picks, bans, tiers, tags, team_tags = [], [], [], [], []
    for ti, team in enumerate(teams):
        tp, tb, tt, tg = [], [], [], []
        for p in team:
            b = p.get("brawler") or {}
            if "id" not in b:
                return None, []
            tp.append(b["id"])
            tt.append(int(b.get("trophies") or 0))
            ban = p.get("bannedBrawler") or {}
            tb.append(ban.get("id"))
            tags.append(p.get("tag", ""))
            tg.append(p.get("tag", ""))
            participants.append((p.get("tag", ""), int(b.get("trophies") or 0)))
            if p.get("tag") == owner_tag:
                owner_team = ti
        picks.append(tp)
        bans.append(tb)
        tiers.append(tt)
        team_tags.append(tg)
    if owner_team is None:
        return None, []

    winner = owner_team if result == "victory" else 1 - owner_team
    event = item.get("event") or {}
    time_str = item.get("battleTime", "")
    game = {
        "id": time_str + "|" + ",".join(sorted(tags)),
        "time": time_str,
        "map": event.get("map"),
        "eid": event.get("id"),
        "mode": event.get("mode") or battle.get("mode"),
        "teams": picks,
        "bans": bans,
        "tiers": tiers,
        "tags": team_tags,
        "winner": winner,
        "dur": battle.get("duration"),
    }
    if not game["map"]:
        return None, []
    return game, participants


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="battles.jsonl", help="games file (appended to; existing games are skipped)")
    ap.add_argument("--max-players", type=int, default=6000, help="stop after fetching this many battle logs")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--rps", type=float, default=12.0, help="max API requests per second")
    ap.add_argument("--min-tier", type=int, default=10, help="only snowball through players at or above this Ranked tier")
    ap.add_argument("--countries", default=DEFAULT_COUNTRIES, help="comma-separated country codes to seed from")
    ap.add_argument("--seed-limit", type=int, default=200, help="players per leaderboard (max 200)")
    ap.add_argument("--seed-file", help="extra player tags to crawl first, one per line")
    ap.add_argument("--no-leaderboards", action="store_true", help="skip seeding from trophy leaderboards")
    args = ap.parse_args()

    api = Api(os.environ.get("BRAWL_API_BASE", DEFAULT_BASE), os.environ.get("BRAWL_STARS_API_KEY"), args.rps)

    seen_games: set[str] = set()
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as f:
            for line in f:
                try:
                    seen_games.add(json.loads(line)["id"])
                except (ValueError, KeyError):
                    pass
    print(f"[collect] {len(seen_games)} games already in {args.out}", flush=True)

    # Players met in Ranked games go first, highest rank first: they are the ones who
    # actually play Ranked, and following them keeps the crawl at the top of the ladder.
    ranked_queue: list[tuple[int, int, str]] = []  # heap of (-tier, order, tag)
    seed_queue: collections.deque[str] = collections.deque()
    queued: set[str] = set()
    order = itertools.count()

    def enqueue(tag: str, tier: int | None) -> None:
        if tag and tag not in queued:
            queued.add(tag)
            if tier is None:
                seed_queue.append(tag)
            else:
                heapq.heappush(ranked_queue, (-tier, next(order), tag))

    if args.seed_file:
        with open(args.seed_file, encoding="utf-8") as f:
            for line in f:
                tag = line.strip()
                if tag:
                    enqueue(tag if tag.startswith("#") else "#" + tag, 99)
        print(f"[collect] {len(queued)} players from {args.seed_file}", flush=True)

    boards = [] if args.no_leaderboards else ["global"] + [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    for board in boards:
        data = api.get(f"/rankings/{board}/players?limit={args.seed_limit}")
        for p in (data or {}).get("items", []):
            enqueue(p.get("tag"), None)
    print(f"[collect] seeded {len(queued)} players from {len(boards)} leaderboards", flush=True)

    out = open(args.out, "a", encoding="utf-8")
    lock = threading.Lock()
    stats = collections.Counter()
    started = time.time()

    def work(tag: str) -> None:
        data = api.get(f"/players/{tag_path(tag)}/battlelog")
        new_games, new_players = [], []
        for item in (data or {}).get("items", []):
            game, participants = normalize(item, tag)
            if not game:
                continue
            stats["ranked_seen"] += 1
            new_games.append(game)
            new_players.extend((t, tier) for t, tier in participants if tier >= args.min_tier)
        with lock:
            stats["logs"] += 1
            for g in new_games:
                if g["id"] not in seen_games:
                    seen_games.add(g["id"])
                    out.write(json.dumps(g, separators=(",", ":")) + "\n")
                    stats["new_games"] += 1
            for t, tier in new_players:
                enqueue(t, tier)

    def next_tag() -> str | None:
        with lock:
            if ranked_queue:
                return heapq.heappop(ranked_queue)[2]
            if seed_queue:
                return seed_queue.popleft()
        return None

    fetched = 0
    last_report = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        running = set()
        while True:
            while len(running) < args.workers * 2 and fetched < args.max_players:
                tag = next_tag()
                if tag is None:
                    break
                running.add(pool.submit(work, tag))
                fetched += 1
            if not running:
                break
            done, running = wait(running, timeout=5, return_when=FIRST_COMPLETED)
            for fut in done:
                exc = fut.exception()
                if isinstance(exc, SystemExit):
                    raise exc
                if exc:
                    stats["worker_errors"] += 1
            if time.time() - last_report > 20:
                last_report = time.time()
                with lock:
                    out.flush()
                    el = time.time() - started
                    print(
                        f"[collect] logs={stats['logs']} new_games={stats['new_games']} total_games={len(seen_games)} "
                        f"queue={len(ranked_queue)}+{len(seed_queue)} calls={api.calls} "
                        f"rate={stats['logs'] / max(el, 1):.1f}/s errors={dict(api.errors)}",
                        flush=True,
                    )
    out.close()
    print(
        f"[collect] done: fetched {stats['logs']} logs, {stats['new_games']} new games, "
        f"{len(seen_games)} total, errors={dict(api.errors)} in {time.time() - started:.0f}s",
        flush=True,
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
