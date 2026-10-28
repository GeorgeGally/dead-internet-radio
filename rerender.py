#!/usr/bin/env python3
"""Re-render one song with the station's notes.

The producer (an LLM) rewrites the song's caption, lyrics, tempo, key and
length from the notes; ACE-Step renders it again. The new audio takes the old
file's name, and the old audio and prompt log move to <show>/.replaced/, so
nothing is lost and the show keeps its track order.

    python rerender.py --track-json tmp/rerenders/rerender-1.json [--stop-ace-step]

The track JSON: {"file": "output/<show>/<NN-name>.mp3", "artist", "title",
"instructions"}. Prints "Rerendered: <file>" and "Spec: <json>" at the end.
"""
import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

import generate as g

RERENDER_PROMPT_PATH = g.PROMPTS_DIR / "rerender.md"


def main():
    parser = argparse.ArgumentParser(description="Re-render one Dead Internet Radio song with notes")
    parser.add_argument("--track-json", required=True)
    parser.add_argument("--stop-ace-step", action="store_true", help="Stop ACE-Step after rendering")
    args = parser.parse_args()

    spec = json.loads(Path(args.track_json).read_text())
    src = Path(spec["file"])
    if not src.exists():
        print(f"No audio at {src}", file=sys.stderr)
        sys.exit(1)
    log_path = src.parent / "prompts" / f"{src.stem}.prompt.json"
    log = json.loads(log_path.read_text()) if log_path.exists() else {}
    old = log.get("payload") or {}
    notes = str(spec.get("instructions") or "").strip()

    print(f"1. Producer rewriting {spec['artist']} — {spec['title']}...", flush=True)
    print(f"   Notes: {notes}")
    message = (
        f"Artist: {spec['artist']}\nTitle: {spec['title']}\n"
        f"Caption: {old.get('caption', '')}\nLyrics:\n{old.get('lyrics', '[Instrumental]')}\n"
        f"BPM: {old.get('bpm')}\nKey: {old.get('keyscale', '')}\nDuration: {old.get('duration')}\n\n"
        f"Notes: {notes}"
    )
    new = g.extract_json(g.call_llm(g.load_prompt(RERENDER_PROMPT_PATH), message))
    duration = int(new.get("duration") or old.get("duration") or 150)
    song = {
        "title": spec["title"],
        "artist": spec["artist"],
        "caption": str(new.get("caption") or old.get("caption") or ""),
        "lyrics": str(new.get("lyrics") or old.get("lyrics") or "[Instrumental]"),
        "bpm": new.get("bpm") or old.get("bpm"),
        "keyscale": str(new.get("keyscale") or old.get("keyscale") or ""),
        "duration": min(max(duration, g.MIN_TRACK_SECONDS), g.MAX_TRACK_SECONDS),
    }
    print(f"   {song['bpm']} BPM, {song['keyscale']}, {song['duration']}s")
    print(f"   {song['caption']}")

    ok, err = g.check_ace_step_health()
    if not ok:
        print(f"ACE-Step not reachable ({err})", file=sys.stderr)
        sys.exit(1)

    g.emit_progress({"type": "track_start", "number": 1, "total": 1,
                     "title": song["title"], "artist": song["artist"]})
    print("2. Sending to ACE-Step...", flush=True)
    task_id = g.call_ace_step(song)
    result = g.poll_ace_step(task_id, track_number=1, total_tracks=1, estimated_duration=song["duration"])
    audio_path = json.loads(result["result"])[0]["file"]

    # Render to a temporary name first: the old file only moves once the new
    # one is safely on disk.
    fresh = src.with_name(f".rerender-{src.name}")
    g.download_audio(audio_path, fresh)
    if args.stop_ace_step:
        g.stop_ace_step()
    if not fresh.exists() or fresh.stat().st_size < 1000:
        print("Render produced no audio", file=sys.stderr)
        sys.exit(1)

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    replaced = src.parent / ".replaced"
    replaced.mkdir(exist_ok=True)
    shutil.move(src, replaced / f"{src.stem}-{stamp}{src.suffix}")
    if log_path.exists():
        shutil.copy2(log_path, replaced / f"{src.stem}-{stamp}.prompt.json")
    fresh.rename(src)

    log.update({"payload": {**old, **song}, "rerender": {"at": stamp, "notes": notes}})
    log_path.parent.mkdir(exist_ok=True)
    log_path.write_text(json.dumps(log, indent=2))

    g.emit_progress({"type": "track_done", "number": 1, "total": 1,
                     "title": song["title"], "artist": song["artist"], "file": str(src)})
    print(f"Rerendered: {src}")
    print(f"Spec: {json.dumps(song)}")


if __name__ == "__main__":
    main()
