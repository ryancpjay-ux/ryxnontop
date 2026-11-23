#!/usr/bin/env python3
"""Turn collected Ranked games into the stats the draft tool loads.

Two layers:

1. Display stats (what players read): raw win/pick/ban counts and a win rate
   adjusted for sample size (shrunk toward the mode, then overall, then 50%).

2. Draft model (what ranks picks): one regularized logistic regression fitted on
   every game at once. A draft's score for team X vs team Y is

       sum over X of strength(brawler, map) - same for Y
     + sum over every X-vs-Y pair of matchup(a, b)
     + sum over X pairs of synergy(a, b) - same for Y pairs

   win chance = 1 / (1 + e^-score). Strength = overall + mode + map terms,
   matchup = overall + mode terms, synergy = overall. Each term has its own L2
   penalty, so thin samples stay close to zero (no "12 games, 80% win" outliers).
   Fitting everything jointly avoids double counting: a brawler that only looks
   good because it's always paired with a strong teammate gets credited correctly.

   Accuracy is measured on 10% of games the model never saw and shipped with the
   stats, so the tool can say how much to trust it.

Usage:
  pip install numpy scipy
  python3 build_stats.py --games battles.jsonl --brawlers brawlers.json \
      --map-ids map_eids.json --out ../web/data
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import math
import os

import numpy as np
from scipy import sparse
from scipy.optimize import minimize

# L2 penalties for the joint draft model (tuned on held-out games, Nov 2026 data).
PENALTY = {"g": 4, "mode": 40, "map": 120, "vs": 120, "vsm": 400, "syn": 120}

K_GLOBAL = 60   # shrink brawler win rate toward 50%
K_MODE = 40     # shrink mode win rate toward global
K_MAP = 40      # shrink map win rate toward mode
K_VS = 40       # shrink matchup toward "no interaction"
K_SYN = 40      # shrink synergy toward "no interaction"

MODE_NAMES = {
    "gemGrab": "Gem Grab", "brawlBall": "Brawl Ball", "heist": "Heist", "bounty": "Bounty",
    "knockout": "Knockout", "hotZone": "Hot Zone", "wipeout": "Wipeout", "basketBrawl": "Basket Brawl",
}

# Ranked tiers as the API reports them on a player's brawler (1 = Bronze I ... 22 = Pro).
RANKS = ["Bronze", "Silver", "Gold", "Diamond", "Mythic", "Legendary", "Masters"]


def rank_name(tier: int) -> str:
    if tier >= 22:
        return "Pro"
    t = max(tier, 1) - 1
    return f"{RANKS[min(t // 3, 6)]} {'I' * (t % 3 + 1)}"


BUCKETS = [
    # key, label, min average tier of the six players
    ("all", "All ranks", 0),
    ("legendary", "Legendary+", 16),
    ("masters", "Masters+", 19),
]


def logit(p: float) -> float:
    p = min(max(p, 1e-6), 1 - 1e-6)
    return math.log(p / (1 - p))


def sig(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def pretty_name(raw: str) -> str:
    def word(w: str) -> str:
        return "-".join(p[:1].upper() + p[1:].lower() for p in w.split("-"))
    return " ".join(word(w) for w in raw.split(" "))


class Counts:
    """Raw win/pick/ban counts for one set of games."""

    def __init__(self, n_brawlers: int):
        self.nb = n_brawlers
        self.games = 0
        self.g = np.zeros((n_brawlers, 3))  # picks, wins, bans
        self.mode_games = collections.Counter()
        self.mode = collections.defaultdict(lambda: np.zeros((n_brawlers, 3)))
        self.map_games = collections.Counter()
        self.map_mode = {}
        self.map = collections.defaultdict(lambda: np.zeros((n_brawlers, 3)))
        self.vs = np.zeros((n_brawlers, n_brawlers, 2))  # [a,b] -> games, wins of a
        self.vs_mode = collections.defaultdict(lambda: np.zeros((n_brawlers, n_brawlers, 2)))
        self.syn = np.zeros((n_brawlers, n_brawlers, 2))  # symmetric, games, wins

    def add(self, g: dict) -> None:
        teams, w, mode, mp = g["t"], g["winner"], g["mode"], g["map"]
        self.games += 1
        self.mode_games[mode] += 1
        self.map_games[mp] += 1
        self.map_mode[mp] = mode
        mrow, prow = self.mode[mode], self.map[mp]
        for b in g["bans"]:
            self.g[b, 2] += 1
            mrow[b, 2] += 1
            prow[b, 2] += 1
        vm = self.vs_mode[mode]
        for ti in (0, 1):
            win = 1.0 if ti == w else 0.0
            team = teams[ti]
            for b in team:
                for arr in (self.g, mrow, prow):
                    arr[b, 0] += 1
                    arr[b, 1] += win
            for i in range(3):
                for j in range(i + 1, 3):
                    a, b = team[i], team[j]
                    self.syn[a, b, 0] += 1
                    self.syn[a, b, 1] += win
                    self.syn[b, a, 0] += 1
                    self.syn[b, a, 1] += win
        for a in teams[0]:
            for b in teams[1]:
                a_win = 1.0 if w == 0 else 0.0
                for arr in (self.vs, vm):
                    arr[a, b, 0] += 1
                    arr[a, b, 1] += a_win
                    arr[b, a, 0] += 1
                    arr[b, a, 1] += 1.0 - a_win


class Model:
    """Shrunk log-odds estimates derived from Counts."""

    def __init__(self, c: Counts):
        self.c = c
        n, w = c.g[:, 0], c.g[:, 1]
        self.gL = np.log((w + 0.5 * K_GLOBAL) / (n - w + 0.5 * K_GLOBAL))
        gp = 1 / (1 + np.exp(-self.gL))
        self.modeL = {}
        for m, arr in c.mode.items():
            p = (arr[:, 1] + K_MODE * gp) / (arr[:, 0] + K_MODE)
            self.modeL[m] = np.log(p / (1 - p))
        self.mapL = {}
        for mp, arr in c.map.items():
            prior = 1 / (1 + np.exp(-self.modeL[c.map_mode[mp]]))
            p = (arr[:, 1] + K_MAP * prior) / (arr[:, 0] + K_MAP)
            self.mapL[mp] = np.log(p / (1 - p))
        # Matchups: residual vs. strength difference (antisymmetric).
        diff = self.gL[:, None] - self.gL[None, :]
        e = 1 / (1 + np.exp(-diff))
        p = (c.vs[:, :, 1] + K_VS * e) / (c.vs[:, :, 0] + K_VS)
        self.vsG = np.log(p / (1 - p)) - diff
        self.vsM = {}
        for m, arr in c.vs_mode.items():
            ml = self.modeL[m]
            d = ml[:, None] - ml[None, :]
            e = 1 / (1 + np.exp(-(d + self.vsG)))
            p = (arr[:, :, 1] + K_VS * e) / (arr[:, :, 0] + K_VS)
            self.vsM[m] = np.log(p / (1 - p)) - d
        # Synergy: residual vs. summed strength (symmetric).
        s = self.gL[:, None] + self.gL[None, :]
        e = 1 / (1 + np.exp(-s))
        p = (c.syn[:, :, 1] + K_SYN * e) / (c.syn[:, :, 0] + K_SYN)
        self.synG = np.log(p / (1 - p)) - s

    def map_strength(self, mp: str, mode: str) -> np.ndarray:
        if mp in self.mapL:
            return self.mapL[mp]
        if mode in self.modeL:
            return self.modeL[mode]
        return self.gL

    def features(self, g: dict) -> tuple[float, float, float]:
        A, B = g["t"]
        L = self.map_strength(g["map"], g["mode"])
        V = self.vsM.get(g["mode"], self.vsG)
        f1 = sum(L[a] for a in A) - sum(L[b] for b in B)
        f2 = sum(V[a, b] for a in A for b in B)
        f3 = sum(self.synG[A[i], A[j]] - self.synG[B[i], B[j]] for i in range(3) for j in range(i + 1, 3))
        return f1, f2, f3


def fit_logistic(X: np.ndarray, y: np.ndarray, l2: float = 1.0, iters: int = 50) -> np.ndarray:
    """Newton's method logistic regression without intercept (team order is arbitrary)."""
    w = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-X @ w))
        grad = X.T @ (p - y) + l2 * w
        H = (X * (p * (1 - p))[:, None]).T @ X + l2 * np.eye(X.shape[1])
        step = np.linalg.solve(H, grad)
        w -= step
        if np.abs(step).max() < 1e-8:
            break
    return w


def evaluate(X: np.ndarray, y: np.ndarray, w: np.ndarray) -> dict:
    p = 1 / (1 + np.exp(-X @ w))
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return {
        "n": int(len(y)),
        "acc": round(float(((p > 0.5) == (y > 0.5)).mean()), 4),
        "logloss": round(float(-(y * np.log(p) + (1 - y) * np.log(1 - p)).mean()), 4),
        "brier": round(float(((p - y) ** 2).mean()), 4),
    }


def holdout_of(g: dict) -> int:
    return int(hashlib.md5(g["id"].encode()).hexdigest()[:4], 16) % 100


class JointModel:
    """Regularized logistic regression over brawler, map, matchup and synergy terms."""

    def __init__(self, nb: int, maps: list[str], modes: list[str]):
        self.nb = nb
        self.maps = {m: i for i, m in enumerate(maps)}
        self.modes = {m: i for i, m in enumerate(modes)}
        self.pair = {}
        for a in range(nb):
            for b in range(a + 1, nb):
                self.pair[(a, b)] = len(self.pair)
        npair = len(self.pair)
        self.off_g = 0
        self.off_mode = nb
        self.off_map = self.off_mode + len(modes) * nb
        self.off_vs = self.off_map + len(maps) * nb
        self.off_vsm = self.off_vs + npair
        self.off_syn = self.off_vsm + len(modes) * npair
        self.nf = self.off_syn + npair
        self.w = np.zeros(self.nf)

    def matrix(self, games: list[dict]):
        nb, npair = self.nb, len(self.pair)
        rows, cols, vals = [], [], []
        for r, g in enumerate(games):
            A, B = g["t"]
            mo = self.modes.get(g["mode"])
            mp = self.maps.get(g["map"])
            for s, team in ((1.0, A), (-1.0, B)):
                for b in team:
                    rows.append(r); cols.append(self.off_g + b); vals.append(s)
                    if mo is not None:
                        rows.append(r); cols.append(self.off_mode + mo * nb + b); vals.append(s)
                    if mp is not None:
                        rows.append(r); cols.append(self.off_map + mp * nb + b); vals.append(s)
                for i in range(3):
                    for j in range(i + 1, 3):
                        a, b = sorted((team[i], team[j]))
                        rows.append(r); cols.append(self.off_syn + self.pair[(a, b)]); vals.append(s)
            for a in A:
                for b in B:
                    k, s = (self.pair[(a, b)], 1.0) if a < b else (self.pair[(b, a)], -1.0)
                    rows.append(r); cols.append(self.off_vs + k); vals.append(s)
                    if mo is not None:
                        rows.append(r); cols.append(self.off_vsm + mo * npair + k); vals.append(s)
        X = sparse.csr_matrix((vals, (rows, cols)), shape=(len(games), self.nf))
        y = np.array([1.0 if g["winner"] == 0 else 0.0 for g in games])
        return X, y

    def penalties(self) -> np.ndarray:
        pen = np.empty(self.nf)
        pen[self.off_g:self.off_mode] = PENALTY["g"]
        pen[self.off_mode:self.off_map] = PENALTY["mode"]
        pen[self.off_map:self.off_vs] = PENALTY["map"]
        pen[self.off_vs:self.off_vsm] = PENALTY["vs"]
        pen[self.off_vsm:self.off_syn] = PENALTY["vsm"]
        pen[self.off_syn:] = PENALTY["syn"]
        return pen

    def fit(self, games: list[dict]) -> "JointModel":
        X, y = self.matrix(games)
        pen = self.penalties()

        def f(w):
            z = X @ w
            loss = (np.logaddexp(0, -z) * y + np.logaddexp(0, z) * (1 - y)).sum() + 0.5 * (pen * w * w).sum()
            grad = X.T @ (1 / (1 + np.exp(-z)) - y) + pen * w
            return loss, grad

        res = minimize(f, np.zeros(self.nf), jac=True, method="L-BFGS-B", options={"maxiter": 800})
        self.w = res.x
        return self

    def evaluate(self, games: list[dict]) -> dict:
        X, y = self.matrix(games)
        p = np.clip(1 / (1 + np.exp(-(X @ self.w))), 1e-6, 1 - 1e-6)
        return {
            "n": int(len(y)),
            "acc": round(float(((p > 0.5) == (y > 0.5)).mean()), 4),
            "logloss": round(float(-(y * np.log(p) + (1 - y) * np.log(1 - p)).mean()), 4),
            "brier": round(float(((p - y) ** 2).mean()), 4),
        }

    # --- read back the fitted terms ---
    def strength(self, b: int, mode: str | None = None, mp: str | None = None) -> float:
        v = self.w[self.off_g + b]
        if mode in self.modes:
            v += self.w[self.off_mode + self.modes[mode] * self.nb + b]
        if mp in self.maps:
            v += self.w[self.off_map + self.maps[mp] * self.nb + b]
        return float(v)

    def matchup(self, a: int, b: int, mode: str | None = None) -> float:
        """Edge of a against b (a < b)."""
        k = self.pair[(a, b)]
        v = self.w[self.off_vs + k]
        if mode in self.modes:
            v += self.w[self.off_vsm + self.modes[mode] * len(self.pair) + k]
        return float(v)

    def synergy(self, a: int, b: int) -> float:
        return float(self.w[self.off_syn + self.pair[(a, b)]])


def build_bucket(games: list[dict], nb: int, maps: list[str]) -> tuple[Model, JointModel, dict]:
    modes = sorted({g["mode"] for g in games})
    # 1) Accuracy on games the model never saw.
    train = [g for g in games if holdout_of(g) >= 10]
    test = [g for g in games if holdout_of(g) < 10]
    ev = ev_map = None
    if len(test) > 300:
        ev = JointModel(nb, maps, modes).fit(train).evaluate(test)
        # Baseline for comparison: map win rates only (shrinkage model, one fitted weight).
        ct = Counts(nb)
        for g in train:
            ct.add(g)
        mt = Model(ct)
        Xm = np.array([[mt.features(g)[0]] for g in test])
        ym = np.array([1.0 if g["winner"] == 0 else 0.0 for g in test])
        half = len(test) // 2  # fit the one weight on half the held-out games, score the other half
        ev_map = evaluate(Xm[half:], ym[half:], fit_logistic(Xm[:half], ym[:half]))
    # 2) Final model and display stats on every game.
    joint = JointModel(nb, maps, modes).fit(games)
    c = Counts(nb)
    for g in games:
        c.add(g)
    return Model(c), joint, {"eval": ev, "evalMapOnly": ev_map}


def r(x: float, d: int = 3) -> float:
    return round(float(x), d)


def export_bucket(model: Model, joint: JointModel, fit: dict, maps: list[str], games: list[dict]) -> dict:
    """Arrays are [picks, wins, bans, adjusted win-rate logit, draft-model score]."""
    c = model.c
    nb = c.nb
    present = [i for i in range(nb) if c.g[i, 0] > 0]
    out = {
        "games": c.games,
        "from": min(g["time"] for g in games) if games else None,
        "to": max(g["time"] for g in games) if games else None,
        "model": "joint-logistic",
        "coef": {"map": 1, "vs": 1, "syn": 1},
        "eval": fit["eval"],
        "evalMapOnly": fit["evalMapOnly"],
        "global": {i: [int(c.g[i, 0]), int(c.g[i, 1]), int(c.g[i, 2]), r(model.gL[i]), r(joint.strength(i), 4)] for i in present},
        "modes": {},
        "maps": {},
        "vs": {},
        "syn": {},
    }
    for m in c.mode:
        out["modes"][m] = {
            "games": c.mode_games[m],
            "b": {i: [int(c.mode[m][i, 0]), int(c.mode[m][i, 1]), int(c.mode[m][i, 2]), r(model.modeL[m][i]), r(joint.strength(i, m), 4)] for i in present},
        }
    for mp in maps:
        if mp not in c.map:
            continue
        arr, L, mode = c.map[mp], model.mapL[mp], c.map_mode[mp]
        out["maps"][mp] = {
            "games": c.map_games[mp],
            "mode": mode,
            "b": {i: [int(arr[i, 0]), int(arr[i, 1]), int(arr[i, 2]), r(L[i]), r(joint.strength(i, mode, mp), 4)] for i in present},
        }

    def pairs(n_arr: np.ndarray, w_arr: np.ndarray, score, min_n: int) -> dict:
        res = {}
        for a in present:
            for b in present:
                if b <= a:
                    continue
                n = n_arr[a, b]
                if n < min_n:
                    continue
                res[f"{a},{b}"] = [int(n), int(w_arr[a, b]), r(score(a, b), 4)]
        return res

    out["vs"]["_all"] = pairs(c.vs[:, :, 0], c.vs[:, :, 1], lambda a, b: joint.matchup(a, b), 3)
    for m, arr in c.vs_mode.items():
        out["vs"][m] = pairs(arr[:, :, 0], arr[:, :, 1], lambda a, b, m=m: joint.matchup(a, b, m), 3)
    out["syn"] = pairs(c.syn[:, :, 0], c.syn[:, :, 1], lambda a, b: joint.synergy(a, b), 3)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", required=True)
    ap.add_argument("--brawlers", required=True, help="/v1/brawlers response")
    ap.add_argument("--map-ids", help="JSON {map name: event id} for map images")
    ap.add_argument("--out", required=True)
    ap.add_argument("--days", type=int, default=21, help="only use games from the last N days of data")
    ap.add_argument("--min-map-share", type=float, default=0.01, help="drop maps below this share of games")
    args = ap.parse_args()

    brawlers = json.load(open(args.brawlers, encoding="utf-8"))["items"]
    brawlers.sort(key=lambda b: b["id"])
    idx = {b["id"]: i for i, b in enumerate(brawlers)}
    map_ids = json.load(open(args.map_ids, encoding="utf-8")) if args.map_ids else {}

    raw = []
    with open(args.games, encoding="utf-8") as f:
        for line in f:
            try:
                raw.append(json.loads(line))
            except ValueError:
                pass
    latest = max(g["time"] for g in raw)
    cutoff = (dt.datetime.strptime(latest[:8], "%Y%m%d") - dt.timedelta(days=args.days)).strftime("%Y%m%d")

    games = []
    skipped = collections.Counter()
    for g in raw:
        if g["time"][:8] < cutoff:
            skipped["old"] += 1
            continue
        try:
            t = [[idx[b] for b in team] for team in g["teams"]]
        except KeyError:
            skipped["unknown brawler"] += 1
            continue
        if len({b for team in t for b in team}) != 6:
            skipped["duplicate pick"] += 1
            continue
        tiers = [x for team in g["tiers"] for x in team]
        games.append({
            "id": g["id"], "time": g["time"], "map": g["map"], "mode": g["mode"], "t": t,
            "bans": sorted({idx[b] for team in g["bans"] for b in team if b in idx}),
            "winner": g["winner"], "tier": sum(tiers) / len(tiers),
        })
    print(f"[stats] {len(games)} games used, skipped {dict(skipped)}")

    map_counts = collections.Counter(g["map"] for g in games)
    map_mode = {g["map"]: g["mode"] for g in games}
    maps = [m for m, n in map_counts.items() if n >= max(50, args.min_map_share * len(games))]
    maps.sort(key=lambda m: (MODE_NAMES.get(map_mode[m], map_mode[m]), m))

    os.makedirs(args.out, exist_ok=True)
    bucket_meta = []
    for key, label, min_tier in BUCKETS:
        bg = [g for g in games if g["tier"] >= min_tier]
        if len(bg) < 2000:
            print(f"[stats] bucket {key}: only {len(bg)} games, skipped")
            continue
        model, joint, fit = build_bucket(bg, len(brawlers), maps)
        data = export_bucket(model, joint, fit, maps, bg)
        path = os.path.join(args.out, f"stats-{key}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))
        bucket_meta.append({"key": key, "label": label, "minTier": min_tier, "minRank": rank_name(min_tier) if min_tier else None, "games": len(bg)})
        print(f"[stats] {key}: {len(bg)} games, eval={data['eval']}, mapOnly={data['evalMapOnly']}, {os.path.getsize(path) // 1024} KB")

    tier_hist = collections.Counter(round(g["tier"]) for g in games)
    meta = {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "source": "Official Brawl Stars API, Ranked battle logs",
        "games": len(games),
        "from": min(g["time"] for g in games),
        "to": max(g["time"] for g in games),
        "brawlers": [{"id": b["id"], "name": pretty_name(b["name"]), "img": f"img/brawlers/{b['id']}.webp"} for b in brawlers],
        "maps": [
            {"name": m, "mode": map_mode[m], "modeName": MODE_NAMES.get(map_mode[m], map_mode[m]), "games": map_counts[m],
             "img": f"img/maps/{map_ids[m]}.webp" if m in map_ids else None}
            for m in maps
        ],
        "modes": {m: MODE_NAMES.get(m, m) for m in sorted({map_mode[m] for m in maps})},
        "buckets": bucket_meta,
        "ranks": {str(t): rank_name(t) for t in range(1, 23)},
        "tierHistogram": {rank_name(t): n for t, n in sorted(tier_hist.items())},
        "smoothing": {"global": K_GLOBAL, "mode": K_MODE, "map": K_MAP, "vs": K_VS, "syn": K_SYN},
        "penalty": PENALTY,
    }
    with open(os.path.join(args.out, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))
    print(f"[stats] wrote meta.json with {len(maps)} maps and {len(bucket_meta)} rank buckets")


if __name__ == "__main__":
    main()
