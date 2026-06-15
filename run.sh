#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Dead Internet Radio ==="
echo

# Step 1: Generate tracks
echo "--- GENERATE ---"
python3 "$DIR/generate.py" "$@"

echo
echo "--- BUILD SITE ---"
python3 "$DIR/build_site.py"

echo
echo "Done. dist/ is ready."
