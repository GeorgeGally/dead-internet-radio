#!/bin/sh
# Kill ACE-Step before it can freeze the Mac.
#
# Why: on Apple Silicon a render that runs out of unified memory doesn't fail,
# it swaps until the machine locks up and needs a hard reset. A failed track
# can be resumed (generate.py --resume-dir); a frozen machine can't.
#
# Usage: ace-step-watchdog.sh [port]   (MIN_FREE_PCT=20 by default)
PORT="${1:-8001}"
MIN_FREE_PCT="${MIN_FREE_PCT:-20}"
LOG="$(dirname "$0")/log/ace_step_watchdog.log"
mkdir -p "$(dirname "$LOG")"

while :; do
  pids=$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null)
  if [ -n "$pids" ]; then
    free=$(memory_pressure 2>/dev/null | sed -n 's/.*free percentage: \([0-9]*\)%.*/\1/p')
    if [ -n "$free" ] && [ "$free" -lt "$MIN_FREE_PCT" ]; then
      echo "$(date '+%F %T') free=${free}% < ${MIN_FREE_PCT}% — killing ACE-Step ($pids)" >> "$LOG"
      kill -9 $pids 2>/dev/null
    fi
  fi
  sleep 2
done
