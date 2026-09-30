#!/usr/bin/env bash
# render-show.sh <show-dir>
#
# Render a show one track per process: the ACE-Step server is started fresh
# for each missing track and killed when that track is done, so peak memory is
# a single song instead of the whole set.
#
# Overrides for testing (no real ACE-Step model is ever loaded here):
#   ACE_STEP_SERVER_CMD  command that starts the server; default is
#                        ACE-Step-1.5/start-ace-step.sh. Point it at a stub
#                        server to verify the loop without loading a model.
#   ACE_STEP_URL         base URL the server must answer on (default
#                        http://localhost:8001)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHOW_DIR="${1:-}"
if [ -z "$SHOW_DIR" ]; then
  echo "usage: render-show.sh <show-dir>" >&2
  exit 1
fi

export ACESTEP_SAVE_MEMORY=1
ACE_STEP_URL="${ACE_STEP_URL:-http://localhost:8001}"
SERVER_CMD="${ACE_STEP_SERVER_CMD:-$DIR/ACE-Step-1.5/start-ace-step.sh}"

# Missing tracks = track numbers from .resume_state.json whose NN-*.mp3 is not
# on disk (same rule generate.py uses to decide what to skip).
MISSING=()
while IFS= read -r n; do
  MISSING+=("$n")
done < <(python3 - "$SHOW_DIR" <<'PY'
import json, re, sys
from pathlib import Path
show = Path(sys.argv[1])
state = json.loads((show / ".resume_state.json").read_text())
nums = [t["number"] for t in state["track_history"]]
done = set()
for f in show.iterdir():
    m = re.match(r"^(\d{2})-.+\.mp3$", f.name)
    if m and int(m.group(1)) != 0 and "DJ-voice" not in f.name and "opening" not in f.name:
        done.add(int(m.group(1)))
for n in nums:
    if n not in done:
        print(n)
PY
)

if [ "${#MISSING[@]}" -eq 0 ]; then
  echo "[render-show] $SHOW_DIR: all tracks already rendered — nothing to do"
  exit 0
fi

echo "[render-show] $SHOW_DIR: ${#MISSING[@]} track(s) missing, rendering one per process"
for i in "${!MISSING[@]}"; do
  N="${MISSING[$i]}"
  restart=$((i + 1))
  echo "[render-show] Track $N: starting ACE-Step server (restart $restart/${#MISSING[@]})"
  $SERVER_CMD &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

  up=""
  for _ in $(seq 1 300); do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "[render-show] Track $N: server process exited before answering on $ACE_STEP_URL" >&2
      exit 1
    fi
    if curl -fsS --max-time 3 "$ACE_STEP_URL/health" 2>/dev/null | grep -q '"ok"'; then
      up=1
      break
    fi
    sleep 1
  done
  if [ -z "$up" ]; then
    echo "[render-show] Track $N: server never answered on $ACE_STEP_URL, aborting" >&2
    exit 1
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[render-show] Track $N: something answered on $ACE_STEP_URL but our server process is gone (port already in use?)" >&2
    exit 1
  fi

  python3 "$DIR/generate.py" --resume-dir "$SHOW_DIR" --only-track "$N"

  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  trap - EXIT
  echo "[render-show] Track $N: ACE-Step server stopped (restart $restart/${#MISSING[@]})"
done

echo "[render-show] Done: ${#MISSING[@]} track(s) rendered"