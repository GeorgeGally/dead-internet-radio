#!/usr/bin/env python3
"""Build a DJ set from the track library.

The DJ (an LLM) picks songs from a pool Rails hands over and decides their
order, then writes the opening, the links and any request reads. Kokoro voices
them. Songs are hard-linked into a new show folder, so nothing is rendered and
ACE-Step is never needed.

    python build_set.py --set-json tmp/sets/set-1.json [--dry-run] [--no-voice]

The set JSON: {"slot": "late night", "minutes": 60, "dj_name": "",
"candidates": [{"id", "artist", "title", "bpm", "key", "seconds", "sound",
"score", "file", "request": {"id", "requester", "note"} | null}]}
"""
import argparse
import json
import os
import random
import shutil
import sys
from datetime import datetime
from pathlib import Path

import generate as g

SET_DJ_PROMPT_PATH = g.PROMPTS_DIR / "set_dj.md"


def fmt_len(seconds: int) -> str:
    return f"{seconds // 60}:{seconds % 60:02d}"


def library_lines(candidates: list[dict]) -> str:
    lines = []
    for c in candidates:
        parts = [f"id {c['id']}", f"{c['artist']} — {c['title']}"]
        if c.get("bpm"):
            parts.append(f"{c['bpm']} bpm")
        if c.get("key"):
            parts.append(c["key"])
        parts.append(fmt_len(int(c["seconds"])))
        if c.get("score"):
            parts.append(f"votes {c['score']:+d}")
        if c.get("request"):
            parts.append(f"REQUEST from {c['request']['requester']}")
        if c.get("sound"):
            parts.append(f"sound: {c['sound']}")
        lines.append(" | ".join(parts))
    return "\n".join(lines)


def ask_dj(slot: str, minutes: int, dj_name: str, candidates: list[dict]) -> dict:
    """The DJ's pick: show name, brief and an order of ids. {} if the call fails."""
    message = (
        f"Slot: {slot}\nTarget length: {minutes} minutes\nDJ name: {dj_name}\n\n"
        f"Library ({len(candidates)} songs):\n{library_lines(candidates)}"
    )
    try:
        return g.extract_json(g.call_llm(g.load_prompt(SET_DJ_PROMPT_PATH), message))
    except (SystemExit, ValueError) as e:
        print(f"  DJ pick failed ({e}); falling back to the pool order", flush=True)
        return {}


def settle_order(order: list, candidates: list[dict], minutes: int) -> list[dict]:
    """Hold the DJ to the rules: known ids, one song per artist, every request
    in, and close to the slot's length."""
    by_id = {c["id"]: c for c in candidates}
    target = minutes * 60
    picked, artists = [], set()

    def take(c):
        if c["artist"].lower() in artists:
            return False
        picked.append(c)
        artists.add(c["artist"].lower())
        return True

    for raw in order or []:
        try:
            c = by_id.get(int(raw))
        except (TypeError, ValueError):
            continue
        if c and c not in picked:
            take(c)

    # Trim from the end, but never a request.
    def total():
        return sum(int(c["seconds"]) for c in picked)

    while total() > target + 180 and any(not c.get("request") for c in picked):
        drop = next(c for c in reversed(picked) if not c.get("request"))
        picked.remove(drop)
        artists.discard(drop["artist"].lower())

    # Requests the DJ left out go in the middle.
    for c in candidates:
        if c.get("request") and c not in picked:
            if c["artist"].lower() in artists:
                clash = next(p for p in picked if p["artist"].lower() == c["artist"].lower())
                picked.remove(clash)
            picked.insert(len(picked) // 2, c)
            artists.add(c["artist"].lower())

    # Short of the slot: top up from the pool in its order.
    for c in candidates:
        if total() >= target - 240:
            break
        if c not in picked:
            take(c)
    return picked


def link_song(src: Path, dest: Path):
    """Hard link, so the set costs no disk; copy across filesystems."""
    try:
        os.link(src, dest)
    except OSError:
        shutil.copy2(src, dest)


def voice(text: str, stem: str, show_dir: Path, intensity: float) -> bool:
    wav = show_dir / f"{stem}.wav"
    mp3 = show_dir / f"{stem}.mp3"
    g.generate_announcement(text, wav, intensity=intensity)
    if wav.exists() and wav.stat().st_size > 100:
        g.wav_to_mp3(wav, mp3)
        return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Build a Dead Internet Radio set from the library")
    parser.add_argument("--set-json", required=True)
    parser.add_argument("--dry-run", action="store_true", help="Pick and print the set, write nothing")
    parser.add_argument("--no-voice", action="store_true", help="Skip Kokoro: songs only")
    args = parser.parse_args()

    spec = json.loads(Path(args.set_json).read_text())
    slot = spec.get("slot") or "late night"
    minutes = int(spec.get("minutes") or 60)
    candidates = [c for c in spec.get("candidates", []) if Path(c["file"]).exists()]
    if not candidates:
        print("The library is empty: nothing to build a set from.", file=sys.stderr)
        sys.exit(1)
    dj_name = spec.get("dj_name") or g.random_dj_name()

    print(f"1. DJ {dj_name} picking a {minutes}-minute {slot} set from {len(candidates)} songs...", flush=True)
    pick = ask_dj(slot, minutes, dj_name, candidates)
    songs = settle_order(pick.get("order"), candidates, minutes)
    show_name = str(pick.get("show_name") or "").strip() or slot.title()
    brief = str(pick.get("brief") or "").strip()
    length = sum(int(c["seconds"]) for c in songs)
    print(f"   \"{show_name}\": {len(songs)} songs, {fmt_len(length)}")
    if brief:
        print(f"   {brief}")
    for n, c in enumerate(songs, 1):
        mark = f"  (request from {c['request']['requester']})" if c.get("request") else ""
        print(f"   {n:02d}. {c['artist']} — {c['title']}  {c.get('bpm') or '?'} bpm{mark}")
    if args.dry_run:
        return

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    show_dir = g.OUTPUT_DIR / f"{g.slugify(slot)}-set-{stamp}"
    prompts_dir = show_dir / "prompts"
    prompts_dir.mkdir(parents=True)

    # Songs: linked in under their set position, with their prompt log so the
    # site and Rails read the same title, artist, tempo and key.
    library = {}
    for n, c in enumerate(songs, 1):
        src = Path(c["file"])
        name = src.name.split("-", 1)[1] if src.name[:2].isdigit() else src.name
        dest = show_dir / f"{n:02d}-{name}"
        link_song(src, dest)
        log = src.parent / "prompts" / f"{src.stem}.prompt.json"
        if log.exists():
            shutil.copy2(log, prompts_dir / f"{dest.stem}.prompt.json")
        library[dest.name] = c["id"]

    # A link before every song or two; a request always gets its read.
    schedule = set()
    n = random.randint(2, 3)
    while n <= len(songs):
        schedule.add(n)
        n += random.randint(1, 2)
    requests = {n for n, c in enumerate(songs, 1) if c.get("request")}
    schedule -= requests

    (show_dir / "show.json").write_text(json.dumps({
        "show_name": show_name,
        "slot": slot,
        "dj_name": dj_name,
        "brief": brief,
        "kind": "set",
        "voiceover_schedule": sorted(schedule | requests),
        "track_count": len(songs),
        "library": library,
    }, indent=2))

    announcer = g.load_prompt(g.ANNOUNCER_PROMPT_PATH)
    print("2. DJ writing the opening and links...", flush=True)
    opening = g.call_llm(
        announcer,
        f"Slot: {slot}\n\nTYPE: DJ_ANNOUNCE\n\nStation ID, show name, and DJ name. The show is called: \"{show_name}\". "
        f"The DJ name is: {dj_name}. Keep it short — 10-20 seconds of speech, about 25-50 words.",
    ).strip().strip('"').strip("'").strip()
    opening_stem = "00-dead-internet-radio-opening-dead-internet-radio"
    (prompts_dir / f"{opening_stem}.prompt.json").write_text(json.dumps({
        "track": 0, "slot": slot, "brief": brief, "type": "dj_announce", "text": opening,
        "payload": {"title": "Opening Broadcast", "artist": "Dead Internet Radio",
                    "caption": "Dead Internet Radio — Opening Broadcast", "bpm": None, "keyscale": "", "duration": 0},
    }, indent=2))

    # A voice file numbered N-1 rides on song N as its intro.
    lines = {}
    if schedule:
        entries = "\n".join(f"- Voiceover before track {n}, NEXT TRACK: {songs[n - 1]['artist']} — \"{songs[n - 1]['title']}\""
                            for n in sorted(schedule))
        batch = g.call_llm(
            announcer,
            f"Show: \"{show_name}\"\nSlot: {slot}\n\nDJ name: {dj_name}\n\nProgram brief:\n\n{brief}\n\n"
            f"Generate {len(schedule)} mid-set voiceovers. Return a JSON array of {len(schedule)} objects.\n\n"
            f"Each voiceover: announce the next track and identify yourself as DJ {dj_name}. "
            f"Weave in the station ID ('Dead Internet Radio' or 'D.I.R.'). Under 30 words. "
            f"Vary the phrasing — don't repeat the same intro formula.\n\nVoiceovers:\n{entries}\n\n"
            f'Output: JSON array with objects: {{"track_number": int, "type": "TRACK_INTRO", "text": string}}',
        )
        try:
            for vo in g.extract_json_array(batch):
                n = vo.get("track_number")
                text = str(vo.get("text", "")).strip().strip('"').strip("'").strip()
                if n in schedule and text:
                    lines[n] = text
        except ValueError:
            print("  WARNING: could not parse the links, skipping them", flush=True)
    for n in sorted(requests):
        c = songs[n - 1]
        lines[n] = g.request_announcement(announcer, slot, dj_name, {
            "requester": c["request"]["requester"], "title": c["title"], "artist": c["artist"],
            "note": c["request"].get("note"),
        })

    if args.no_voice:
        print("3. Voices skipped (--no-voice)")
    else:
        print(f"3. Kokoro voicing the opening and {len(lines)} links...", flush=True)
        voice(opening, opening_stem, show_dir, 0.3)
    for n in sorted(lines):
        c = songs[n - 1]
        print(f"   before {n:02d}: \"{lines[n][:140]}\"")
        if not args.no_voice:
            voice(lines[n], f"{n - 1:02d}-DJ-voice-{g.slugify(c['artist'] + ' ' + c['title'])}-dead-internet-radio",
                  show_dir, 0.2 + random.random() * 0.2)

    print(f"\nShow folder: {show_dir}")


if __name__ == "__main__":
    main()
