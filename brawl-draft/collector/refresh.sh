#!/usr/bin/env bash
# Collect fresh Ranked games and rebuild the draft tool's data.
# Usage: ./refresh.sh [max player logs, default 20000]
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p raw
MAX="${1:-20000}"
BASE="${BRAWL_API_BASE:-https://bsproxy.royaleapi.dev/v1}"

curl -fsS ${BRAWL_STARS_API_KEY:+-H "Authorization: Bearer $BRAWL_STARS_API_KEY"} \
  "$BASE/brawlers" -o raw/brawlers.json

python3 collect.py --out raw/battles.jsonl --max-players "$MAX"

# Second pass: follow the highest-ranked players we found, so Masters+ has enough games.
python3 - <<'EOF'
import json
tags = set()
for line in open("raw/battles.jsonl", encoding="utf-8"):
    try:
        g = json.loads(line)
    except ValueError:
        continue
    if min(min(t) for t in g["tiers"]) >= 19:
        tags.update(g["id"].split("|")[1].split(","))
open("raw/top_seeds.txt", "w").write("\n".join(sorted(tags)))
print(f"[refresh] {len(tags)} Masters+ players to follow")
EOF
python3 collect.py --out raw/battles.jsonl --seed-file raw/top_seeds.txt --no-leaderboards \
  --min-tier 18 --max-players $((MAX / 3))

python3 build_stats.py --games raw/battles.jsonl --brawlers raw/brawlers.json \
  --map-ids map_eids.json --out ../web/data
echo "[refresh] done. New brawlers or maps need images in web/img (see README)."
