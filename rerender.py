#!/usr/bin/env python3
"""Re-render one song with the station's notes.

The producer (an LLM) rewrites the song's caption, lyrics, tempo, key and
length from the notes; ACE-Step renders it again. The new audio takes the old
file's name, and the old audio and prompt log move to <show>/.replaced/, so
nothing is lost and the show keeps its track order.

    python rerender.py --track-json tmp/rerenders/rerender-1.json [--stop-ace-step] [--take]

The track JSON: {"file": "output/<show>/<NN-name>.mp3", "artist", "title",
"instructions", "dj_name"}. Prints "Rerendered: <file>" and "Spec: <json>" at the end.

--take is a remix: the same caption, lyrics, tempo, key and length rendered
again as a new song in its own folder, output/remix-<stamp>/ (printed as
"Show folder: <dir>"). The original is not touched and no LLM is asked.
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
    parser.add_argument("--take", action="store_true", help="Render the same song again as a new track")
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
    if args.take:
        take(spec, src, log, old, args.stop_ace_step)
        return

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
    before = {k: old.get(k) for k in ("caption", "lyrics", "bpm", "keyscale", "duration")}
    changes = new.get("changes") if isinstance(new.get("changes"), list) else []
    print(f"Review: {json.dumps({'diagnosis': str(new.get('diagnosis') or ''), 'changes': [str(c) for c in changes], 'before': before, 'after': song})}", flush=True)
    print(f"   {song['bpm']} BPM, {song['keyscale']}, {song['duration']}s")
    print(f"   {song['caption']}")

    # Render to a temporary name first: the old file only moves once the new
    # one is safely on disk.
    fresh = src.with_name(f".rerender-{src.name}")
    render(song, fresh, args.stop_ace_step)

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


def render(song: dict, dest: Path, stop_ace_step: bool):
    """ACE-Step renders the song to dest; exits if it can't."""
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
    g.download_audio(audio_path, dest)
    if stop_ace_step:
        g.stop_ace_step()
    if not dest.exists() or dest.stat().st_size < 1000:
        print("Render produced no audio", file=sys.stderr)
        sys.exit(1)


def take(spec: dict, src: Path, log: dict, old: dict, stop_ace_step: bool):
    """A new take of the song in a folder of its own; the original stays."""
    if not old.get("caption"):
        print(f"No prompt log beside {src}: nothing to remix from", file=sys.stderr)
        sys.exit(1)
    song = {**old, "title": spec["title"], "artist": spec["artist"],
            "lyrics": old.get("lyrics") or "[Instrumental]"}
    print(f"1. New take of {spec['artist']} — {spec['title']}", flush=True)
    print(f"   {song.get('bpm')} BPM, {song.get('keyscale')}, {song.get('duration')}s")
    print(f"   {song['caption']}")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    show_dir = g.OUTPUT_DIR / f"remix-{stamp}"
    (show_dir / "prompts").mkdir(parents=True)
    display_name = f"{song['artist']} - {song['title']}"
    stem = f"01-{g.slugify(display_name)}-dead-internet-radio"
    dest = show_dir / f"{stem}.mp3"
    try:
        render(song, dest, stop_ace_step)
    except SystemExit:
        # A WAV left behind is a render whose MP3 encode failed: keep it.
        if not any(show_dir.glob("*.wav")):
            shutil.rmtree(show_dir, ignore_errors=True)
        raise

    (show_dir / "show.json").write_text(json.dumps({
        "show_name": f"{song['artist']} — {song['title']}",
        "dj_name": str(spec.get("dj_name") or ""),
    }, indent=2))
    (show_dir / "prompts" / f"{stem}.prompt.json").write_text(json.dumps(
        {**{k: v for k, v in log.items() if k != "rerender"}, "track": 1, "payload": song,
         "take_of": {"file": str(src), "at": stamp}}, indent=2))

    g.emit_progress({"type": "track_done", "number": 1, "total": 1,
                     "title": song["title"], "artist": song["artist"], "file": str(dest)})
    print(f"Show folder: {show_dir}")
    print(f"Spec: {json.dumps({k: song.get(k) for k in ('caption', 'lyrics', 'bpm', 'keyscale', 'duration')})}")


if __name__ == "__main__":
    main()
