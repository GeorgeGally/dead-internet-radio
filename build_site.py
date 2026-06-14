#!/usr/bin/env python3
"""Build Dead Internet Radio website into dist/."""
import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.request
import urllib.error
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_FREE_MODELS = [
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "google/gemma-4-9b-it:free",
    "google/gemma-4-flash:free",
    "liquid/lfm-2.5-1.2b-instruct:free",
]
_build_model_index = 0


def _next_model() -> str:
    global _build_model_index
    model = OPENROUTER_FREE_MODELS[_build_model_index % len(OPENROUTER_FREE_MODELS)]
    _build_model_index += 1
    return model
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

OUTPUT_DIR = Path("output")
PROMPTS_DIR = OUTPUT_DIR / "prompts"
SRC_DIR = Path("src")
DIST_DIR = Path("dist")

EPOCH_MS = 2051222400000  # 2035-01-01T00:00:00Z

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
            "footer2": "SOME ZONES MAY BE RESTRICTED",
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


def call_llm(system_prompt: str, user_message: str, json_mode: bool = False) -> str:
    tried = set()
    last_error = None
    while len(tried) < len(OPENROUTER_FREE_MODELS):
        model = _next_model()
        if model in tried:
            continue
        tried.add(model)
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }
        use_json_mode = json_mode
        for attempt in range(2):
            body = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.9,
            }
            if use_json_mode:
                body["response_format"] = {"type": "json_object"}
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
                if e.code == 400 and use_json_mode:
                    print(f"  Model {model} rejects json_object, retrying without...", flush=True)
                    use_json_mode = False
                    continue
                if e.code == 429:
                    wait = 3 * (attempt + 1)
                    print(f"  Rate limited ({model}), retrying in {wait}s...", flush=True)
                    time.sleep(wait)
                    continue
                if e.code in (400, 404):
                    print(f"  Model {model} unavailable ({e.code}), skipping", flush=True)
                    break
                last_error = str(e)
                print(f"  Model {model} failed: {e}", flush=True)
                break
            except Exception as e:
                if attempt < 1:
                    wait = 3 * (attempt + 1)
                    print(f"  {e}, retrying in {wait}s...", flush=True)
                    time.sleep(wait)
                    continue
                last_error = str(e)
                break
    print(f"  All models exhausted. Last error: {last_error}", file=sys.stderr)
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


def find_tracks():
    mp3s = defaultdict(list)
    for f in OUTPUT_DIR.glob("*.mp3"):
        m = TRACK_RE.match(f.name)
        if m and not DJ_VO_RE.search(f.name):
            mp3s[int(m.group(1))].append(f)

    jsons = defaultdict(list)
    for f in PROMPTS_DIR.glob("*.prompt.json"):
        m = PROMPT_RE.match(f.name)
        if m:
            jsons[int(m.group(1))].append(f)

    tracks = []
    for nn in sorted(mp3s.keys()):
        mp3_list = mp3s[nn]
        json_list = jsons.get(nn, [])

        chosen_mp3 = None
        chosen_json = None

        # Try exact stem match first
        for mp3 in mp3_list:
            stem = mp3.stem
            for j in json_list:
                if j.name == stem + ".prompt.json":
                    chosen_mp3 = mp3
                    chosen_json = j
                    break
            if chosen_mp3:
                break

        if not chosen_mp3:
            chosen_mp3 = max(mp3_list, key=lambda f: f.stat().st_mtime)
            if json_list:
                chosen_json = max(json_list, key=lambda f: f.stat().st_mtime)

        tracks.append({"number": nn, "mp3": chosen_mp3, "json": chosen_json})

    return tracks


def get_duration_ms(mp3_path: Path) -> int:
    try:
        from mutagen.mp3 import MP3
        audio = MP3(str(mp3_path))
        return int(audio.info.length * 1000)
    except Exception as e:
        print(f"  Warning: mutagen failed for {mp3_path.name}: {e}", flush=True)
        return 30000  # fallback: 30s


def build_playlist(tracks):
    entries = []
    for t in tracks:
        payload = {}
        if t["json"]:
            try:
                data = json.loads(t["json"].read_text())
                payload = data.get("payload", {})
            except Exception:
                pass

        duration_ms = get_duration_ms(t["mp3"])
        title = payload.get("title", payload.get("caption", ""))
        artist = payload.get("artist", "")
        entries.append({
            "file": f"audio/{t['mp3'].name}",
            "durationMs": duration_ms,
            "title": title,
            "artist": artist,
            "caption": f"{artist} — {title}" if artist else title,
            "bpm": payload.get("bpm") or None,
            "key": normalize_key(payload.get("keyscale", "")),
        })

    return {"epoch": EPOCH_MS, "tracks": entries}


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
    raw = call_llm(PAGES_PROMPT, "Generate teletext page content for Dead Internet Radio.", json_mode=True)
    if raw is None:
        print("  LLM failed, using fallback pages", flush=True)
        return FALLBACK_PAGES

    try:
        data = json.loads(raw)
        # Validate structure
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
    args = parser.parse_args()

    print("Dead Internet Radio — Building site", flush=True)
    print()

    raw_tracks = find_tracks()
    if not raw_tracks:
        print("Error: no numbered MP3 tracks found in output/", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(raw_tracks)} track(s):", flush=True)
    for t in raw_tracks:
        json_status = "✓ metadata" if t["json"] else "  no metadata"
        print(f"  Track {t['number']:02d}: {t['mp3'].name[:60]}  [{json_status}]", flush=True)
    print()

    # Build playlist
    print("Building playlist.json...", flush=True)
    playlist = build_playlist(raw_tracks)
    total_ms = sum(t["durationMs"] for t in playlist["tracks"])
    total_s = total_ms // 1000
    print(f"  Total duration: {total_s // 60}m {total_s % 60}s", flush=True)
    print()

    # Generate pages
    print("Generating pages.json...", flush=True)
    existing_pages = DIST_DIR / "pages.json"
    pages = generate_pages(args.skip_llm, existing_pages)
    print(f"  {len(pages.get('headlines', []))} headlines, {len(pages.get('ads', []))} ads", flush=True)
    print()

    # Build dist/
    print("Writing dist/...", flush=True)
    DIST_DIR.mkdir(exist_ok=True)
    (DIST_DIR / "audio").mkdir(exist_ok=True)

    # Copy audio files
    for t in raw_tracks:
        dest = DIST_DIR / "audio" / t["mp3"].name
        shutil.copy2(t["mp3"], dest)
        print(f"  audio/{t['mp3'].name}", flush=True)

    # Write JSON files
    (DIST_DIR / "playlist.json").write_text(json.dumps(playlist, indent=2))
    (DIST_DIR / "pages.json").write_text(json.dumps(pages, indent=2))
    print("  playlist.json", flush=True)
    print("  pages.json", flush=True)

    # Copy src/ assets
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
    print(f"  Tracks: {len(raw_tracks)}")
    print(f"  Duration: {total_s // 60}m {total_s % 60}s (loops every ~{total_s}s)")
    print(f"  Epoch: 2035-01-01T00:00:00Z")
    print()
    print("Deploy: drag dist/ to Netlify, or run `netlify deploy --dir=dist --prod`")


if __name__ == "__main__":
    main()
