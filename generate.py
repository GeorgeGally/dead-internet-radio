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
# Memory knobs. Peak memory scales with track length, so cap it. Thinking runs
# the 4B LM to plan the audio codes: it drops the cheesy high EDM synths
# (sound lab, 2026-10-24). ACE_STEP_THINKING=0 if the LM isn't loaded.
MIN_TRACK_SECONDS = int(os.getenv("MIN_TRACK_SECONDS", "105"))
MAX_TRACK_SECONDS = int(os.getenv("MAX_TRACK_SECONDS", "180"))
ACE_STEP_THINKING = os.getenv("ACE_STEP_THINKING", "1").lower() not in ("0", "false", "no")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
# Comma-separated list of models to try in order. A pinned model keeps the
# station's voice consistent across tracks — `openrouter/free` picks a different
# (usually tiny) model on every call, which is what turned sets generic.
OPENROUTER_MODELS = [m.strip() for m in OPENROUTER_MODEL.split(",") if m.strip()]
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
    "Null Set", "Carrier", "Mainframe", "Dial Tone", "Kilohertz", "Vector",
    "Mira Volt", "Dead Pixel", "Sector 9", "Halogen", "Cold Boot", "Ferrite",
    "Lux Ultra", "Teletype", "Modem", "Oscilla", "Black Box", "Dr. Ohm",
    "Vanta", "Cathode", "Syntax Error", "Relay", "Nova Grid", "Loop Station",
    "Chrome Widow", "Baud", "Sub Zero", "Ultravox Unit", "Polygon", "Night Bus",
]


PROGRESS_MARKER = "[PROGRESS]"


def emit_progress(data: dict):
    print(f"{PROGRESS_MARKER} {json.dumps(data)}", flush=True)


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
    """Call the first model in OPENROUTER_MODELS that answers.

    Walks the list on rate limits and hard errors so one overloaded free
    endpoint can't sink a whole show.
    """
    last_error = None
    for model in OPENROUTER_MODELS:
        for attempt in range(2):
            headers = {
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            }
            body = {
                "model": model,
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
                with urllib.request.urlopen(req, timeout=180) as resp:
                    result = json.loads(resp.read().decode())
                    content = result["choices"][0]["message"]["content"]
                    if content is None:
                        raise ValueError("LLM returned null content")
                    if model != OPENROUTER_MODELS[0]:
                        print(f"  (written by {model})", flush=True)
                    return content
            except urllib.error.HTTPError as e:
                last_error = f"{model} → HTTP {e.code}"
                if e.code == 429:
                    wait = 3 * (attempt + 1)
                    print(f"  {model} rate limited, retrying in {wait}s...", flush=True)
                    time.sleep(wait)
                    continue
                print(f"  {model} failed ({e.code}), trying next model...", flush=True)
                break
            except Exception as e:
                last_error = f"{model} → {e}"
                if attempt < 1:
                    print(f"  {e}, retrying...", flush=True)
                    time.sleep(3)
                    continue
                print(f"  {model} failed: {e}", flush=True)

    print(f"  LLM call failed on every model ({last_error})", file=sys.stderr)
    sys.exit(1)


def already_broadcast_names() -> tuple[list[str], list[str]]:
    """Artist names and titles this station has already used.

    Read from the mix cue sheets and the per-show prompt logs, so the DJ can be
    told what not to write again. These are the names that turned into furniture.
    """
    artists: set[str] = set()
    titles: set[str] = set()

    for cues in Path("mixes").glob("*.cues.json"):
        try:
            entries = json.loads(cues.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        if not isinstance(entries, list):
            continue
        for e in entries:
            if isinstance(e, dict):
                if e.get("artist"):
                    artists.add(str(e["artist"]).strip())
                if e.get("title"):
                    titles.add(str(e["title"]).strip())

    for log in Path("output").glob("*/prompts/*.prompt.json"):
        try:
            data = json.loads(log.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        payload = data.get("payload") or {}
        if isinstance(payload, dict):
            if payload.get("artist"):
                artists.add(str(payload["artist"]).strip())
            if payload.get("title"):
                titles.add(str(payload["title"]).strip())

    return sorted(artists), sorted(titles)


def avoid_block() -> str:
    """The AVOID section appended to every DJ prompt."""
    artists, titles = already_broadcast_names()
    if not artists and not titles:
        return ""
    return (
        "\n\nAVOID — this station has already broadcast these. Never reuse a name or "
        "title from this list, and never reuse one twice inside the same set:\n"
        f"Artist names already used: {', '.join(artists)}\n"
        f"Titles already used: {', '.join(titles)}\n"
    )


LISTENER_TASTE_PATH = OUTPUT_DIR / "listener-taste.json"


def taste_block() -> str:
    """What listeners voted for and turned away, written by Rails (Library.write_taste!)."""
    try:
        taste = json.loads(LISTENER_TASTE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return ""
    liked, turned = taste.get("liked") or [], taste.get("turned_away") or []
    if not liked and not turned:
        return ""
    block = "\n\nLISTENERS — how the station's listeners voted on earlier songs. Lessons, not templates: never copy a sound.\n"
    if liked:
        block += "They kept coming back for:\n" + "\n".join(f"- {c[:240]}" for c in liked) + "\n"
    if turned:
        block += "They turned these away; steer clear of what made them:\n" + "\n".join(f"- {c[:240]}" for c in turned) + "\n"
    return block


def wait_for_memory(threshold_pct=25, max_wait_s=1800):
    """Block until macOS reports enough free memory (backpressure between tracks).

    ACE-Step on MPS keeps the whole model stack resident; submitting the next
    long-track task while swap is filling is what hard-freezes the machine.
    Best-effort: returns immediately on non-macOS or if parsing fails.
    """
    import subprocess
    deadline = time.time() + max_wait_s
    while True:
        try:
            out = subprocess.run(["memory_pressure"], capture_output=True, text=True, timeout=15).stdout
            m = re.search(r"System-wide memory free percentage:\s*(\d+)%", out)
            if not m:
                return
            free = int(m.group(1))
            if free >= threshold_pct:
                return
            print(f"  Memory low ({free}% free) — waiting for pressure to drop...", flush=True)
        except Exception:
            return
        if time.time() >= deadline:
            # Carrying on is what froze the machine. Stop; --resume-dir picks up from here.
            print("  ERROR: memory still low — stopping. Re-run with --resume-dir to continue.", file=sys.stderr, flush=True)
            sys.exit(75)
        time.sleep(30)


def stop_ace_step():
    port = ACE_STEP_URL.rsplit(":", 1)[-1].strip("/")
    script = Path(__file__).parent / "ACE-Step-1.5" / "close_api_server.sh"
    print("  Stopping ACE-Step to free memory...", flush=True)
    subprocess.run([str(script), "--port", port, "--force"], check=False)


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


REGISTER_LINE = "Everything in the low and mid register; the melody stays in the bass."


def station_caption(caption: str) -> str:
    """The DJ's caption plus the one line every track needs.

    High leads and plucks are what made tracks sound cheesy (sound lab,
    2026-10-24), and the DJ forgets to say so; ACE-Step ignores negation, so
    the line is phrased as what should be there.
    """
    caption = caption.strip()
    # Arpeggios too: the good ones were bass sequences, the high ones cheese
    # (sound lab round 4), so the register line stays on.
    if "low and mid register" in caption.lower():
        return caption
    return f"{caption} {REGISTER_LINE}"


def call_ace_step(payload: dict) -> str:
    body = {
        # Text to music only: the server refuses covers and reference audio
        # (patches/ace-step-text2music-only.patch).
        "task_type": "text2music",
        "prompt": station_caption(payload["caption"]),
        "lyrics": payload.get("lyrics", ""),
        "bpm": payload.get("bpm"),
        "key_scale": payload.get("keyscale", ""),
        "audio_duration": payload.get("duration", 240),
        "thinking": ACE_STEP_THINKING,
        # The LM may plan the song but must not rewrite our caption: its
        # rewrites drift to generic pop (sound lab, 2026-10-24).
        "use_cot_caption": False,
        # The API defaults to 2 variations and we keep only the first.
        "batch_size": 1,
        # WAV is written by soundfile; ACE-Step's MP3 path needs Homebrew's FFmpeg
        # libraries, which break whenever Homebrew upgrades a codec under them.
        "audio_format": "wav",
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


def query_ace_step(task_id: str, http_timeout: int = 10) -> dict | None:
    body = {"task_id_list": [task_id]}
    req = urllib.request.Request(
        f"{ACE_STEP_URL}/query_result",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=http_timeout) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError,
            json.JSONDecodeError, KeyError):
        return None


def poll_ace_step(task_id: str, poll_interval: int = 15, timeout: int = 900,
                  track_number: int = 0, total_tracks: int = 0, estimated_duration: int = 240) -> dict:
    start = time.time()
    consecutive_errors = 0
    while True:
        elapsed = int(time.time() - start)
        if elapsed > timeout:
            print("  Timed out waiting for ACE-Step", file=sys.stderr)
            sys.exit(1)

        data = query_ace_step(task_id)
        if data is None:
            consecutive_errors += 1
            elapsed = int(time.time() - start)
            status = "busy" if consecutive_errors < 15 else "unreachable"
            # The watchdog kills ACE-Step when memory runs low; the task is gone
            # with it, so stop rather than wait out the whole timeout.
            if consecutive_errors >= 24 and not check_ace_step_health()[0]:
                print("  ACE-Step went away (memory watchdog?) - giving up", file=sys.stderr)
                sys.exit(1)
            print(f"  ACE-Step {status} ({elapsed}s), retrying...", flush=True)
            time.sleep(min(poll_interval, 30))
            continue

        consecutive_errors = 0
        task = data["data"][0]
        status = task["status"]
        if status == 1:
            return task
        elif status == 2:
            print(f"  ACE-Step task failed: {task}", file=sys.stderr)
            sys.exit(1)
        elapsed = int(time.time() - start)
        print(f"  Generating... ({elapsed}s)", flush=True)
        if track_number and total_tracks:
            emit_progress({
                "type": "track_progress",
                "number": track_number,
                "total": total_tracks,
                "elapsed_s": elapsed,
                "estimated_s": estimated_duration,
            })
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
    wav_path = output_path.with_suffix(".wav")
    try:
        urllib.request.urlretrieve(full_url, wav_path)
    except Exception as e:
        print(f"  Download failed: {e}", file=sys.stderr)
        sys.exit(1)
    if output_path.suffix == ".wav":
        return
    try:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
                        "-codec:a", "libmp3lame", "-b:a", "320k", str(output_path)], check=True)
    except (OSError, subprocess.CalledProcessError) as e:
        # Keep the WAV: a finished track is never thrown away.
        print(f"  MP3 encode failed ({e}); kept {wav_path}", file=sys.stderr)
        sys.exit(1)
    wav_path.unlink()


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


def request_block(request: dict) -> str:
    """The DJ's brief for a listener request: their title and artist, our sound."""
    block = (
        f"\n\nLISTENER REQUEST — this track is \"{request['title']}\" by {request['artist']}. "
        "Use exactly that title and artist. "
    )
    if request.get("seed_caption"):
        block += (
            "This artist has played on the station before. Make it sound like them, "
            f"a new track in the same sound:\n{request['seed_caption']}\n"
        )
    else:
        block += "A new artist: give them a sound of their own from the station's home families. "
    if request.get("note"):
        block += f"The listener asked for: {request['note']}. Let that shape the mood. "
    return block + "The station's genre rules win over anything the listener asked for."


def request_announcement(announcer_prompt: str, slot: str, dj_name: str, request: dict) -> str:
    """The DJ reads a listener request on air. Falls back to a plain read."""
    who, title, artist = request["requester"], request["title"], request["artist"]
    plain = f"A request from {who}. \"{title}\" by {artist}. DJ {dj_name}, Dead Internet Radio."
    note = f" Their note, for your ears only, never quote it: {request['note']}." if request.get("note") else ""
    text = call_llm(
        announcer_prompt,
        f"Slot: {slot}\n\nTYPE: REQUEST\n\nThe DJ name is: {dj_name}. Read a listener request on air before it plays. "
        f"It is a request from {who}, for \"{title}\" by {artist}.{note} "
        f"Say \"a request from {who}\", the title and the artist, your DJ name and the station. Then one line of your own "
        "in the station's voice: philosophical, odd, or the station's weather. Never cheesy, no radio cliches, "
        "no shout-outs. 20-45 words. Only the spoken text.",
    ).strip().strip('"').strip("'").strip()
    low = text.lower()
    if who.lower() not in low or title.lower() not in low or len(text.split()) > 70:
        return plain
    return text


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
    parser.add_argument("--stop-ace-step", action="store_true",
                        help="Shut ACE-Step down once the tracks are rendered")
    parser.add_argument("--resume-dir", type=str, default="",
                        help="Resume from an existing show directory (skips producer, announcer, DJ phases)")
    parser.add_argument("--request-json", type=str, default="",
                        help="A listener request (requester, artist, title, note, seed_caption): one track, read on air")
    args = parser.parse_args()

    if not OPENROUTER_API_KEY:
        print("Error: OPENROUTER_API_KEY not set in .env", file=sys.stderr)
        sys.exit(1)

    slot = " ".join(args.slot)

    # A listener request is a one-track show: the DJ reads the request, then it plays.
    request = json.loads(Path(args.request_json).read_text()) if args.request_json else None
    if request:
        args.tracks = 1
        args.no_batch = True

    # ── Resume check & state loading ───────────────────────────
    track_history = []
    ace_healthy = None
    voiceover_schedule = []

    if args.resume_dir:
        show_dir = Path(args.resume_dir)
        if not show_dir.exists():
            print(f"Error: resume directory {show_dir} not found", file=sys.stderr)
            sys.exit(1)
        state_path = show_dir / ".resume_state.json"
        if not state_path.exists():
            print(f"Error: no resume state found in {show_dir}", file=sys.stderr)
            sys.exit(1)
        state = json.loads(state_path.read_text())

        show_name = state["show_name"]
        brief = state.get("brief", "")
        dj_name = state["dj_name"]
        args.tracks = state.get("track_count", args.tracks)
        track_history = state["track_history"]
        voiceover_schedule = state.get("voiceover_schedule", [])

        completed_nums: set[int] = set()
        for f in show_dir.iterdir():
            m = re.match(r"^(\d{2})-.+\.mp3$", f.name)
            if m:
                num = int(m.group(1))
                if num != 0 and "DJ-voice" not in f.name and "opening" not in f.name:
                    completed_nums.add(num)

        total = len(track_history)
        remaining = total - len(completed_nums)
        show_prompts_dir = show_dir / "prompts"
        print(f"Resuming generation in {show_dir}")
        print(f"  Completed tracks: {len(completed_nums)}/{total}, {remaining} remaining")
        emit_progress({"type": "show_dir", "path": str(show_dir)})

        emit_progress({
            "type": "show", "show_name": show_name,
            "dj_name": dj_name, "slot": slot
        })
        for t in track_history:
            n = t["number"]
            if n in completed_nums:
                emit_progress({
                    "type": "track_start", "number": n, "total": total,
                    "title": t["title"], "artist": t["artist"]
                })
                for f in sorted(show_dir.iterdir()):
                    if f.name.startswith(f"{n:02d}-") and f.name.endswith(".mp3") and "DJ-voice" not in f.name:
                        emit_progress({
                            "type": "track_done", "number": n, "total": total,
                            "title": t["title"], "artist": t["artist"],
                            "file": str(f)
                        })
                        break
        print(f"Show: {show_name}\n{brief}\n")
        print(f"   DJ: {dj_name}")

    # ── Fresh generation: create dir, run LLM phases ────────────
    # ── Fresh generation: create dir, run LLM phases ────────────
    if not args.resume_dir:
        show_dir = OUTPUT_DIR / f"{slugify(slot)}-{time.strftime('%Y%m%d-%H%M%S')}"
        show_prompts_dir = show_dir / "prompts"
        show_dir.mkdir(parents=True, exist_ok=True)
        show_prompts_dir.mkdir(exist_ok=True)
        print(f"Show folder: {show_dir}")
        emit_progress({"type": "show_dir", "path": str(show_dir)})

        producer_prompt = load_prompt(PRODUCER_PROMPT_PATH)
        dj_prompt = load_prompt(DJ_PROMPT_PATH)

        print(f"Dead Internet Radio — {slot}")
        print()

        print("1. Producer writing show name and program brief...", flush=True)
        producer_input = f"Time slot: {slot}\n\nWrite a program brief for this slot."
        if request:
            producer_input = (f"Time slot: {slot}\n\nThis show is one listener request: \"{request['title']}\" "
                              f"by {request['artist']}.\n\nWrite a program brief for it.")
        raw = call_llm(producer_prompt, producer_input)

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
        emit_progress({"type": "show", "show_name": show_name, "dj_name": dj_name, "slot": slot})

        if args.delay > 0:
            print(f"  Waiting {args.delay}s (rate limit buffer)...", flush=True)
            time.sleep(args.delay)

        if request:
            dj_announce = request_announcement(announcer_prompt, slot, dj_name, request)
        else:
            dj_announce = call_llm(
                announcer_prompt,
                f"Slot: {slot}\n\nTYPE: DJ_ANNOUNCE\n\nStation ID, show name, and DJ name. The show is called: \"{show_name}\". The DJ name is: {dj_name}. No descriptions, no poetry, no philosophy. Keep it short — 10-20 seconds of speech, about 25-50 words.",
            ).strip().strip('"').strip("'").strip()
        print(f"   [DJ_ANNOUNCE] \"{dj_announce[:180]}\"")

        # A request's read is a DJ voice at 00, so it rides on the track as its voiceover.
        opening_stem = "00-DJ-voice-request-dead-internet-radio" if request else "00-dead-internet-radio-opening-dead-internet-radio"
        if not args.dry_run:
            announce_wav = show_dir / f"{opening_stem}.wav"
            announce_mp3 = show_dir / f"{opening_stem}.mp3"
            print("   Generating TTS...", flush=True)
            generate_announcement(dj_announce, announce_wav, intensity=0.3)
            if announce_wav.exists() and announce_wav.stat().st_size > 100:
                if not wav_to_mp3(announce_wav, announce_mp3):
                    print(f"   ffmpeg not found, keeping wav", flush=True)
                print(f"   Opening announcement saved → {announce_mp3.name}")
            else:
                print(f"   TTS produced empty file, skipping announcement", flush=True)

        # Save intro prompt log
        intro_prompt_file = show_prompts_dir / f"{opening_stem}.prompt.json"
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

        ace_healthy = None
        # A request names its own artist, often one the station already played.
        avoid = "" if request else avoid_block() + taste_block()
        if avoid:
            used_artists, used_titles = already_broadcast_names()
            print(f"   Anti-reuse list: {len(used_artists)} artist names, "
                  f"{len(used_titles)} titles from previous broadcasts", flush=True)

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
                f"- Genre: whatever the slot or brief asks for, any genre or blend (e.g. 'slomo disco', 'electroclash'), vary the tracks within it; with only a mood or time, choose freely in the station's sound. Follow the DJ lessons so it never turns cheesy. When the slot names a genre, every caption starts with that genre word and at most one track leans into a neighbouring genre. Play the genre at its own tempo and beat (electroclash and techno 125+ BPM, four-on-the-floor). Party words (party, club, banger, dancefloor, rave) mean four-on-the-floor bangers at the top of the genre's range. Mood words make tracks slower and darker, never ambient or drone; every track has drums, 90 BPM or more\n"
                f"- Different basslines, synth palettes and textures; the drum pattern is the genre's own\n"
                f"- Let the brief's SUBJECT drive the sonic identity: rhythm style, synth motifs, vocal treatment. Two shows from different subjects must not be interchangeable.\n\n"
                f"Guidance:\n"
                f"- Keep vocals to a minimum. Not all tracks need vocals.\n"
                f"- When vocals are present, sparse and atmospheric.\n"
                f"- Vary the sonic palette across the set.\n\n"
                f"Output a JSON array of {args.tracks} objects, each with: "
                f"title, artist, caption, lyrics, bpm, keyscale, duration."
                f"{avoid}"
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
                    "- The genre the slot or brief asks for wins; follow the DJ lessons so it never turns cheesy. Every track has drums, 90 BPM or more.\n"
                    "- Vary the sonic palette across the set: different synths, different drums, different keys, different tempos per track."
                    f"{avoid}"
                )
                if request:
                    dj_input += request_block(request)

                print(f"3.{i} DJ composing track {i} of {args.tracks}...", flush=True)
                song_json = call_llm(dj_prompt, dj_input)
                song = extract_json(song_json)
                if isinstance(song, list):
                    song = song[0]
                if request:
                    song["title"], song["artist"] = request["title"], request["artist"]
                song["_prompt"] = dj_input
                songs.append(song)

        # --- Process tracks (shared between batch and per-track) ---
        for i, song in enumerate(songs, 1):
            # Lengths vary across a set: the DJ's choice, nudged so no two match.
            asked = song.get("duration") or random.randint(MIN_TRACK_SECONDS, MAX_TRACK_SECONDS)
            song["duration"] = min(max(int(asked) + random.randint(-12, 12), MIN_TRACK_SECONDS), MAX_TRACK_SECONDS)
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

        # ── Save resume state ────────────────────────────────────────
        voiceover_schedule = []
        next_announce_at = random.randint(1, 2)
        while next_announce_at < args.tracks:
            voiceover_schedule.append(next_announce_at)
            next_announce_at += random.randint(1, 2)

        resume_state = {
            "show_name": show_name,
            "brief": brief,
            "dj_name": dj_name,
            "track_count": args.tracks,
            "voiceover_schedule": voiceover_schedule,
            "track_history": [
                {
                    "number": t["number"],
                    "title": t["title"],
                    "artist": t["artist"],
                    "display_name": t["display_name"],
                    "caption": t["caption"],
                    "bpm": t["bpm"],
                    "keyscale": t["keyscale"],
                    "duration": t["duration"],
                    "prompt": t.get("prompt", ""),
                    "payload": t["payload"],
                }
                for t in track_history
            ],
        }
        (show_dir / ".resume_state.json").write_text(json.dumps(resume_state, indent=2))

        # Extend show.json with brief, voiceover_schedule, track_count
        show_meta["brief"] = brief
        show_meta["voiceover_schedule"] = voiceover_schedule
        show_meta["track_count"] = args.tracks
        (show_dir / "show.json").write_text(json.dumps(show_meta, indent=2))

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
                print("  ./start-ace-step.sh", file=sys.stderr)
                sys.exit(1)

        total = len(track_history)
        for t in track_history:
            i = t["number"]
            display_name = t["display_name"]
            song = t["payload"]

            # In resume mode, skip tracks whose MP3 already exists on disk
            if args.resume_dir:
                expected = show_dir / f"{i:02d}-{slugify(display_name)}-dead-internet-radio.mp3"
                if expected.exists():
                    print(f"  Track {i} already exists, skipping ACE-Step", flush=True)
                    continue

            emit_progress({"type": "track_start", "number": i, "total": total,
                           "title": t["title"], "artist": t["artist"]})
            if i > 1:
                wait_for_memory()
            print(f"4.{i} Sending track {i} to ACE-Step...", flush=True)
            task_id = call_ace_step(song)
            print(f"    Task ID: {task_id}")

            print(f"5.{i} Waiting for generation...", flush=True)
            estimated = song.get("duration", 240)
            result = poll_ace_step(task_id, track_number=i, total_tracks=total,
                                   estimated_duration=estimated)
            result_data = json.loads(result["result"])
            audio_path = result_data[0]["file"]

            output_file = show_dir / f"{i:02d}-{slugify(display_name)}-dead-internet-radio.mp3"
            print(f"6.{i} Downloading to {output_file}...", flush=True)
            download_audio(audio_path, output_file)
            print(f"   Track {i} saved to {output_file}")
            emit_progress({"type": "track_done", "number": i, "total": total,
                           "title": t["title"], "artist": t["artist"],
                           "file": str(output_file)})
        print()

        # Music is done: free ACE-Step's memory before Kokoro loads for the voiceovers.
        if args.stop_ace_step and not args.dry_run:
            stop_ace_step()

        # --- BATCH voiceover generation ---
        # Schedule was already set during fresh generate (save-state) or loaded from resume state
        emit_progress({"type": "voiceovers", "count": len(voiceover_schedule)})
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

                # In resume mode, skip if voiceover file already exists
                if args.resume_dir and mp3.exists():
                    print(f"  Voiceover for track {track_num} already exists, skipping", flush=True)
                    continue

                print(f"  [{atype}] \"{text[:120]}\"")
                print(f"  Generating TTS...", flush=True)
                generate_announcement(text, wav, intensity=0.2 + random.random() * 0.2)
                final_file = None
                if wav.exists() and wav.stat().st_size > 100:
                    if wav_to_mp3(wav, mp3):
                        final_file = mp3
                    else:
                        final_file = wav
                if final_file:
                    emit_progress({"type": "vo_done", "number": track_num,
                                   "text": text[:80], "file": str(final_file)})
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
    emit_progress({"type": "complete", "show_dir": str(show_dir),
                   "tracks": args.tracks, "total_duration_s": total_duration})
    print(f"\nDone! {args.tracks} tracks generated (~{total_duration // 60} min total)")


if __name__ == "__main__":
    main()
