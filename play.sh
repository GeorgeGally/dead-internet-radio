#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Dead Internet Radio ==="
echo

# Generate tracks
echo "--- GENERATE ---"
python3 "$DIR/generate.py" "$@"
echo

# Build site
echo "--- BUILD SITE ---"
python3 "$DIR/build_site.py" --shows-only
echo

echo "Done. dist/ is ready."
