#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

mix_show() {
  local show_dir="$1"
  local show_name
  show_name=$(basename "$show_dir")
  echo "  Mixing: $show_name"
  python3 "$DIR/djmix.py" "$show_dir" --no-opening
}

if [ $# -eq 0 ]; then
  echo "--- MIX ALL SHOWS ---"
  for show_dir in "$DIR/output"/*-????????-??????/; do
    [ -d "$show_dir" ] || continue
    mix_show "$show_dir"
  done
else
  echo "--- MIX: $* ---"
  for arg in "$@"; do
    if [ -d "$arg" ]; then
      mix_show "$arg"
    elif [ -d "$DIR/output/$arg" ]; then
      mix_show "$DIR/output/$arg"
    else
      echo "  Not found: $arg" >&2
    fi
  done
fi
