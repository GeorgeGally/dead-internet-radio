#!/bin/sh
# Start the ACE-Step API server with memory-safe defaults.
#
# Why: on Apple Silicon, ACE-Step keeps the whole model stack resident in
# unified memory, and without ACESTEP_SAVE_MEMORY=1 it also retains ~4-8 GB
# of intermediate tensors per generation — enough to OOM a 36 GB Mac.
cd "$(dirname "$0")/ACE-Step-1.5" || exit 1
ACESTEP_SAVE_MEMORY=1 CHECK_UPDATE=false exec uv run acestep-api "$@"
