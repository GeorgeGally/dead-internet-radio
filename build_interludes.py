#!/usr/bin/env python3
"""Build what the station says between shows.

The Announcer writes lines that fit any hour and Kokoro voices them; the station
ID clips join them at the same loudness as the music. The result is a show folder
of kind "interlude", which Rails books between shows (app/services/interlude.rb)
and never airs as a show. Needs Kokoro, not ACE-Step.

    python build_interludes.py [--count 60] [--dry-run]
"""
import argparse
import json
import random
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import generate as g

CLIPS_DIR = Path("public/station-ids")
STATION = "Dead Internet Radio"
BATCH = 12
MASTER = "adelay=300:all=1,apad=pad_dur=0.8,loudnorm=I=-14:TP=-1.5:LRA=7"


def write_lines(count: int) -> list[str]:
    announcer = g.load_prompt(g.ANNOUNCER_PROMPT_PATH)
    lines: list[str] = []
    for _ in range(count // BATCH + 4):
        if len(lines) >= count:
            break
        said = "\n".join(f"- {line}" for line in lines[-24:])
        reply = g.call_llm(
            announcer,
            f"TYPE: BETWEEN_SHOWS\n\nGenerate {BATCH} different lines. Return a JSON array of {BATCH} objects: "
            '{"type": "BETWEEN_SHOWS", "text": string}.' + (f"\n\nAlready said, don't repeat:\n{said}" if said else ""),
        )
        try:
            batch = g.extract_json_array(reply)
        except ValueError:
            print("  WARNING: could not parse that batch, asking again", flush=True)
            continue
        for item in batch:
            text = str(item.get("text", "")).strip().strip('"').strip("'").strip()
            if text and text not in lines:
                lines.append(text)
    return lines[:count]


def master(source: Path, dest: Path):
    """Small on purpose: a clip must load in a moment on a bad connection."""
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-af", MASTER,
                    "-ar", "44100", "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "96k", str(dest)], check=True)


def write_log(show_dir: Path, stem: str, title: str, text: str):
    (show_dir / "prompts" / f"{stem}.prompt.json").write_text(json.dumps({
        "type": "dj_announce", "text": text, "brief": "",
        "payload": {"title": title, "artist": STATION, "caption": f"{STATION} — {title}",
                    "bpm": None, "keyscale": "", "duration": 0},
    }, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Build the station's talk between shows")
    parser.add_argument("--count", type=int, default=60, help="Lines to write (default: 60)")
    parser.add_argument("--dry-run", action="store_true", help="Print the lines, write nothing")
    args = parser.parse_args()

    print(f"1. Announcer writing {args.count} lines...", flush=True)
    lines = write_lines(args.count)
    if not lines:
        print("The Announcer wrote nothing.", file=sys.stderr)
        sys.exit(1)
    for line in lines:
        print(f"   {line}")
    if args.dry_run:
        return

    show_dir = g.OUTPUT_DIR / f"between-shows-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    (show_dir / "prompts").mkdir(parents=True)
    (show_dir / "show.json").write_text(json.dumps(
        {"show_name": "Between Shows", "slot": "between shows", "dj_name": STATION, "kind": "interlude"}, indent=2))

    print(f"2. Kokoro voicing {len(lines)} lines...", flush=True)
    number = 0
    for line in lines:
        number += 1
        stem = f"{number:02d}-talk-{g.slugify(line, 40)}-dead-internet-radio"
        wav = show_dir / f"{stem}.wav"
        g.generate_announcement(line, wav, intensity=0.2 + random.random() * 0.2)
        if not wav.exists():
            number -= 1
            continue
        master(wav, show_dir / f"{stem}.mp3")
        wav.unlink()
        write_log(show_dir, stem, "Station Talk", line)

    print("3. Station ID clips...", flush=True)
    for clip in sorted(CLIPS_DIR.glob("id-*.wav")):
        number += 1
        stem = f"{number:02d}-station-{clip.stem}-dead-internet-radio"
        master(clip, show_dir / f"{stem}.mp3")
        write_log(show_dir, stem, "Station ID", "")

    print(f"\nShow folder: {show_dir}")


if __name__ == "__main__":
    main()
