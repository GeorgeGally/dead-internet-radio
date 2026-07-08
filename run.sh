#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Dead Internet Radio ==="
echo

# Step 1: Generate tracks
echo "--- GENERATE ---"
python3 "$DIR/generate.py" "$@"

echo

# Step 2: Mix the latest show
echo "--- MIX ---"
LATEST=$(ls -dt "$DIR/output"/*-????????-??????/ 2>/dev/null | head -1)
if [ -n "$LATEST" ]; then
  python3 "$DIR/djmix.py" "$LATEST"
else
  echo "  No shows found to mix"
fi
echo

# Step 3: Build site
echo "--- BUILD SITE ---"
python3 "$DIR/build_site.py"

echo
echo "Done. dist/ and mixes/ are ready."
