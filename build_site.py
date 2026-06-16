#!/usr/bin/env python3
"""Build Dead Internet Radio website into dist/."""
import argparse
import hashlib
import json
import os
import random
import re
import shutil
import sys
import time
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = "openrouter/free"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

OUTPUT_DIR = Path("output")
PROMPTS_DIR = OUTPUT_DIR / "prompts"
MIXES_DIR = Path("mixes")
SRC_DIR = Path("src")
DIST_DIR = Path("dist")

EPOCH_MS = 2051222400000  # 2035-01-01T00:00:00Z

DJ_NAMES = [
    "Bl0ckb3at", "Bas32", "C64", "ZX", "Antar3s",
    "P13iades", "Summer-0n-Mars", "4lpha", "STAN", "Memp00l",
    "Y0ct0b1t", "Syst3m", "S3venH4sh", "0rdin41", "Z0dia",
    "M3gacity", "N0nce", "Ph0t0n", "Terraform", "Byt3",
    "H3x", "Sh0ck", "Singu1arity", "R0b0t0", "Shutt13",
]

TRACK_RE = re.compile(r"^(\d+)-(.+)-dead-internet-radio\.mp3$")
PROMPT_RE = re.compile(r"^(\d+)-(.+)-dead-internet-radio\.prompt\.json$")
DJ_VO_RE = re.compile(r"-DJ-voice-")

FALLBACK_PAGES = {
    "headlines": [
        "COASTAL MONITORING STATION 7: NOMINAL",
        "AUTOMATED CONTENT GENERATION CONTINUES",
        "NEW FREQUENCIES ALLOCATED TO SECTOR 4",
        "COUNCIL CONFIRMS 2038 MAINTENANCE PLAN",
        "NORTHERN TERRITORIES: NO CHANGE REPORTED",
    ],
    "ads": [
        {
            "header": "RELOCATE WITH CONFIDENCE",
            "headerColor": "red",
            "lines": [
                "NORTHERN TERRITORIES",
                "SECTOR 7 COASTAL ZONE",
                "",
                "Average temperature: 4 C",
                "Population: 0",
                "Services: automated",
                "",
                "PROPERTY FROM 0 / NO DEPOSIT",
                "LONG TERM LETS AVAILABLE",
            ],
            "footer": "CALL 0800 DEAD INTERNET",
            "footer2": "LINES OPEN 00:00-00:00 DAILY",
        },
        {
            "header": "TRAVEL SECTOR 9",
            "headerColor": "magenta",
            "lines": [
                "VISIT THE EASTERN PROCESSING ZONE",
                "BEFORE DECOMMISSION DATE",
                "",
                "All facilities operational",
                "Staff: automated",
                "Entry: unrestricted",
                "",
                "PACKAGES FROM 199 (NO DEPOSIT)",
                "SUBJECT TO AVAILABILITY",
            ],
            "footer": "CALL 0800 DEAD INTERNET",
            "footer2": "LINES OPEN 00:00-00:00 DAILY",
        },
        {
            "header": "PUBLIC SERVICE NOTICE",
            "headerColor": "green",
            "lines": [
                "DEAD INTERNET RADIO REMINDS YOU:",
                "",
                "Continue monitoring all channels",
                "Report anomalies to sector admin",
                "Maintain scheduled routines",
                "",
                "THE BROADCAST CONTINUES",
                "AS PLANNED",
                "",
                "Thank you for your compliance",
            ],
            "footer": "THIS MESSAGE APPROVED BY",
            "footer2": "SECTOR ADMINISTRATION 2035",
        },
    ],
}

PAGES_PROMPT = """You are the content generator for Dead Internet Radio, an automated broadcast system transmitting since 2035.
The world is post-human. Automated systems continue running. No one is listening, but the broadcast continues.

Generate teletext page content in a deadpan bureaucratic voice. Not dramatic. Not post-apocalyptic.
Clinical. Administrative. The automation of a dead world continuing as if nothing happened.

Rules:
- Headlines: ALL CAPS, max 38 characters each, 5 items
- Ad lines: mixed case allowed, max 36 characters each
- Ad headerColor must be exactly one of: red, magenta, green
- Produce exactly 3 ads with different headerColors
- Phone numbers format: 0800 DEAD [word], hours: 00:00-00:00 DAILY
- Tone: mundane bureaucracy, services still running, infrastructure reports, property in depopulated areas

Output valid JSON only. No markdown, no extra text:

{
  "headlines": ["HEADLINE 1", "HEADLINE 2", "HEADLINE 3", "HEADLINE 4", "HEADLINE 5"],
  "ads": [
    {
      "header": "SHORT HEADER",
      "headerColor": "red",
      "lines": ["line 1", "line 2", "...up to 10 lines"],
      "footer": "CALL 0800 DEAD INTERNET",
      "footer2": "LINES OPEN 00:00-00:00 DAILY"
    }
  ]
}"""


def call_llm(system_prompt: str, user_message: str) -> str:
    for attempt in range(3):
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }
        body = {
            "model": OPENROUTER_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.9,
        }
        try:
            req = urllib.request.Request(
                OPENROUTER_URL,
                data=json.dumps(body).encode(),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode())
                content = result["choices"][0]["message"]["content"]
                if content is None:
                    raise ValueError("LLM returned null content")
                return content
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 3 * (attempt + 1)
                print(f"  Rate limited, retrying in {wait}s...", flush=True)
                time.sleep(wait)
                continue
            print(f"  LLM call failed ({e.code}), retrying in 3s...", flush=True)
            time.sleep(3)
        except Exception as e:
            if attempt < 2:
                print(f"  {e}, retrying...", flush=True)
                time.sleep(3)
                continue
            print(f"  LLM call failed: {e}", file=sys.stderr)
            return None
    return None


def normalize_key(keyscale: str) -> str:
    if not keyscale:
        return ""
    parts = keyscale.strip().split()
    if len(parts) >= 2:
        note = parts[0].upper()
        quality = "MIN" if parts[-1].lower() == "minor" else "MAJ"
        return f"{note} {quality}"
    return keyscale.upper()[:8]


def seeded_shuffle(names, seed_str):
    seed = int(hashlib.sha256(seed_str.encode()).hexdigest(), 16)
    rng = random.Random(seed)
    shuffled = list(names)
    rng.shuffle(shuffled)
    return shuffled


def select_dj_name(build_date=None):
    if build_date is None:
        build_date = date.today()
    seed_str = build_date.isoformat()
    shuffled = seeded_shuffle(DJ_NAMES, seed_str)
    return shuffled[0]


def find_tracks():
    all_mp3s = defaultdict(list)
    for f in OUTPUT_DIR.glob("*.mp3"):
        m = TRACK_RE.match(f.name)
        if m:
            all_mp3s[int(m.group(1))].append(f)

    jsons = defaultdict(list)
    for f in PROMPTS_DIR.glob("*.prompt.json"):
        m = PROMPT_RE.match(f.name)
        if m:
            jsons[int(m.group(1))].append(f)

    entries = []
    for nn in sorted(all_mp3s.keys()):
        mp3_list = all_mp3s[nn]
        json_list = jsons.get(nn, [])

        songs = [f for f in mp3_list if not DJ_VO_RE.search(f.name)]
        voiceovers = [f for f in mp3_list if DJ_VO_RE.search(f.name)]

        chosen_song = None
        chosen_json = None
        if songs:
            for s in songs:
                for j in json_list:
                    if j.name == s.stem + ".prompt.json":
                        chosen_song = s
                        chosen_json = j
                        break
                if chosen_song:
                    break
            if not chosen_song:
                chosen_song = max(songs, key=lambda f: f.stat().st_mtime)
                if json_list:
                    chosen_json = max(json_list, key=lambda f: f.stat().st_mtime)

        if chosen_song:
            entries.append({
                "number": nn, "mp3": chosen_song, "json": chosen_json, "kind": "song"
            })

        for vo in sorted(voiceovers, key=lambda f: f.stat().st_mtime):
            entries.append({
                "number": nn, "mp3": vo, "json": None, "kind": "voiceover"
            })

    return entries


def get_duration_ms(mp3_path: Path) -> int:
    try:
        from mutagen.mp3 import MP3
        audio = MP3(str(mp3_path))
        return int(audio.info.length * 1000)
    except Exception as e:
        print(f"  Warning: mutagen failed for {mp3_path.name}: {e}", flush=True)
        return 30000


def build_playlist(tracks):
    entries = []
    for t in tracks:
        payload = {}
        prompt_data = {}
        if t["json"]:
            try:
                prompt_data = json.loads(t["json"].read_text())
                payload = prompt_data.get("payload", {})
            except Exception:
                pass

        kind = t.get("kind", "song")
        track_type = prompt_data.get("type", "track")
        script = prompt_data.get("text", "") if track_type == "dj_announce" else ""
        brief = prompt_data.get("brief", "")

        duration_ms = get_duration_ms(t["mp3"])
        title = payload.get("title", payload.get("caption", "")) if kind != "voiceover" else ""
        artist = payload.get("artist", "") if kind != "voiceover" else ""

        if kind == "voiceover":
            caption = "DJ"
        else:
            caption = f"{artist} — {title}" if artist else title

        entries.append({
            "file": f"audio/{t['mp3'].name}",
            "durationMs": duration_ms,
            "kind": kind,
            "type": track_type,
            "script": script,
            "brief": brief,
            "title": title,
            "artist": artist,
            "caption": caption,
            "lyrics": payload.get("lyrics", ""),
            "bpm": payload.get("bpm") or None,
            "key": normalize_key(payload.get("keyscale", "")),
        })

    dj_name = select_dj_name()
    return {"epoch": EPOCH_MS, "djName": dj_name, "tracks": entries}


def _build_dist_static():
    """Copy static src/ assets to dist/."""
    DIST_DIR.mkdir(exist_ok=True)
    (DIST_DIR / "audio").mkdir(exist_ok=True)
    for src_file in SRC_DIR.iterdir():
        if src_file.is_file():
            shutil.copy2(src_file, DIST_DIR / src_file.name)
        elif src_file.is_dir():
            dest_dir = DIST_DIR / src_file.name
            if dest_dir.exists():
                shutil.rmtree(dest_dir)
            shutil.copytree(src_file, dest_dir)


def find_shows():
    """Scan output/ for show subdirectories and return a list of show dicts."""
    SHOW_DIR_RE = re.compile(r"^(.+?)-(\d{8}-\d{6})$")
    shows = []

    for entry in sorted(OUTPUT_DIR.iterdir()):
        if not entry.is_dir():
            continue
        m = SHOW_DIR_RE.match(entry.name)
        if not m:
            continue

        slot_slug = m.group(1).replace("-", " ").title()
        timestamp = m.group(2)

        # Read show metadata (show name + DJ name from LLM)
        show_meta = {}
        meta_file = entry / "show.json"
        if meta_file.exists():
            try:
                show_meta = json.loads(meta_file.read_text())
            except Exception:
                pass
        show_name = show_meta.get("show_name", "").strip() or slot_slug
        show_dj = show_meta.get("dj_name", "").strip()

        mp3_files = sorted(
            [f for f in entry.glob("*.mp3") if not DJ_VO_RE.search(f.name)],
            key=lambda f: f.name
        )

        prompt_files = sorted(entry.glob("prompts/*.prompt.json"))

        tracks = []
        for mp3 in mp3_files:
            tn_match = TRACK_RE.match(mp3.name)
            if not tn_match:
                continue
            tn = int(tn_match.group(1))
            stem = mp3.stem

            prompt_data = {}
            payload = {}
            for pf in prompt_files:
                if pf.stem == stem + '.prompt':
                    try:
                        prompt_data = json.loads(pf.read_text())
                        payload = prompt_data.get("payload", {})
                    except Exception:
                        pass
                    break

            track_type = prompt_data.get("type", "track")
            script = prompt_data.get("text", "") if track_type == "dj_announce" else ""
            brief = prompt_data.get("brief", "")
            title = payload.get("title", payload.get("caption", ""))
            artist = payload.get("artist", "")

            tracks.append({
                "number": tn,
                "file": mp3.name,
                "durationMs": get_duration_ms(mp3),
                "type": track_type,
                "script": script,
                "brief": brief,
                "title": title,
                "artist": artist,
                "caption": f"{artist} — {title}" if artist else title,
                "lyrics": payload.get("lyrics", ""),
                "bpm": payload.get("bpm") or None,
                "key": normalize_key(payload.get("keyscale", "")),
            })

        if not tracks:
            continue

        # Sort tracks by number
        tracks.sort(key=lambda t: t["number"])

        # Attach voiceover files to following song entries
        voiceover_mp3s = sorted(
            [f for f in entry.glob("*.mp3") if DJ_VO_RE.search(f.name)],
            key=lambda f: f.name
        )
        for vo in voiceover_mp3s:
            tn_match = TRACK_RE.match(vo.name)
            if not tn_match:
                continue
            vo_tn = int(tn_match.group(1))
            # Find the first song entry with number > vo_tn
            for t in tracks:
                if t["number"] > vo_tn:
                    t["voiceoverFile"] = vo.name
                    t["voiceoverDurationMs"] = get_duration_ms(vo)
                    break

        dj_name = show_dj or select_dj_name()

        # Look for mix file in flat mixes/ directory
        mix_file = None
        mix_cues = None
        if MIXES_DIR.is_dir():
            slot_slug = entry.name.rsplit("-", 2)[0]
            for mix_mp3 in MIXES_DIR.glob("*.mp3"):
                if slot_slug in mix_mp3.stem:
                    mix_file = mix_mp3
                    cues_path = mix_mp3.with_suffix(".cues.json")
                    if cues_path.exists():
                        mix_cues = cues_path
                    break

        show = {
            "id": entry.name,
            "name": show_name,
            "showName": show_name,
            "timestamp": timestamp,
            "djName": dj_name,
            "trackCount": len(tracks),
            "mixFile": mix_file,
            "mixCues": mix_cues,
            "tracks": tracks,
        }
        shows.append(show)

    return shows


def build_shows_manifest(shows: list[dict]) -> None:
    """Write shows.json and copy per-show playlists + audio into dist/.

    dist/
      shows.json               — show manifest (IDs, names, counts)
      shows/<show-id>/
        playlist.json          — per-show track list
        audio/<file>.mp3       — show audio files
    """
    DIST_DIR.mkdir(exist_ok=True)
    (DIST_DIR / "shows").mkdir(exist_ok=True)

    manifest = []
    for show in shows:
        show_dist = DIST_DIR / "shows" / show["id"]
        show_dist.mkdir(exist_ok=True)
        (show_dist / "audio").mkdir(exist_ok=True)

        # Write per-show playlist with relative paths (audio/file.mp3)
        playlist = {
            "epoch": EPOCH_MS,
            "showName": show["showName"],
            "djName": show["djName"],
            "tracks": [],
        }
        for track in show["tracks"]:
            src = OUTPUT_DIR / show["id"] / track["file"]
            dest = show_dist / "audio" / track["file"]
            if src.exists():
                shutil.copy2(src, dest)

            entry = {
                "file": f"audio/{track['file']}",
                "durationMs": track["durationMs"],
                "title": track.get("title", ""),
                "artist": track.get("artist", ""),
                "caption": track.get("caption", ""),
                "bpm": track.get("bpm"),
                "key": track.get("key", ""),
                "type": track.get("type", "track"),
                "script": track.get("script", ""),
                "brief": track.get("brief", ""),
            }

            # Attach voiceover to the track it plays over
            if track.get("voiceoverFile"):
                vo_src = OUTPUT_DIR / show["id"] / track["voiceoverFile"]
                vo_dest = show_dist / "audio" / track["voiceoverFile"]
                if vo_src.exists():
                    shutil.copy2(vo_src, vo_dest)
                entry["voiceoverFile"] = f"audio/{track['voiceoverFile']}"
                entry["voiceoverDurationMs"] = track["voiceoverDurationMs"]

            playlist["tracks"].append(entry)

        (show_dist / "playlist.json").write_text(json.dumps(playlist, indent=2))
        print(f"  {show['id']}/ ({len(show['tracks'])} tracks)")

        # Copy mix + cues if they exist
        mix_url = None
        mix_cues_url = None
        if show.get("mixFile"):
            mix_src = show["mixFile"]
            mix_dest = show_dist / "audio" / mix_src.name
            if mix_src.exists():
                shutil.copy2(mix_src, mix_dest)
                mix_url = f"audio/{mix_src.name}"
            if show.get("mixCues"):
                cues_src = show["mixCues"]
                cues_dest = show_dist / "audio" / cues_src.name
                if cues_src.exists():
                    shutil.copy2(cues_src, cues_dest)
                    mix_cues_url = f"audio/{cues_src.name}"

        manifest.append({
            "id": show["id"],
            "name": show["name"],
            "showName": show["showName"],
            "timestamp": show["timestamp"],
            "djName": show["djName"],
            "trackCount": show["trackCount"],
            "playlist": f"shows/{show['id']}/playlist.json",
            "mixFile": mix_url,
            "mixCues": mix_cues_url,
        })

    manifest_json = json.dumps({"shows": manifest}, indent=2)
    (DIST_DIR / "shows.json").write_text(manifest_json)
    (OUTPUT_DIR / "shows.json").write_text(manifest_json)
    (Path("shows.json")).write_text(manifest_json)
    print(f"  shows.json — {len(manifest)} shows")
    for s in manifest:
        print(f"    {s['name']} ({s['trackCount']} tracks)")


def generate_pages(skip_llm: bool, existing_pages_path: Path) -> dict:
    if skip_llm:
        if existing_pages_path.exists():
            print("  --skip-llm: reusing existing pages.json", flush=True)
            return json.loads(existing_pages_path.read_text())
        print("  --skip-llm: no existing pages.json, using fallback content", flush=True)
        return FALLBACK_PAGES

    if not OPENROUTER_API_KEY:
        print("  Warning: OPENROUTER_API_KEY not set, using fallback pages", flush=True)
        return FALLBACK_PAGES

    print("  Calling LLM for page content...", flush=True)
    raw = call_llm(PAGES_PROMPT, "Generate teletext page content for Dead Internet Radio.")
    if raw is None:
        print("  LLM failed, using fallback pages", flush=True)
        return FALLBACK_PAGES

    try:
        data = json.loads(raw)
        assert "headlines" in data and "ads" in data
        assert len(data["headlines"]) >= 3
        assert len(data["ads"]) >= 1
        return data
    except Exception as e:
        print(f"  LLM returned invalid JSON ({e}), using fallback", flush=True)
        return FALLBACK_PAGES


def main():
    parser = argparse.ArgumentParser(description="Build Dead Internet Radio website")
    parser.add_argument("--skip-llm", action="store_true",
                        help="Skip LLM call; reuse existing pages.json or use fallback")
    parser.add_argument("--shows-only", action="store_true",
                        help="Only scan shows and generate shows.json (skip full site build)")
    args = parser.parse_args()

    print("Dead Internet Radio — Building site", flush=True)
    print()

    # Always scan shows first
    print("Scanning shows...", flush=True)
    shows = find_shows()
    if shows:
        build_shows_manifest(shows)
    else:
        print("  No shows found in output/ subdirectories")
    print()

    # Always copy static files (needed even in shows-only mode)
    print("Copying static assets...", flush=True)
    _build_dist_static()
    print()

    if args.shows_only:
        print("Done (shows-only mode).")
        return

    raw_tracks = find_tracks()
    if not raw_tracks and not shows:
        print("Error: no numbered MP3 tracks found in output/", file=sys.stderr)
        sys.exit(1)

    if not raw_tracks:
        print("No tracks in output/ root — shows-only build.")
        _build_dist_static()
        print()
        print(f"Done! dist/ ready for deployment.")
        print(f"  Shows: {len(shows)}")
        return

    print(f"Found {len(raw_tracks)} track(s):", flush=True)
    for t in raw_tracks:
        json_status = "✓ metadata" if t["json"] else "  no metadata"
        print(f"  Track {t['number']:02d}: {t['mp3'].name[:60]}  [{json_status}]", flush=True)
    print()

    print("Building playlist.json...", flush=True)
    playlist = build_playlist(raw_tracks)
    total_ms = sum(t["durationMs"] for t in playlist["tracks"])
    total_s = total_ms // 1000
    print(f"  DJ: {playlist['djName']}")
    print(f"  Total duration: {total_s // 60}m {total_s % 60}s")
    print()

    print("Generating pages.json...", flush=True)
    existing_pages = DIST_DIR / "pages.json"
    pages = generate_pages(args.skip_llm, existing_pages)
    print(f"  {len(pages.get('headlines', []))} headlines, {len(pages.get('ads', []))} ads")
    print()

    print("Writing dist/...", flush=True)
    DIST_DIR.mkdir(exist_ok=True)
    (DIST_DIR / "audio").mkdir(exist_ok=True)

    for t in raw_tracks:
        dest = DIST_DIR / "audio" / t["mp3"].name
        shutil.copy2(t["mp3"], dest)
        print(f"  audio/{t['mp3'].name}", flush=True)

    (DIST_DIR / "playlist.json").write_text(json.dumps(playlist, indent=2))
    (DIST_DIR / "pages.json").write_text(json.dumps(pages, indent=2))
    print("  playlist.json", flush=True)
    print("  pages.json", flush=True)

    for src_file in SRC_DIR.iterdir():
        if src_file.is_file():
            shutil.copy2(src_file, DIST_DIR / src_file.name)
            print(f"  {src_file.name}", flush=True)
        elif src_file.is_dir():
            dest_dir = DIST_DIR / src_file.name
            if dest_dir.exists():
                shutil.rmtree(dest_dir)
            shutil.copytree(src_file, dest_dir)
            print(f"  {src_file.name}/", flush=True)

    print()
    print(f"Done! dist/ ready for deployment.")
    print(f"  DJ: {playlist['djName']}")
    print(f"  Tracks: {len(raw_tracks)}")
    print(f"  Duration: {total_s // 60}m {total_s % 60}s (loops every ~{total_s}s)")
    print(f"  Epoch: 2035-01-01T00:00:00Z")
    print()
    print("Deploy: drag dist/ to Netlify, or run `netlify deploy --dir=dist --prod`")


if __name__ == "__main__":
    main()
