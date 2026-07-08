#!/usr/bin/env python3
import argparse
import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
ACE_STEP_URL = os.getenv("ACE_STEP_URL", "http://localhost:8001")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OUTPUT_DIR = Path("output")
PROMPTS_OUTPUT_DIR = OUTPUT_DIR / "prompts"

PROMPTS_DIR = Path("prompts")
PRODUCER_PROMPT_PATH = PROMPTS_DIR / "producer.md"
DJ_PROMPT_PATH = PROMPTS_DIR / "dj.md"
ANNOUNCER_PROMPT_PATH = PROMPTS_DIR / "announcer.md"

ANNOUNCE_SCRIPT = Path(__file__).parent / "announce.py"
KOKORO_PYTHON = Path(__file__).parent / "kokoro" / ".venv" / "bin" / "python3"

DJ_NAMES = [
    "c^$", "Kode Red", "Agent Orange", "Static", "Void", "Echo",
    "Ghost", "Synthia", "Reaper", "Blade", "Circuit", "Pixel",
    "Zero", "Neon", "Cipher", "Rust", "Glitch", "Hex",
]


def random_dj_name() -> str:
    return random.choice(DJ_NAMES)


def load_prompt(path: Path) -> str:
    return path.read_text().strip()


def slugify(text: str, max_len: int = 50) -> str:
    slug = "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-")
    slug = "-".join(p for p in slug.split("--") if p) if "--" in slug else slug
    slug = "-".join(p for p in slug.split("-") if p)
    return slug[:max_len].strip("-")


def extract_json(text: str) -> dict:
    """Extract a JSON object from LLM output, handling markdown, verbosity, and malformation."""
    # Strip markdown code fences
    text = re.sub(r'^```(?:json)?\s*\n?', '', text.strip())
    text = re.sub(r'\n?```\s*$', '', text)

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Find outermost braces by counting depth
    brace_start = text.find("{")
    if brace_start < 0:
        brace_start = text.find("[")
        if brace_start < 0:
            raise ValueError("No JSON braces/brackets found in LLM output")
        # Array mode: find matching ]
        depth = 0
        for i in range(brace_start, len(text)):
            if text[i] == "[":
                depth += 1
            elif text[i] == "]":
                depth -= 1
                if depth == 0:
                    try:
                        result = json.loads(text[brace_start:i + 1])
                        if isinstance(result, list) and len(result) > 0:
                            return result[0]
                        return result
                    except json.JSONDecodeError:
                        pass

    # Object mode: find matching }
    depth = 0
    brace_end = -1
    for i in range(brace_start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                brace_end = i
                break

    if brace_end > brace_start:
        candidate = text[brace_start:brace_end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as e:
            # Try fixing common issues
            fixed = re.sub(r',\s*}', '}', candidate)  # trailing comma
            fixed = re.sub(r',\s*]', ']', fixed)
            try:
                return json.loads(fixed)
            except json.JSONDecodeError:
                raise ValueError(
                    f"Could not parse JSON from LLM output. "
                    f"Error near: {candidate[max(0,e.pos-40):e.pos+40]!r}"
                ) from e

    raise ValueError(f"Could not extract JSON from LLM output ({len(text)} chars)")


def extract_json_array(text: str) -> list:
    """Extract a JSON array from LLM output, returning all elements."""
    text = re.sub(r'^```(?:json)?\s*\n?', '', text.strip())
    text = re.sub(r'\n?```\s*$', '', text)

    try:
        result = json.loads(text)
        return result if isinstance(result, list) else [result]
    except json.JSONDecodeError:
        pass

    start = text.find("[")
    if start >= 0:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "[":
                depth += 1
            elif text[i] == "]":
                depth -= 1
                if depth == 0:
                    candidate = text[start:i + 1]
                    try:
                        result = json.loads(candidate)
                        return result if isinstance(result, list) else [result]
                    except json.JSONDecodeError:
                        fixed = re.sub(r',\s*]', ']', candidate)
                        try:
                            result = json.loads(fixed)
                            return result if isinstance(result, list) else [result]
                        except json.JSONDecodeError:
                            pass

    raise ValueError(f"Could not extract JSON array from LLM output ({len(text)} chars)")



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
            sys.exit(1)

    print("  LLM call failed after 3 attempts", file=sys.stderr)
    sys.exit(1)


def check_ace_step_health():
    try:
        req = urllib.request.Request(f"{ACE_STEP_URL}/health")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            if data.get("data", {}).get("status") != "ok":
                return False, "ACE-Step not healthy"
            return True, None
    except Exception as e:
        return False, str(e)


def call_ace_step(payload: dict) -> str:
    body = {
        "prompt": payload["caption"],
        "lyrics": payload.get("lyrics", ""),
        "bpm": payload.get("bpm"),
        "key_scale": payload.get("keyscale", ""),
        "audio_duration": payload.get("duration", 240),
        "thinking": True,
        "audio_format": "mp3",
    }
    req = urllib.request.Request(
        f"{ACE_STEP_URL}/release_task",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
            return data["data"]["task_id"]
    except Exception as e:
        print(f"  ACE-Step submission failed: {e}", file=sys.stderr)
        sys.exit(1)


def poll_ace_step(task_id: str, poll_interval: int = 10, timeout: int = 600) -> dict:
    start = time.time()
    while True:
        elapsed = int(time.time() - start)
        if elapsed > timeout:
            print("  Timed out waiting for ACE-Step", file=sys.stderr)
            sys.exit(1)
        body = {"task_id_list": [task_id]}
        req = urllib.request.Request(
            f"{ACE_STEP_URL}/query_result",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode())
        except Exception as e:
            elapsed = int(time.time() - start)
            print(f"  Poll error ({elapsed}s), retrying: {e}", flush=True)
            time.sleep(poll_interval)
            continue
        task = data["data"][0]
        status = task["status"]
        if status == 1:
            return task
        elif status == 2:
            print(f"  ACE-Step task failed: {task}", file=sys.stderr)
            sys.exit(1)
        elapsed = int(time.time() - start)
        print(f"  Generating... ({elapsed}s)", flush=True)
        time.sleep(poll_interval)


def wav_to_mp3(wav_path: Path, mp3_path: Path) -> bool:
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(wav_path), "-codec:a", "libmp3lame", "-q:a", "2", str(mp3_path)],
            check=True, capture_output=True,
        )
        wav_path.unlink()
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def download_audio(audio_url: str, output_path: Path):
    full_url = f"{ACE_STEP_URL}{audio_url}"
    try:
        urllib.request.urlretrieve(full_url, output_path)
    except Exception as e:
        print(f"  Download failed: {e}", file=sys.stderr)
        sys.exit(1)


def generate_announcement(text: str, output_path: Path, intensity: float = 0.5):
    if not ANNOUNCE_SCRIPT.exists():
        print(f"  Skipping TTS: {ANNOUNCE_SCRIPT} not found", flush=True)
        return
    cmd = [
        str(KOKORO_PYTHON),
        str(ANNOUNCE_SCRIPT),
        "--text", text[:300],
        "--output", str(output_path),
        "--voice", "bm_george",
        "--intensity", str(intensity),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=300)
        if output_path.stat().st_size > 100:
            print(f"    Announcement → {output_path.name}", flush=True)
        else:
            print(f"    TTS produced empty file, skipping", flush=True)
            output_path.unlink(missing_ok=True)
    except subprocess.CalledProcessError as e:
        print(f"    TTS failed: {e.stderr.strip()[:100]}", flush=True)
    except FileNotFoundError:
        print(f"    TTS skipped (kokoro python not found at {KOKORO_PYTHON})", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Generate a song for Dead Internet Radio")
    parser.add_argument("slot", nargs="*", default=["midnight", "slot"],
                        help="Time slot or description (e.g. 'late night', 'dawn frequency')")
    parser.add_argument("--dry-run", action="store_true",
                        help="Run Producer and DJ only, skip ACE-Step generation")
    parser.add_argument("--tracks", type=int, default=5,
                        help="Number of tracks to generate per set (default: 5)")
    parser.add_argument("--delay", type=int, default=5,
                        help="Seconds to wait between LLM calls to avoid rate limits (default: 5)")
    parser.add_argument("--no-batch", action="store_true",
                        help="Disable batch mode — use per-track LLM calls instead")
    parser.add_argument("--dj-name", type=str, default="",
                        help="DJ name for announcements (default: random)")
    args = parser.parse_args()

    if not OPENROUTER_API_KEY:
        print("Error: OPENROUTER_API_KEY not set in .env", file=sys.stderr)
        sys.exit(1)

    slot = " ".join(args.slot)
    show_dir = OUTPUT_DIR / f"{slugify(slot)}-{time.strftime('%Y%m%d-%H%M%S')}"
    show_prompts_dir = show_dir / "prompts"
    show_dir.mkdir(parents=True, exist_ok=True)
    show_prompts_dir.mkdir(exist_ok=True)
    print(f"Show folder: {show_dir}")

    producer_prompt = load_prompt(PRODUCER_PROMPT_PATH)
    dj_prompt = load_prompt(DJ_PROMPT_PATH)

    print(f"Dead Internet Radio — {slot}")
    print()

    print("1. Producer writing show name and program brief...", flush=True)
    raw = call_llm(producer_prompt, f"Time slot: {slot}\n\nWrite a program brief for this slot.")
    try:
        result = extract_json(raw)
        show_name = result.get("show_name", "").strip()
        brief = result.get("brief", "").strip()
    except (ValueError, json.JSONDecodeError, AttributeError):
        show_name = ""
        brief = ""
    if not show_name or not brief or "User Safety:" in brief or len(brief) < 20:
        print("  Producer output malformed or moderated, retrying with different model...", flush=True)
        raw2 = call_llm(producer_prompt, f"Time slot: {slot}\n\nWrite a creative atmospheric program brief for this fictional radio slot.")
        try:
            result2 = extract_json(raw2)
            show_name = result2.get("show_name", "").strip()
            brief = result2.get("brief", "").strip()
        except (ValueError, json.JSONDecodeError, AttributeError):
            show_name = ""
            brief = ""
        if not show_name or not brief:
            show_name = slot
            brief = "A late-night broadcast from Dead Internet Radio."
    print(f"\nShow: {show_name}\n{brief}\n")

    # Save show metadata
    show_meta = {
        "show_name": show_name,
        "slot": slot,
        "dj_name": args.dj_name or "",
    }
    (show_dir / "show.json").write_text(json.dumps(show_meta, indent=2))

    # 2. DJ Opening Announcement
    print("2. Announcer writing DJ opening announcement...", flush=True)
    announcer_prompt = load_prompt(ANNOUNCER_PROMPT_PATH)

    dj_name = args.dj_name or random_dj_name()
    # Update show metadata with actual DJ name
    show_meta["dj_name"] = dj_name
    (show_dir / "show.json").write_text(json.dumps(show_meta, indent=2))
    print(f"   DJ: {dj_name}")

    if args.delay > 0:
        print(f"  Waiting {args.delay}s (rate limit buffer)...", flush=True)
        time.sleep(args.delay)

    dj_announce = call_llm(
        announcer_prompt,
        f"Slot: {slot}\n\nTYPE: DJ_ANNOUNCE\n\nStation ID, show name, and DJ name. The show is called: \"{show_name}\". The DJ name is: {dj_name}. No descriptions, no poetry, no philosophy. Keep it short — 10-20 seconds of speech, about 25-50 words.",
    ).strip().strip('"').strip("'").strip()
    print(f"   [DJ_ANNOUNCE] \"{dj_announce[:180]}\"")

    if not args.dry_run:
        announce_wav = show_dir / "00-dead-internet-radio-opening-dead-internet-radio.wav"
        announce_mp3 = show_dir / "00-dead-internet-radio-opening-dead-internet-radio.mp3"
        print("   Generating TTS...", flush=True)
        generate_announcement(dj_announce, announce_wav, intensity=0.3)
        if announce_wav.exists() and announce_wav.stat().st_size > 100:
            if not wav_to_mp3(announce_wav, announce_mp3):
                print(f"   ffmpeg not found, keeping wav", flush=True)
            print(f"   Opening announcement saved → {announce_mp3.name}")
        else:
            print(f"   TTS produced empty file, skipping announcement", flush=True)

    # Save intro prompt log
    intro_prompt_file = show_prompts_dir / "00-dead-internet-radio-opening-dead-internet-radio.prompt.json"
    intro_prompt_data = {
        "track": 0,
        "slot": slot,
        "brief": brief,
        "type": "dj_announce",
        "text": dj_announce,
        "payload": {
            "title": "Opening Broadcast",
            "artist": "Dead Internet Radio",
            "caption": "Dead Internet Radio — Opening Broadcast",
            "bpm": None,
            "keyscale": "",
            "duration": 0,
        },
    }
    intro_prompt_file.write_text(json.dumps(intro_prompt_data, indent=2))
    print(f"  Announce prompt log → {intro_prompt_file}\n")

    track_history = []
    ace_healthy = None

    # --- BATCH MODE: compose all tracks in one LLM call ---
    if not args.no_batch:
        print(f"3. DJ composing {args.tracks} tracks (batch)...", flush=True)
        if args.delay > 0:
            print(f"  Waiting {args.delay}s (rate limit buffer)...", flush=True)
            time.sleep(args.delay)

        dj_input = (
            f"Program brief:\n\n{brief}\n\n"
            f"Compose {args.tracks} tracks for this DJ set. "
            f"Return a JSON array of exactly {args.tracks} objects.\n\n"
            f"CONSTRAINTS — all tracks must be distinct:\n"
            f"- Different keys — no repeats across all {args.tracks} tracks\n"
            f"- BPM range 80-150, cohesive but varied\n"
            f"- Different synth palettes, drum patterns, and structures\n"
            f"- Different genre angles (coldwave, industrial, deep techno, dark electro, synthwave)\n\n"
            f"Guidance:\n"
            f"- Keep vocals to a minimum. Not all tracks need vocals.\n"
            f"- When vocals are present, sparse and atmospheric.\n"
            f"- Focus on atmosphere, texture, evolving narrative.\n"
            f"- Vary the sonic palette across the set.\n"
            f"- The set should feel like a journey through different rooms of the same dead factory.\n\n"
            f"Output a JSON array of {args.tracks} objects, each with: "
            f"title, artist, caption, lyrics, bpm, keyscale, duration."
        )

        song_json = call_llm(dj_prompt, dj_input)
        songs = extract_json_array(song_json)

        if len(songs) < 2:
            print(f"  WARNING: Batch returned only {len(songs)} tracks, falling back to per-track mode",
                  flush=True)
            args.no_batch = True

    # --- FALLBACK: per-track mode ---
    if args.no_batch:
        print(f"3. DJ composing {args.tracks} tracks (per-track)...", flush=True)
        songs = []
        for i in range(1, args.tracks + 1):
            if i > 1 and args.delay > 0:
                print(f"  Waiting {args.delay}s (rate limit buffer)...", flush=True)
                time.sleep(args.delay)

            if i == 1:
                dj_input = (
                    f"Program brief:\n\n{brief}\n\n"
                    f"This is track 1 of {args.tracks}. Compose the opening track for this DJ set."
                )
            else:
                prev_summary = "\n".join(
                    f"Track {t['number']}: {t['artist']} — \"{t['title']}\" "
                    f"({t['bpm']} BPM, {t['keyscale']})"
                    for t in track_history
                )
                prev_keys = [t["keyscale"] for t in track_history if t["keyscale"]]
                prev_bpms = [t["bpm"] for t in track_history if isinstance(t["bpm"], (int, float))]
                dj_input = (
                    f"Program brief:\n\n{brief}\n\n"
                    f"PREVIOUS TRACKS (DO NOT REPEAT these keys/BPMs):\n{prev_summary}\n\n"
                    f"Used keys: {', '.join(prev_keys)}. DO NOT reuse any of these keys.\n"
                    f"Used BPMs: {', '.join(str(b) for b in prev_bpms)}. Stay at least 10 BPM away from these.\n\n"
                    f"This is track {i} of {args.tracks}. "
                    f"Make this track SOUND DISTINCT from all previous tracks — "
                    f"different key, different tempo range, different synth palette, different drum pattern."
                )

            dj_input += (
                "\n\nGuidance:\n"
                "- Keep vocals to a minimum. Not all tracks need vocals.\n"
                "- When vocals are present, they should be sparse and atmospheric — not overpowering pop vocals.\n"
                "- Focus on atmosphere, texture, and the evolving narrative of the set.\n"
                "- Vary the sonic palette across the set: different synths, different drums, different keys, different tempos per track."
            )

            print(f"3.{i} DJ composing track {i} of {args.tracks}...", flush=True)
            song_json = call_llm(dj_prompt, dj_input)
            song = extract_json(song_json)
            if isinstance(song, list):
                song = song[0]
            song["_prompt"] = dj_input
            songs.append(song)

    # --- Process tracks (shared between batch and per-track) ---
    for i, song in enumerate(songs, 1):
        song["duration"] = min(max(song.get("duration", 180), 60), 360)
        track_prompt = song.pop("_prompt", dj_input)

        title = song.get("title", "").strip() or "Untitled"
        artist = song.get("artist", "").strip() or "Unknown Artist"
        display_name = f"{artist} - {title}"
        caption = song.get("caption", "Untitled")
        print(f"  Track {i}: {display_name}")
        print(f"         {song.get('bpm', '?')} BPM, {song.get('keyscale', '?')}, "
              f"{song.get('duration', '?')}s")

        track_history.append({
            "number": i,
            "title": title,
            "artist": artist,
            "display_name": display_name,
            "caption": caption,
            "bpm": song.get("bpm", "?"),
            "keyscale": song.get("keyscale", ""),
            "duration": song.get("duration", 0),
            "payload": song,
            "prompt": track_prompt,
        })

        if args.dry_run:
            song_file = show_prompts_dir / f"dry-run-track-{i:02d}-{slugify(display_name)}.json"
            song_file.write_text(json.dumps(song, indent=2))
            print(f"  Song data saved to {song_file}")
        prompt_file = show_prompts_dir / f"{i:02d}-{slugify(display_name)}-dead-internet-radio.prompt.json"
        prompt_data = {
            "track": i,
            "slot": slot,
            "brief": brief,
            "system_prompt": dj_prompt,
            "user_prompt": dj_input,
            "payload": song,
        }
        prompt_file.write_text(json.dumps(prompt_data, indent=2))
        print(f"  Prompt log → {prompt_file}")
    print()

    if args.dry_run:
        # Skip ACE-Step and voiceovers in dry-run
        pass
    else:
        # --- ACE-Step generation for each track ---
        if ace_healthy is None:
            ace_healthy, err = check_ace_step_health()
            if not ace_healthy:
                print(f"Warning: ACE-Step at {ACE_STEP_URL} not reachable ({err})", file=sys.stderr)
                print("Start it in another terminal:", file=sys.stderr)
                print(f"  cd ACE-Step-1.5 && uv run acestep-api", file=sys.stderr)
                sys.exit(1)

        for t in track_history:
            i = t["number"]
            display_name = t["display_name"]
            song = t["payload"]
            print(f"4.{i} Sending track {i} to ACE-Step...", flush=True)
            task_id = call_ace_step(song)
            print(f"    Task ID: {task_id}")

            print(f"5.{i} Waiting for generation...", flush=True)
            result = poll_ace_step(task_id)
            result_data = json.loads(result["result"])
            audio_path = result_data[0]["file"]

            output_file = show_dir / f"{i:02d}-{slugify(display_name)}-dead-internet-radio.mp3"
            print(f"6.{i} Downloading to {output_file}...", flush=True)
            download_audio(audio_path, output_file)
            print(f"   Track {i} saved to {output_file}")
        print()

        # --- BATCH voiceover generation ---
        voiceover_schedule = []
        next_announce_at = random.randint(1, 2)
        while next_announce_at < args.tracks:
            voiceover_schedule.append(next_announce_at)
            next_announce_at += random.randint(1, 2)

        if voiceover_schedule:
            print(f"Announcer batch: {len(voiceover_schedule)} voiceovers...", flush=True)
            if args.delay > 0:
                print(f"  Waiting {args.delay}s (rate limit buffer)...", flush=True)
                time.sleep(args.delay)

            announcer_prompt = load_prompt(ANNOUNCER_PROMPT_PATH)
            vo_entries = []
            for idx in voiceover_schedule:
                t = track_history[idx - 1]
                vo_entries.append(
                    f"- Voiceover after track {idx}, "
                    f"NEXT TRACK: {t['artist']} — \"{t['title']}\""
                )

            vo_input = (
                f"Show: \"{show_name}\"\n"
                f"Slot: {slot}\n\n"
                f"DJ name: {dj_name}\n\n"
                f"Program brief:\n\n{brief}\n\n"
                f"Generate {len(voiceover_schedule)} mid-set voiceovers. "
                f"Return a JSON array of {len(voiceover_schedule)} objects.\n\n"
                f"Each voiceover: announce the next track and identify yourself as DJ {dj_name}. "
                f"Weave in the station ID ('Dead Internet Radio' or 'D.I.R.'). "
                f"Under 30 words. Vary the phrasing — don't repeat the same intro formula.\n\n"
                f"Voiceovers:\n" + "\n".join(vo_entries) + "\n\n"
                f"Output: JSON array with objects: "
                f'{{"track_number": int, "type": "TRACK_INTRO", "text": string}}'
            )

            vo_json = call_llm(announcer_prompt, vo_input)
            try:
                voiceovers = extract_json_array(vo_json)
            except ValueError:
                print("  WARNING: Could not parse voiceover batch, skipping", flush=True)
                voiceovers = []

            for vo in voiceovers:
                track_num = vo.get("track_number", 0)
                if track_num < 1 or track_num > len(track_history):
                    continue
                t = track_history[track_num - 1]
                atype = vo.get("type", "THOUGHT")
                text = vo.get("text", "").strip().strip('"').strip("'").strip()
                if not text:
                    continue

                wav = show_dir / f"{track_num:02d}-DJ-voice-{slugify(t['display_name'])}-dead-internet-radio.wav"
                mp3 = show_dir / f"{track_num:02d}-DJ-voice-{slugify(t['display_name'])}-dead-internet-radio.mp3"
                print(f"  [{atype}] \"{text[:120]}\"")
                print(f"  Generating TTS...", flush=True)
                generate_announcement(text, wav, intensity=0.2 + random.random() * 0.2)
                if wav.exists() and wav.stat().st_size > 100:
                    if not wav_to_mp3(wav, mp3):
                        print(f"   ffmpeg not found, keeping wav", flush=True)
            print()

    tracks_md = "\n".join(
        f"### Track {t['number']}: {t['artist']} — \"{t['title']}\"\n"
        f"- **BPM:** {t['bpm']}\n"
        f"- **Key:** {t['keyscale']}\n"
        f"- **Duration:** {t['duration']}s\n"
        f"- **Caption:** {t['caption']}\n"
        f"- **Prompt:** `{t['prompt']}`\n"
        for t in track_history
    )
    all_payloads = [t["payload"] for t in track_history]
    set_content = f"""# {show_name}

## Program Brief

{brief}

## Tracks

{tracks_md}
## Full Set Data

```json
{json.dumps(all_payloads, indent=2)}
```
"""
    set_file = show_prompts_dir / f"set-{slugify(slot)}.md"
    set_file.write_text(set_content)
    print(f"  Set notes → {set_file}")

    total_duration = sum(
        t["duration"] for t in track_history if isinstance(t.get("duration"), (int, float))
    )
    print(f"\nDone! {args.tracks} tracks generated (~{total_duration // 60} min total)")


if __name__ == "__main__":
    main()
