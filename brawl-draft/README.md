# Brawl Draft Lab

A Ranked draft assistant for Brawl Stars. You pick the map and who has first pick. As bans and
picks come in, it ranks your options by projected win chance, looking ahead to the rest of the
draft. The numbers come from real Ranked games pulled from the official Brawl Stars API.

## What it does

- **Bans:** each candidate is scored by re-running the draft without that brawler. It tells you
  when a brawler is better picked than banned, for example when you have first pick.
- **Picks:** ranked by your win chance once all six brawlers are in, assuming both teams keep
  drafting well (a minimax search with alpha-beta pruning over the remaining picks in 1-2-2-1 order).
- **Why:** every recommendation splits into map strength, counters against the enemy picks and
  synergy with your picks, each with its sample size. "Hard to counter" and "Counterable" badges
  show how much the next enemy pick can punish it.
- **Live odds:** projected win chance for the draft so far.
- **Map stats:** win, pick and ban rates per map. Select a brawler to see who it beats, who beats
  it and its best teammates in that mode.
- **Rank filter:** All ranks, Legendary+ and Masters+ (by the average rank of the six players).

## Layout

```
brawl-draft/
  collector/
    collect.py       # crawls Ranked battle logs from the API (stdlib only)
    build_stats.py   # turns games into web/data/*.json (numpy + scipy)
    refresh.sh       # collect + build in one go
  web/
    index.html       # the whole app (vanilla JS, no build step)
    data/            # generated: meta.json, stats-<rank>.json
    img/             # brawler portraits and map images
```

## Refreshing the data

You need a Brawl Stars API key from https://developer.brawlstars.com (My Account, then Create New Key).

**On your own computer:** whitelist your public IP on the key, then:

```sh
cd brawl-draft/collector
pip install numpy scipy
export BRAWL_API_BASE=https://api.brawlstars.com/v1
export BRAWL_STARS_API_KEY=your-key-here   # keep it out of git
./refresh.sh
```

**Through the RoyaleAPI proxy** (for machines whose IP changes, like cloud sessions): whitelist
`45.79.218.79` on the key and leave `BRAWL_API_BASE` unset. The default base is
`https://bsproxy.royaleapi.dev/v1`.

`refresh.sh` crawls about 20,000 player battle logs (roughly 20 minutes at the default 20
requests a second) and rebuilds `web/data`. Raw games go to `collector/raw/battles.jsonl`,
which git ignores. Re-running adds to it, and only the last 21 days are used.

To preview locally: `cd web && python3 -m http.server`, then open http://localhost:8000.

## The model, briefly

A draft's score is the sum of each brawler's strength on the map (overall + mode + map terms),
every cross-team matchup term, and every same-team synergy term. Win chance is the logistic of
that score. All terms are fitted together in one L2-regularized logistic regression, so thin
samples stay near zero. The build reports accuracy on 10% of games the model never saw. With
about 170k games that was 58% (map win rates alone: 57%, coin flip: 50%).
