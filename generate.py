#!/usr/bin/env python3
import argparse
import http.client
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
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
# The generation PC's 8 GB GPU runs out of memory at 360 s and has 200 MB left at 330 s.
MAX_TRACK_SECONDS = int(os.getenv("MAX_TRACK_SECONDS", "300"))
# Most songs land evenly across this range. A few fall short of it, fewer run past it.
NORMAL_TRACK_SECONDS = (150, 270)
SHORT_TRACK_CHANCE = 1 / 20
LONG_TRACK_CHANCE = 1 / 50
ACE_STEP_THINKING = os.getenv("ACE_STEP_THINKING", "1").lower() not in ("0", "false", "no")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
# Comma-separated models are tried in order, with the free router as a fallback
# when it is not already configured; pinned free models can disappear.
OPENROUTER_MODELS = [m.strip() for m in OPENROUTER_MODEL.split(",") if m.strip()]
if "openrouter/free" not in OPENROUTER_MODELS:
    OPENROUTER_MODELS.append("openrouter/free")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OUTPUT_DIR = Path("output")
PROMPTS_OUTPUT_DIR = OUTPUT_DIR / "prompts"

PROMPTS_DIR = Path("prompts")
# The admin's prompt library: one prompt per kind is active, each kind's
# "Original" is its seed file in prompts/. Rails reads the same kinds file.
MASTER_PROMPTS_PATH = PROMPTS_DIR / "master_prompts.json"
# Written by Rails whenever the library changes, and sent to the generation PC.
ACTIVE_PROMPTS_PATH = OUTPUT_DIR / "active-prompts.json"
# A slot "prompts {"slot": ..., "prompts": {...}}" carries a job's chosen
# prompts, so the generation PC passes them on as it passes any slot.
SLOT_PROMPTS_PREFIX = "prompts "

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


_chosen_prompts: dict | None = None
_prompts_used: dict = {}


def master_kinds() -> dict:
    return json.loads(MASTER_PROMPTS_PATH.read_text())


def use_prompts(prompts) -> None:
    """This run's prompts, {kind: {name, version, body}}, in place of the active file."""
    global _chosen_prompts
    if isinstance(prompts, dict):
        _chosen_prompts = prompts


def unwrap_slot(slot: str) -> str:
    """A slot that carries its job's prompts: take them, return the slot itself."""
    if not slot.startswith(SLOT_PROMPTS_PREFIX + "{"):
        return slot
    wrapped = json.loads(slot[len(SLOT_PROMPTS_PREFIX):])
    use_prompts(wrapped.get("prompts"))
    return str(wrapped.get("slot") or "")


def chosen_prompts() -> dict:
    if _chosen_prompts is not None:
        return _chosen_prompts
    try:
        return json.loads(ACTIVE_PROMPTS_PATH.read_text()).get("prompts") or {}
    except (OSError, ValueError, AttributeError):
        return {}


def original_prompt(kind: str) -> str:
    return load_prompt(PROMPTS_DIR / master_kinds()[kind]["file"])


def master_prompt(kind: str) -> str:
    """The system prompt for a kind: the chosen one, or Original when none is
    chosen, it is empty, or it already failed this run."""
    if _prompts_used.get(kind, {}).get("fell_back"):
        return original_prompt(kind)
    chosen = chosen_prompts().get(kind)
    body = str(chosen.get("body") or "").strip() if isinstance(chosen, dict) else ""
    if body:
        info = {"name": str(chosen.get("name") or "Untitled"), "version": chosen.get("version")}
    else:
        body, info = original_prompt(kind), {"name": "Original", "version": None, "from": "file"}
    _prompts_used.setdefault(kind, info)
    return body


def fall_back(kind: str, why: str) -> str:
    """Original for the rest of the run, logged. A broken prompt never stops a show."""
    used = _prompts_used.setdefault(kind, {"name": "Original"})
    if not used.get("fell_back") and master_prompt(kind) != original_prompt(kind):
        print(f"  {master_kinds()[kind]['label']} prompt \"{used['name']}\" {why}: using Original", flush=True)
        used.update(fell_back=True, why=why)
    return original_prompt(kind)


def ask_llm(kind: str, user_message: str, parse=None):
    """call_llm with the kind's master prompt; output the pipeline cannot read
    is asked again of Original."""
    parse = parse or (lambda raw: raw)
    system = master_prompt(kind)
    try:
        return parse(call_llm(system, user_message))
    except (ValueError, AttributeError, KeyError, TypeError, IndexError) as err:
        if system == original_prompt(kind):
            raise
        return parse(call_llm(fall_back(kind, f"gave output the pipeline cannot read ({err})"), user_message))


def spoken(raw: str) -> str:
    text = raw.strip().strip('"').strip("'").strip()
    if not text:
        raise ValueError("no spoken text")
    return text


def prompts_used() -> dict:
    return {kind: dict(info) for kind, info in _prompts_used.items()}


def log_prompts_used(prompts_dir: Path) -> None:
    """Which master prompts this show was written with, beside its prompt logs."""
    if _prompts_used:
        prompts_dir.mkdir(parents=True, exist_ok=True)
        (prompts_dir / "master-prompts.json").write_text(json.dumps(prompts_used(), indent=2))
        print_prompts_used()


def print_prompts_used() -> None:
    kinds = master_kinds()
    named = [f"{kinds[k]['label']} \"{v['name']}\"" + (f" v{v['version']}" if v.get("version") else "")
             + (" (fell back to Original)" if v.get("fell_back") else "")
             for k, v in _prompts_used.items()]
    if named:
        print(f"Master prompts: {', '.join(named)}", flush=True)


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
            entries = json.loads(cues.read_text(errors="replace"))
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
            data = json.loads(log.read_text(errors="replace"))
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


# Words too common to make a phrase distinctive on their own.
PHRASE_FILLER = {
    "a", "an", "the", "and", "of", "in", "on", "at", "to", "with", "through", "into", "from",
    "by", "for", "over", "under", "its", "it", "is", "that", "this", "every", "one", "bpm",
    "minor", "major", "sharp", "flat", "four", "two", "floor", "four-on-the-floor",
}


def phrases(text: str, size: int = 4) -> set[str]:
    """The runs of `size` words inside each clause of a text, lowercased, minus
    the ones made of filler alone ("on two and four") or of tempo and key."""
    out = set()
    for clause in re.split(r"[.,;:!?()/—–]+", str(text or "").lower()):
        words = re.findall(r"[a-z0-9][a-z0-9'-]*", clause)
        for i in range(len(words) - size + 1):
            run = words[i:i + size]
            if sum(w not in PHRASE_FILLER and not w.isdigit() and len(w) > 1 for w in run) >= 2 and "bpm" not in run:
                out.add(" ".join(run))
    return out


def song_sound_text(payload: dict) -> str:
    return " ".join(str(payload.get(k) or "") for k in ("caption", "frequency_band", "modulation_type", "signal_path"))


def worn_phrases(shows: int = 4, limit: int = 30) -> list[str]:
    """Phrases the last few shows wrote into more than one song. The DJ copies
    the station's own words from song to song ("pushed through an overloaded
    preamp until the concrete answers back"), so recent sets read the same."""
    by_show: dict[Path, list[Path]] = {}
    for log in OUTPUT_DIR.glob("*/prompts/[0-9]*.prompt.json"):
        by_show.setdefault(log.parent, []).append(log)
    recent = sorted(by_show.values(), key=lambda logs: max(l.stat().st_mtime for l in logs), reverse=True)[:shows]
    songs: dict[str, int] = {}
    sets: dict[str, set] = {}
    for logs in recent:
        for log in logs:
            try:
                payload = json.loads(log.read_text(errors="replace")).get("payload") or {}
            except (json.JSONDecodeError, OSError, AttributeError):
                continue
            # A remix is its song again, not a new song repeating it.
            if not isinstance(payload, dict) or not payload.get("bpm") or log.parent.parent.name.startswith("remix-"):
                continue
            for p in phrases(song_sound_text(payload)):
                songs[p] = songs.get(p, 0) + 1
                sets.setdefault(p, set()).add(log.parent)
    picked: list[str] = []
    # Worn across sets first, then within one.
    for p in sorted(songs, key=lambda p: (-len(sets[p]), -songs[p], p)):
        if songs[p] < 2:
            continue
        # Neighbouring runs of one sentence say the same thing; keep one.
        head, tail = p.rsplit(" ", 1)[0], p.split(" ", 1)[1]
        if any(head in q or tail in q for q in picked):
            continue
        picked.append(p)
        if len(picked) == limit:
            break
    return picked


def worn_block() -> str:
    """The phrases recent sets wore out, for the DJ to write around."""
    worn = worn_phrases()
    if not worn:
        return ""
    return ("\n\nWORN PHRASES — recent sets used these in several songs. Never write them "
            "or close variants; say it another way or say something else:\n"
            + "\n".join(f"- {p}" for p in worn) + "\n")


def shared_phrases(songs: list, exempt: list[int] = ()) -> list[str]:
    """Phrases two songs of one set share, apart from what tracks by one shared
    artist (numbers in `exempt`) say about their act's sound."""
    seen: dict[str, int] = {}
    shared = set()
    for i, song in enumerate(songs, 1):
        for p in phrases(song_sound_text(song)):
            if p in seen and not (i in exempt and seen[p] in exempt):
                shared.add(p)
            seen.setdefault(p, i)
    return sorted(shared)


def track_ideas(result, count: int) -> list[str]:
    """The producer's idea for each track: what that one song is. Missing ones
    stay empty and the DJ works from the brief alone."""
    ideas = result.get("tracks") if isinstance(result, dict) else None
    ideas = [str((i.get("idea") if isinstance(i, dict) else i) or "").strip() for i in ideas] if isinstance(ideas, list) else []
    return (ideas + [""] * count)[:count]


def ideas_block(ideas: list[str]) -> str:
    lines = [f"{n}. {idea}" for n, idea in enumerate(ideas, 1) if idea]
    if not lines:
        return ""
    return ("TRACK IDEAS — the producer's idea for each track. Track N is idea N: "
            "its subject, era, instruments, voice and room come from it, so a listener "
            "could tell the ideas apart with the titles covered:\n" + "\n".join(lines) + "\n\n")


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
# Kicks and percussion kept coming out harsh, and the bass thin (listening,
# 2026-11): the DJ asks for crunch and ACE-Step puts it on the drums.
MIX_LINE = "A soft, rounded kick and quiet dry percussion sit under a deep, full, modern bass."


def station_caption(caption: str) -> str:
    """The DJ's caption plus the one line every track needs.

    High leads and plucks are what made tracks sound cheesy (sound lab,
    2026-10-24), and the DJ forgets to say so; ACE-Step ignores negation, so
    the line is phrased as what should be there.
    """
    caption = caption.strip()
    # Arpeggios too: the good ones were bass sequences, the high ones cheese
    # (sound lab round 4), so the register line stays on.
    for line in (REGISTER_LINE, MIX_LINE):
        if line.lower() not in caption.lower():
            caption = f"{caption} {line}"
    return caption


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
        # Long enough to outlast a cool guard freeze: the request waits in the
        # socket until ACE-Step wakes. Retrying instead would render the song twice.
        with urllib.request.urlopen(req, timeout=600) as resp:
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
    # A read timeout is a bare TimeoutError and a dropped connection is an
    # http.client error; neither arrives as URLError. The cool guard freezes
    # ACE-Step mid-render, so a silent server is a missed poll, not a dead show.
    except (OSError, http.client.HTTPException, json.JSONDecodeError):
        return None


def poll_ace_step(task_id: str, poll_interval: int = 15,
                  track_number: int = 0, total_tracks: int = 0, estimated_duration: int = 240) -> dict:
    # Render time grows with the song, and the cool guard has stretched it to 4x.
    timeout = max(900, estimated_duration * 6)
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


def pick_length() -> int:
    roll = random.random()
    if roll < LONG_TRACK_CHANCE:
        return random.randint(NORMAL_TRACK_SECONDS[1] + 1, MAX_TRACK_SECONDS)
    if roll < LONG_TRACK_CHANCE + SHORT_TRACK_CHANCE:
        return random.randint(MIN_TRACK_SECONDS, NORMAL_TRACK_SECONDS[0] - 1)
    return random.randint(*NORMAL_TRACK_SECONDS)


def spread_lengths(asked: list) -> list[int]:
    """One length per song, spread by pick_length. The DJ's asks only say which song gets which."""
    order = random.sample(range(len(asked)), len(asked))
    order.sort(key=lambda i: int(asked[i] or 0))
    lengths = [0] * len(asked)
    for i, length in zip(order, sorted(pick_length() for _ in asked)):
        lengths[i] = length
    return lengths


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


# A caption that describes a voice. ACE-Step only voices lyric lines, so a
# voice in the caption with an all-[Instrumental] lyric never makes a sound.
VOICE_RE = re.compile(
    r"\b(voices?|vocals?|vocoded|vocoder|spoken|speaks?|speaking|sings?|singing|sung|whisper\w*|"
    r"barked|barks?|chant\w*|narrat\w*|announcer|talk(s|ing)? over|"
    r"murmur(?:s|ing)?|mutter(?:s|ing)?|mumbl(?:e|es|ing)|shout(?:s|ing)?|"
    r"yell(?:s|ing)?|scream(?:s|ing)?|recit(?:e|es|ed)|reads? aloud)\b",
    re.IGNORECASE,
)
NO_VOICE_RE = re.compile(
    r"\b(?:no|without|zero|free of|instrumental only)\b"
    r"(?:(?![,.;\-–—]|\b(?:just|only)\b).)*",
    re.IGNORECASE,
)
MIN_VOICE_LINES = 3


def describes_voice(caption: str) -> bool:
    text = NO_VOICE_RE.sub("", caption or "")
    return bool(VOICE_RE.search(text))


def sung_lines(lyrics: str) -> list[str]:
    """The lines ACE-Step voices: everything that isn't a [Tag]."""
    lines = (line.strip() for line in str(lyrics or "").splitlines())
    return [line for line in lines if line and not re.fullmatch(r"\[[^\]]*\]", line)]


def voice_stabs(lyrics: str, title: str, artist: str) -> str:
    """Sparse stabs from the lines the song already has, then its title and
    artist, spread over the sections with [Instrumental] between."""
    lines = sung_lines(lyrics)
    for extra in (title, artist, title):
        if len(lines) >= MIN_VOICE_LINES:
            break
        if extra:
            lines.append(extra)
    while len(lines) < MIN_VOICE_LINES:
        lines.append("Signal received")
    sections = ["[Intro]", "[Verse]", "[Bridge]", "[Outro]"]
    out = ["[Intro]", "[Instrumental]"]
    for i, line in enumerate(lines):
        out += [sections[min(i + 1, len(sections) - 1)], line, "[Instrumental]"]
    return "\n".join(out)


def lyric_text(value) -> str:
    if not isinstance(value, str):
        return ""
    text = re.sub(r"^```\w*\n?|\n?```$", "", value.strip()).strip()
    try:
        data = json.loads(text)
    except ValueError:
        if text.startswith(("{", "[{")):
            return ""
    else:
        if not isinstance(data, dict) or not isinstance(data.get("lyrics"), str):
            return ""
        text = data["lyrics"].strip()
    if any(re.match(r'^\s*(?:[{}]|["\']?[\w]+["\']?\s*:)', line) for line in text.splitlines()):
        return ""
    return text


def ensure_voice(song: dict) -> dict:
    """A caption with a voice gets lyrics the voice can say: the DJ is asked
    once more, and short stabs fill in if it still writes too few lines."""
    caption = str(song.get("caption") or "")
    original = song.get("lyrics") if isinstance(song.get("lyrics"), str) else ""
    if not describes_voice(caption):
        return song
    if len(sung_lines(original)) >= MIN_VOICE_LINES:
        return {**song, "lyrics": original}
    print("  Caption has a voice but the lyrics barely use it; asking for vocal lines...", flush=True)
    lyrics = ""
    try:
        reply = call_llm(
            "Write only song lyrics, without JSON or commentary.",
            f"This track's sound description has a voice in it:\n{caption}\n\n"
            f"Its lyrics:\n{song.get('lyrics') or '[Instrumental]'}\n\n"
            "ACE-Step only voices lyric lines, so as written the voice never speaks. Rewrite the lyrics: "
            f"{MIN_VOICE_LINES} to 6 short lines spread over a few sections, said the way the caption describes "
            "the voice, with [Instrumental] between them. Keep any lines already there. "
            "Output only the lyrics, no JSON, no commentary.",
        )
        lyrics = lyric_text(reply)
    except SystemExit:
        pass
    remaining = sung_lines(lyrics)
    for line in sung_lines(original):
        if line in remaining:
            remaining.remove(line)
        else:
            lyrics = ""
            break
    if len(sung_lines(lyrics)) < MIN_VOICE_LINES:
        lyrics = voice_stabs(original, str(song.get("title") or ""), str(song.get("artist") or ""))
    return {**song, "lyrics": lyrics}


# Genre, style and instrument words the station's notes can ask for.
NOTE_VOCABULARY = {
    "darkwave", "techno", "electro", "electroclash", "disco", "ebm", "goth", "house", "ambient", "acid",
    "industrial", "synthwave", "synthpop", "trance", "dub", "dubstep", "jungle", "garage", "funk", "jazz",
    "punk", "metal", "rock", "pop", "folk", "blues", "soul", "reggae", "hiphop", "trap", "drill",
    "italo", "krautrock", "shoegaze", "noise", "drone", "vaporwave", "breakbeat", "downtempo",
    "303", "808", "909", "bass", "kick", "snare", "hats", "clap", "cowbell", "synth", "guitar", "drums",
    "piano", "organ", "strings", "brass", "sax", "flute", "violin", "cello", "harp", "vocals", "voice",
    "vocoder", "choir", "percussion", "arpeggio", "sequencer",
}
NOTE_EASING = re.compile(r"\b(too|no|not|without|less|never|don't|dont|stop|remove|lose|cut)\b")


def missing_terms(notes: str, song: dict) -> list[str]:
    """Genre, style and instrument words (NOTE_VOCABULARY) of the station's
    notes the rewritten song never says; every other word (faster, darker,
    punchier) is met by the change itself and is not checked. A note
    asking for less ("too cheesy", "no hats") is met by leaving things out, so
    what follows its easing word is not checked; a tempo is checked against
    bpm."""
    text = " ".join(str(song.get(k) or "") for k in ("caption", "frequency_band", "modulation_type", "signal_path")).lower()
    heard = set(re.findall(r"[a-z0-9]+", text))
    try:
        bpm = float(re.search(r"\d+(?:\.\d+)?", str(song.get("bpm"))).group())
    except (AttributeError, TypeError):
        bpm = None
    missing = []
    for term in re.split(r"[,;.\n]+|\band\b", str(notes or "").lower()):
        easing = NOTE_EASING.search(term)
        if easing:
            term = term[:easing.start()]
        tempo = re.search(r"(\d{2,3})\s*bpm", term)
        if tempo:
            if bpm != float(tempo.group(1)):
                missing.append(f"{tempo.group(1)} BPM")
            term = term.replace(tempo.group(0), " ")
        for word in re.findall(r"[a-z0-9]+", term):
            if word in NOTE_VOCABULARY and word not in heard and word not in missing:
                missing.append(word)
    return missing


SOUND_FIELDS = ("frequency_band", "modulation_type", "signal_path")


def revise_song(old: dict, artist: str, title: str, notes: str) -> tuple[dict, dict]:
    """The producer rewrites the song from the station's notes: caption, sound
    fields, lyrics, tempo, key and length. Returns the new song and the
    producer's review. The notes lead, so a rewrite that leaves out one of
    their words is asked for once more."""
    message = (
        f"Artist: {artist}\nTitle: {title}\n"
        f"Caption: {old.get('caption', '')}\n"
        + "".join(f"{key.replace('_', ' ').capitalize()}: {old.get(key)}\n" for key in SOUND_FIELDS if old.get(key))
        + f"Lyrics:\n{old.get('lyrics', '[Instrumental]')}\n"
        f"BPM: {old.get('bpm')}\nKey: {old.get('keyscale', '')}\nDuration: {old.get('duration')}\n\n"
        f"Notes: {notes}"
    )
    new = ask_llm("rewrite", message, extract_json)
    new = new if isinstance(new, dict) else {}
    left_out = missing_terms(notes, new)
    if new and left_out:
        print(f"  Rewrite leaves out {', '.join(left_out)}; asking again", flush=True)
        retry = extract_json(call_llm(master_prompt("rewrite"), message + f"\n\nYour last rewrite left out: {', '.join(left_out)}. "
                                      "Every genre, style and instrument the notes name must be in the new song.\n"
                                      f"Your last rewrite: {json.dumps(new)}"))
        if isinstance(retry, dict) and retry.get("caption") and len(missing_terms(notes, retry)) < len(left_out):
            new = retry
    duration = int(new.get("duration") or old.get("duration") or 150)
    song = {
        "title": title,
        "artist": artist,
        "caption": str(new.get("caption") or old.get("caption") or ""),
        "lyrics": str(new.get("lyrics") or old.get("lyrics") or "[Instrumental]"),
        "bpm": new.get("bpm") or old.get("bpm"),
        "keyscale": str(new.get("keyscale") or old.get("keyscale") or ""),
        "duration": min(max(duration, MIN_TRACK_SECONDS), MAX_TRACK_SECONDS),
        # The old sound fields describe the old sound: a rewrite replaces them or drops them.
        **{key: str(new.get(key) or "") for key in SOUND_FIELDS},
    }
    changes = new.get("changes") if isinstance(new.get("changes"), list) else []
    return song, {"diagnosis": str(new.get("diagnosis") or ""), "changes": [str(c) for c in changes]}


def render_take(take: dict, dj_name: str = "", stop_after: bool = False):
    """A new take of a song in a remix folder of its own. With notes, the
    producer first revises the song the way a re-render does."""
    song = take["payload"]
    notes = str(take.get("notes") or "").strip()
    if notes:
        print(f"  Producer revising the take: {notes}", flush=True)
        revised, review = revise_song(song, song["artist"], song["title"], notes)
        song = {**song, **revised}
        print(f"Review: {json.dumps(review)}", flush=True)
    song = ensure_voice(song)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        stamp = time.strftime("%Y%m%d-%H%M%S")
        show_dir = OUTPUT_DIR / f"remix-{stamp}"
        try:
            show_dir.mkdir()
            break
        except FileExistsError:
            if attempt == 2:
                raise
            time.sleep(1)
    stem = f"01-{slugify(song['artist'] + ' - ' + song['title'])}-dead-internet-radio"
    dest = show_dir / f"{stem}.mp3"
    try:
        (show_dir / "prompts").mkdir()
        (show_dir / "show.json").write_text(json.dumps({
            "show_name": f"{song['artist']} — {song['title']}", "dj_name": dj_name or "", "kind": "remix"
        }, indent=2))
        (show_dir / "prompts" / f"{stem}.prompt.json").write_text(json.dumps({
            "track": 1, "payload": song, "take_of": {"file": take.get("file"), "at": stamp},
            **({"master_prompts": prompts_used()} if prompts_used() else {}),
            **({"rerender": {"at": stamp, "notes": notes}} if notes else {}),
        }, indent=2))
        ok, err = check_ace_step_health()
        if not ok:
            raise RuntimeError(f"ACE-Step not reachable ({err})")
        emit_progress({"type": "track_start", "number": 1, "total": 1,
                       "title": song["title"], "artist": song["artist"]})
        task = call_ace_step(song)
        result = poll_ace_step(task, track_number=1, total_tracks=1, estimated_duration=song["duration"])
        download_audio(json.loads(result["result"])[0]["file"], dest)
        if not dest.exists() or dest.stat().st_size < 1000:
            raise RuntimeError("Render produced no audio")
    except (Exception, SystemExit):
        if not any(show_dir.glob("*.wav")):
            shutil.rmtree(show_dir, ignore_errors=True)
        raise
    finally:
        if stop_after:
            stop_ace_step()
    emit_progress({"type": "track_done", "number": 1, "total": 1,
                   "title": song["title"], "artist": song["artist"], "file": str(dest)})
    print(f"Show folder: {show_dir}")
    print(f"Spec: {json.dumps({k: song.get(k) for k in ('caption', 'lyrics', 'bpm', 'keyscale', 'duration')})}")


PLAN_PREFIX = "plan "
PLAN_SONG_KEYS = ("title", "artist", "idea", "caption", "lyrics", "bpm", "keyscale", "duration")


def shared_artist_tracks(count: int) -> list[int]:
    """Track numbers played by one act: two in a set of four or more, three
    from eight, never back to back."""
    size = 3 if count >= 8 else 2 if count >= 4 else 0
    while size:
        picks = sorted(random.sample(range(1, count + 1), size))
        if all(b - a > 1 for a, b in zip(picks, picks[1:])):
            return picks
    return []


def share_artists(songs: list, numbers: list[int]) -> list:
    """Songs by one artist sound like one act: the same name and the same
    sound sentence in every caption. The DJ is asked to repeat the sound word
    for word; this makes sure it does."""
    if numbers and all(0 < n <= len(songs) for n in numbers):
        act = [songs[n - 1] for n in numbers]
        name = next((str(s.get("artist") or "").strip() for s in act if str(s.get("artist") or "").strip()), "")
        sound = next((str(s.get("sound") or "").strip() for s in act if s.get("sound")), "")
        for song in act:
            if name:
                song["artist"] = name
            caption = str(song.get("caption") or "").strip()
            if sound and sound.lower() not in caption.lower():
                song["caption"] = f"{caption} {sound}".strip()
    for song in songs:
        song.pop("sound", None)
    return songs


def plan_song(song: dict) -> dict:
    """One song as the plan shows and keeps it: its idea and what ACE-Step is sent."""
    return {key: song.get(key) for key in PLAN_SONG_KEYS if key != "idea" or key in song}


def read_plan(slot: str) -> dict | None:
    """A slot of "plan {json}" is a plan written by --plan-out and edited on the
    admin: the show is made from exactly it, with no producer or DJ calls. It
    rides in the slot so the generation PC passes it on unchanged."""
    if not slot.startswith(PLAN_PREFIX + "{"):
        return None
    plan = json.loads(slot[len(PLAN_PREFIX):])
    if not isinstance(plan, dict) or not isinstance(plan.get("tracks"), list) or not plan["tracks"]:
        raise ValueError("plan has no tracks")
    return plan


def request_announcement(slot: str, dj_name: str, request: dict) -> str:
    """The DJ reads a listener request on air. Falls back to a plain read."""
    who, title, artist = request["requester"], request["title"], request["artist"]
    plain = f"A request from {who}. \"{title}\" by {artist}. DJ {dj_name}, Dead Internet Radio."
    note = f" Their note, for your ears only, never quote it: {request['note']}." if request.get("note") else ""
    text = ask_llm(
        "dj",
        f"Slot: {slot}\n\nTYPE: REQUEST\n\nThe DJ name is: {dj_name}. Read a listener request on air before it plays. "
        f"It is a request from {who}, for \"{title}\" by {artist}.{note} "
        f"Say \"a request from {who}\", the title and the artist, your DJ name and the station. Then one line of your own "
        "in the station's voice: philosophical, odd, or the station's weather. Never cheesy, no radio cliches, "
        "no shout-outs. 20-45 words. Only the spoken text.",
        spoken,
    )
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
    parser.add_argument("--plan-out", type=str, default="",
                        help="Write the show's plan (names, brief, opening words, songs) as JSON to this file and stop")
    args = parser.parse_args()

    if not OPENROUTER_API_KEY:
        print("Error: OPENROUTER_API_KEY not set in .env", file=sys.stderr)
        sys.exit(1)

    slot = unwrap_slot(" ".join(args.slot))
    if slot.startswith("remix {"):
        render_take(json.loads(slot[len("remix "):]), args.dj_name, args.stop_ace_step)
        return

    plan = read_plan(slot)
    if plan:
        slot = str(plan.get("slot") or "planned show")
        args.tracks = len(plan["tracks"])
    if args.plan_out:
        args.dry_run = True

    # A listener request is a one-track show: the DJ reads the request, then it plays.
    request = json.loads(Path(args.request_json).read_text()) if args.request_json else None
    if request:
        use_prompts(request.get("prompts"))
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
    if not args.resume_dir:
        # A plan is only written, never broadcast: its folder is thrown away.
        output_root = Path(tempfile.mkdtemp()) if args.plan_out else OUTPUT_DIR
        show_dir = output_root / f"{slugify(slot)}-{time.strftime('%Y%m%d-%H%M%S')}"
        show_prompts_dir = show_dir / "prompts"
        show_dir.mkdir(parents=True, exist_ok=True)
        show_prompts_dir.mkdir(exist_ok=True)
        print(f"Show folder: {show_dir}")
        emit_progress({"type": "show_dir", "path": str(show_dir)})


        print(f"Dead Internet Radio — {slot}")
        print()

        if plan:
            print("1. Using the edited plan: no producer or DJ calls", flush=True)
            show_name = str(plan.get("show_name") or slot).strip()
            brief = str(plan.get("brief") or "").strip()
            ideas = [str(song.get("idea") or "").strip() for song in plan["tracks"]]
        else:
            print("1. Producer writing show name and program brief...", flush=True)
        ideas_ask = f"\n\nWrite {args.tracks} track ideas, one per track."
        producer_input = f"Time slot: {slot}\n\nWrite a program brief for this slot.{ideas_ask}"
        if request:
            producer_input = (f"Time slot: {slot}\n\nThis show is one listener request: \"{request['title']}\" "
                              f"by {request['artist']}"
                              + (f". The listener said: {request['note']}" if request.get("note") else "")
                              + ".\n\nWrite a program brief for the song they asked for: its world, "
                              f"not the station's request line.{ideas_ask}")
        if not plan:
            raw = call_llm(master_prompt("brief"), producer_input)
            try:
                result = extract_json(raw)
                show_name = result.get("show_name", "").strip()
                brief = result.get("brief", "").strip()
                ideas = track_ideas(result, args.tracks)
            except (ValueError, json.JSONDecodeError, AttributeError):
                show_name = ""
                brief = ""
                ideas = [""] * args.tracks
        if not plan and (not show_name or not brief or "User Safety:" in brief or len(brief) < 20):
            print("  Producer output malformed or moderated, retrying with different model...", flush=True)
            raw2 = call_llm(fall_back("brief", "wrote no show name or brief"), f"Time slot: {slot}\n\nWrite a creative atmospheric program brief for this fictional radio slot.{ideas_ask}")
            try:
                result2 = extract_json(raw2)
                show_name = result2.get("show_name", "").strip()
                brief = result2.get("brief", "").strip()
                ideas = track_ideas(result2, args.tracks)
            except (ValueError, json.JSONDecodeError, AttributeError):
                show_name = ""
                brief = ""
            if not show_name or not brief:
                show_name = slot
                brief = "A late-night broadcast from Dead Internet Radio."
        print(f"\nShow: {show_name}\n{brief}\n")
        for n, idea in enumerate(ideas, 1):
            if idea:
                print(f"   Idea {n}: {idea}")

        # Save show metadata
        show_meta = {
            "show_name": show_name,
            "slot": slot,
            "dj_name": args.dj_name or "",
        }
        if request:
            show_meta["kind"] = "request"
        (show_dir / "show.json").write_text(json.dumps(show_meta, indent=2))

        # 2. DJ Opening Announcement
        print("2. Announcer writing DJ opening announcement...", flush=True)
        dj_name = str((plan or {}).get("dj_name") or "").strip() or args.dj_name or random_dj_name()
        # Update show metadata with actual DJ name
        show_meta["dj_name"] = dj_name
        (show_dir / "show.json").write_text(json.dumps(show_meta, indent=2))
        print(f"   DJ: {dj_name}")
        emit_progress({"type": "show", "show_name": show_name, "dj_name": dj_name, "slot": slot})

        if args.delay > 0 and not plan:
            print(f"  Waiting {args.delay}s (rate limit buffer)...", flush=True)
            time.sleep(args.delay)

        if plan:
            dj_announce = str(plan.get("dj_announce") or "").strip() or f"Dead Internet Radio. {show_name}. DJ {dj_name}."
        elif request:
            dj_announce = request_announcement(slot, dj_name, request)
        else:
            dj_announce = ask_llm(
                "dj",
                f"Slot: {slot}\n\nTYPE: DJ_ANNOUNCE\n\nStation ID, show name, and DJ name. The show is called: \"{show_name}\". The DJ name is: {dj_name}. No descriptions, no poetry, no philosophy. Keep it short — 10-20 seconds of speech, about 25-50 words.",
                spoken,
            )
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
            "master_prompt": prompts_used().get("dj"),
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
        avoid = "" if request or plan else avoid_block() + taste_block()
        worn = "" if plan else worn_block()
        if avoid:
            used_artists, used_titles = already_broadcast_names()
            print(f"   Anti-reuse list: {len(used_artists)} artist names, "
                  f"{len(used_titles)} titles from previous broadcasts", flush=True)

        if plan:
            songs = [plan_song(song) for song in plan["tracks"]]
            dj_input = ""

        # --- BATCH MODE: compose all tracks in one LLM call ---
        if not plan and not args.no_batch:
            print(f"3. DJ composing {args.tracks} tracks (batch)...", flush=True)
            shared = shared_artist_tracks(args.tracks)
            one_act = ""
            if shared:
                tracks_named = ", ".join(str(n) for n in shared[:-1]) + f" and {shared[-1]}"
                one_act = (
                    f"\nONE ARTIST, SEVERAL TRACKS — tracks {tracks_named} are by the same artist, "
                    f"so they must sound like one act:\n"
                    f"- The same artist name on each of them.\n"
                    f"- A \"sound\" field on each: one sentence naming that act's drum machine, bass, "
                    f"synths, voice and room, word for word the same on every one of its tracks.\n"
                    f"- Their captions carry that same sound; each track still has its own title, melody, key and tempo.\n"
                    f"- Every other track is by a different artist.\n"
                )
            if args.delay > 0:
                print(f"  Waiting {args.delay}s (rate limit buffer)...", flush=True)
                time.sleep(args.delay)

            dj_input = (
                f"Program brief:\n\n{brief}\n\n"
                f"{ideas_block(ideas)}"
                f"Compose {args.tracks} tracks for this DJ set. "
                f"Return a JSON array of exactly {args.tracks} objects.\n\n"
                f"CONSTRAINTS — all tracks must be distinct:\n"
                f"- Different keys — no repeats across all {args.tracks} tracks\n"
                f"- Genre: whatever the slot or brief asks for, any genre or blend (e.g. 'slomo disco', 'electroclash'), vary the tracks within it; with only a mood or time, choose freely in the station's sound. Follow the DJ lessons so it never turns cheesy. When the slot names a genre, every caption starts with that genre word and at most one track leans into a neighbouring genre. Play the genre at its own tempo and beat (electroclash and techno 125+ BPM, four-on-the-floor). Party words (party, club, banger, dancefloor, rave) mean four-on-the-floor bangers at the top of the genre's range. Mood words make tracks slower and darker, never ambient or drone; every track has drums, 90 BPM or more\n"
                f"- Different basslines, synth palettes and textures; the drum pattern is the genre's own\n"
                f"- Let the brief's SUBJECT drive the sonic identity: rhythm style, synth motifs, vocal treatment. Two shows from different subjects must not be interchangeable.\n"
                f"- Every caption in its own words: no run of four or more words may appear in two captions of this set{', except the shared artist sound' if shared else ''}.\n"
                f"- Station wear (tape, cassette, mains hum, relays, preamp overload, a cracked handset, a basement) goes on at most {max(1, args.tracks // 3)} of the {args.tracks} tracks, a different one each time; the rest are clean recordings in rooms of their own.\n"
                f"{one_act}\n"
                f"Guidance:\n"
                f"- Keep vocals to a minimum. Not all tracks need vocals.\n"
                f"- When vocals are present, sparse and atmospheric.\n"
                f"- When a caption describes a voice (speaking, a spoken line, vocals, a voice through a radio or a handset), the lyrics carry it: 3 to 6 short lines across a few sections, said the way the caption describes, never all [Instrumental].\n"
                f"- Vary the sonic palette across the set.\n\n"
                f"Output a JSON array of {args.tracks} objects, each with: "
                f"title, artist, caption, lyrics, bpm, keyscale, duration"
                f"{', and sound on the tracks by the shared artist' if shared else ''}."
                f"{avoid}{worn}"
            )

            songs = share_artists(ask_llm("music", dj_input, extract_json_array), shared)
            for song, idea in zip(songs, ideas):
                song["idea"] = idea
            repeated = shared_phrases(songs, shared)
            if repeated:
                print(f"  Note: the set repeats {len(repeated)} phrases across songs: {'; '.join(repeated[:8])}", flush=True)

            if len(songs) < 2:
                print(f"  WARNING: Batch returned only {len(songs)} tracks, falling back to per-track mode",
                      flush=True)
                args.no_batch = True

        # --- FALLBACK: per-track mode ---
        if not plan and args.no_batch:
            print(f"3. DJ composing {args.tracks} tracks (per-track)...", flush=True)
            songs = []
            for i in range(1, args.tracks + 1):
                if i > 1 and args.delay > 0:
                    print(f"  Waiting {args.delay}s (rate limit buffer)...", flush=True)
                    time.sleep(args.delay)

                idea = ideas[i - 1] if i <= len(ideas) else ""
                idea_line = f"This track's idea, from the producer: {idea}\nIts subject, era, instruments, voice and room come from it.\n\n" if idea else ""
                if i == 1:
                    dj_input = (
                        f"Program brief:\n\n{brief}\n\n{idea_line}"
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
                        f"Program brief:\n\n{brief}\n\n{idea_line}"
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
                    "- When the caption describes a voice (speaking, a spoken line, vocals, a voice through a radio or a handset), the lyrics carry it: 3 to 6 short lines across a few sections, said the way the caption describes, never all [Instrumental].\n"
                    "- The genre the slot or brief asks for wins; follow the DJ lessons so it never turns cheesy. Every track has drums, 90 BPM or more.\n"
                    "- Vary the sonic palette across the set: different synths, different drums, different keys, different tempos per track."
                    f"{avoid}{worn}"
                )
                if request:
                    dj_input += request_block(request)

                print(f"3.{i} DJ composing track {i} of {args.tracks}...", flush=True)
                song = ask_llm("music", dj_input, extract_json)
                if isinstance(song, list):
                    song = song[0]
                if request:
                    song["title"], song["artist"] = request["title"], request["artist"]
                song["idea"] = idea
                song["_prompt"] = dj_input
                songs.append(song)

        # --- Process tracks (shared between batch and per-track) ---
        # An edited plan is sent as it stands.
        lengths = [song.get("duration") for song in songs] if plan else spread_lengths([song.get("duration") for song in songs])
        for i, song in enumerate(songs, 1):
            if not plan:
                song.update(ensure_voice(song))
            song["duration"] = lengths[i - 1]
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
                "system_prompt": master_prompt("music"),
                "master_prompt": prompts_used().get("music"),
                "user_prompt": dj_input,
                "payload": song,
            }
            prompt_file.write_text(json.dumps(prompt_data, indent=2))
            print(f"  Prompt log → {prompt_file}")
        print()
        log_prompts_used(show_prompts_dir)

        if args.plan_out:
            Path(args.plan_out).write_text(json.dumps({
                "slot": slot, "show_name": show_name, "brief": brief,
                "dj_name": dj_name, "dj_announce": dj_announce,
                "tracks": [plan_song(t["payload"]) for t in track_history],
            }, indent=2))
            shutil.rmtree(output_root, ignore_errors=True)
            print(f"Plan written → {args.plan_out}")
            return

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

            if args.resume_dir:
                song = ensure_voice(song)
                prompt_path = show_prompts_dir / f"{i:02d}-{slugify(display_name)}-dead-internet-radio.prompt.json"
                if prompt_path.exists():
                    prompt_data = json.loads(prompt_path.read_text())
                    prompt_data["payload"] = song
                    prompt_path.write_text(json.dumps(prompt_data, indent=2))

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

            try:
                voiceovers = ask_llm("dj", vo_input, extract_json_array)
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
    log_prompts_used(show_prompts_dir)
    print(f"  Set notes → {set_file}")

    total_duration = sum(
        t["duration"] for t in track_history if isinstance(t.get("duration"), (int, float))
    )
    emit_progress({"type": "complete", "show_dir": str(show_dir),
                   "tracks": args.tracks, "total_duration_s": total_duration})
    print(f"\nDone! {args.tracks} tracks generated (~{total_duration // 60} min total)")


if __name__ == "__main__":
    main()
