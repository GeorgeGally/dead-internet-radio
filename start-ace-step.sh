#!/bin/sh
# Start the ACE-Step API server with memory-safe defaults.
#
# Why: on Apple Silicon, ACE-Step keeps the whole model stack resident in
# unified memory, and without ACESTEP_SAVE_MEMORY=1 it also retains ~4-8 GB
# of intermediate tensors per generation — enough to OOM a 36 GB Mac.
ROOT="$(cd "$(dirname "$0")" && pwd)"
# Kills the server if free memory drops too low, instead of letting the Mac freeze.
"$ROOT/ace-step-watchdog.sh" "${ACE_STEP_PORT:-8001}" &
WATCHDOG=$!
trap 'kill $WATCHDOG 2>/dev/null' EXIT INT TERM
cd "$ROOT/ACE-Step-1.5" || exit 1
# The 4B LM is the biggest resident model; 1.7B is enough for mostly
# instrumental tracks. Override with ACESTEP_LM_MODEL_PATH.
ACESTEP_SAVE_MEMORY=1 CHECK_UPDATE=false \
ACESTEP_LM_MODEL_PATH="${ACESTEP_LM_MODEL_PATH:-acestep-5Hz-lm-1.7B}" \
uv run acestep-api "$@"
