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
# Decoding to audio was the peak (~25 GB at ACE-Step's 36 GB-Mac defaults), so
# decode in the smallest chunks and move decoded audio off the GPU. The 4B LM
# plans each song; it sounds better than none or the 1.7B (sound lab 2026-10-24).
# ACESTEP_MPS_HALF (our ACE-Step patch) loads the models in bfloat16 instead of
# float32 on the Mac: ~23 GB loaded -> about half.
# ACESTEP_DROP_TORCH_DIT and ACESTEP_MLX_CACHE_LIMIT_GB (patches/ace-step-mlx-
# memory.patch) free the PyTorch DiT layers once MLX has its copy and stop MLX
# hoarding freed buffers: one-track peak 29 GB -> 22 GB (2026-10-25).
ACESTEP_SAVE_MEMORY=1 CHECK_UPDATE=false \
ACESTEP_MPS_HALF="${ACESTEP_MPS_HALF:-1}" \
ACESTEP_DROP_TORCH_DIT="${ACESTEP_DROP_TORCH_DIT:-1}" \
ACESTEP_MLX_CACHE_LIMIT_GB="${ACESTEP_MLX_CACHE_LIMIT_GB:-1}" \
ACESTEP_MLX_VAE_FP16="${ACESTEP_MLX_VAE_FP16:-1}" \
ACESTEP_INIT_LLM="${ACESTEP_INIT_LLM:-true}" \
ACESTEP_MLX_VAE_CHUNK="${ACESTEP_MLX_VAE_CHUNK:-96}" \
ACESTEP_VAE_DECODE_CHUNK_SIZE="${ACESTEP_VAE_DECODE_CHUNK_SIZE:-256}" \
ACESTEP_MPS_DECODE_OFFLOAD="${ACESTEP_MPS_DECODE_OFFLOAD:-1}" \
ACESTEP_LM_MODEL_PATH="${ACESTEP_LM_MODEL_PATH:-acestep-5Hz-lm-4B}" \
uv run acestep-api "$@"
