#!/usr/bin/env python3
"""Generate station ID stings with short sound effects for Dead Internet Radio.

Each station ID gets:
1. A short sound effect or jingle stab via ACE-Step (2-5s)
2. A TTS voiceover via Kokoro
3. Mixed together with ffmpeg (sting hits first, ducks for voice)

Run requires ACE-Step running at localhost:8001.
"""
import os
import re
import sys
import subprocess
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from generate import extract_json, extract_json_array

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
ACE_STEP_URL = os.getenv("ACE_STEP_URL", "http://localhost:8001")

VOICES = [
    # American
    "af_bella", "af_nicole", "af_sarah", "af_sky",
    "af_aoede", "af_kore", "af_nova", "af_heart", "af_alloy", "af_jessica", "af_river",
    "am_adam", "am_michael", "am_fenrir", "am_onyx", "am_echo", "am_puck", "am_eric", "am_liam", "am_santa",
    # British
    "bf_emma", "bf_isabella", "bf_alice", "bf_lily",
    "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
]

KOKORO_PYTHON = Path(__file__).parent / "kokoro" / ".venv" / "bin" / "python3"
ANNOUNCE_SCRIPT = Path(__file__).parent / "announce.py"

FALLBACK_IDS = [
    "You're listening to Dead Internet Radio. One frequency. One signal.",
    "Dead Internet on your dial. You're listening to DIR.",
    "This is the frequency. Dead Internet Radio. The signal finds you.",
    "You're locked into D.I.R. — Dead Internet Radio. Still transmitting.",
    "Transmission confirmed. You're listening to Dead Internet Radio. The only station left.",
    "If you can hear this, you're still connected. Dead Internet Radio. DIR.",
    "The world ended. The radio didn't. You're listening to Dead Internet Radio.",
    "DIR is live. Dead Internet Radio. One signal."
]

FALLBACK_JINGLES = [
    "Dead. Internet. Radio.",
    "D. I. R.",
    "The last frequency.",
    "Still transmitting.",
    "One frequency. One signal.",
    "Locked on. Transmitted. Received.",
]


# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------

def call_llm(system_prompt, user_message):
    import json
    import time
    import urllib.request
    import urllib.error

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
    for attempt in range(3):
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
            print(f"  LLM call failed ({e.code})", flush=True)
            break
        except Exception as e:
            print(f"  {e}", flush=True)
            break
    return None


def generate_texts(prompt_path, count):
    """Generate station IDs and jingles via LLM."""
    if not OPENROUTER_API_KEY:
        print("  No OPENROUTER_API_KEY, using fallback texts", flush=True)
        return FALLBACK_IDS, FALLBACK_JINGLES

    prompt = Path(prompt_path).read_text().strip()
    print("  Generating texts via LLM...", flush=True)
    user_msg = (
        f"Generate station IDs and jingles for Dead Internet Radio.\n"
        f"I need {count} total items (mix of IDs and jingles). "
        f"Produce enough variety to fill that count."
    )
    raw = call_llm(prompt, user_msg)
    if raw is None:
        print("  LLM failed, using fallback texts", flush=True)
        return FALLBACK_IDS, FALLBACK_JINGLES

    try:
        data = extract_json(raw)
        ids = data.get("ids", [])
        jingles = data.get("jingles", [])
        if not ids and not jingles:
            raise ValueError("Empty response")
        print(f"  Got {len(ids)} IDs, {len(jingles)} jingles", flush=True)
        return ids, jingles
    except Exception as e:
        print(f"  LLM parse failed ({e}), using fallback texts", flush=True)
        return FALLBACK_IDS, FALLBACK_JINGLES


def generate_sting_caption():
    """Use LLM to generate a short sound effect/sting description for ACE-Step."""
    if not OPENROUTER_API_KEY:
        return ""

    system = (
        "You generate sound-design descriptions for a dark, mechanical "
        "radio station. Output a JSON object with a 'caption' field containing "
        "a terse technical description. No music, no melody, no songs. "
        "1-2 sentences. Name the sound type, pitch, movement, and texture."
    )
    user = (
        "Describe a sound (4-8 seconds) for a radio station ID. "
        "No music, no melody, no songs. Mix of types: "
        "\"Rising modem handshake, carrier warble, digital negotiation tones, then dropout.\" "
        "\"Low industrial drone at 60Hz with slow filter sweep, distant metallic clatter.\" "
        "\"Single orchestral hit, low brass, tight gate, fast decay.\" "
        "\"Explosive lo-fi drum hit with massive room reverb, debris tail.\" "
        "\"Three rapid static pops with rising sub-bass thump.\" "
        "\"Slow dial-tone build, rhythmic pulse at 80 BPM, cut to silence.\" "
        "Output JSON: {\"caption\": \"...\"}"
    )
    raw = call_llm(system, user)
    if raw is None:
        return ""
    try:
        data = extract_json(raw)
        return data.get("caption", "")
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# ACE-Step
# ---------------------------------------------------------------------------

def check_ace_step():
    import urllib.request
    try:
        req = urllib.request.Request(f"{ACE_STEP_URL}/health")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = __import__("json").loads(resp.read().decode())
            return data.get("data", {}).get("status") == "ok"
    except Exception:
        return False


def generate_sting(caption, key=None, bpm=None):
    """Generate a short musical sting via ACE-Step. Returns path to wav file."""
    import json
    import time
    import urllib.request

    body = {
        "prompt": caption,
        "lyrics": "",
        "bpm": bpm,
        "key_scale": key or "",
        "audio_duration": random.randint(5, 10),
        "thinking": False,
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
            task_id = data["data"]["task_id"]
    except Exception as e:
        print(f"  ACE-Step submission failed: {e}", file=sys.stderr)
        return None

    # Poll
    start = time.time()
    while time.time() - start < 300:
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
        except Exception:
            time.sleep(5)
            continue
        task = data["data"][0]
        if task["status"] == 1:
            result = json.loads(task["result"])
            audio_url = result[0]["file"]
            out_path = Path(f"station-ids/.tmp-sting-{task_id[:8]}.mp3")
            urllib.request.urlretrieve(f"{ACE_STEP_URL}{audio_url}", out_path)
            return out_path
        elif task["status"] == 2:
            print(f"  ACE-Step task failed", file=sys.stderr)
            return None
        elapsed = int(time.time() - start)
        print(f"  Generating sting... ({elapsed}s)", flush=True)
        time.sleep(5)

    print("  ACE-Step timed out", file=sys.stderr)
    return None


# ---------------------------------------------------------------------------
# TTS
# ---------------------------------------------------------------------------

def generate_tts(text, voice, output_path, intensity=0.3, speed=1.0):
    """Generate TTS via announce.py. Returns (ok, error_msg)."""
    cmd = [
        str(KOKORO_PYTHON),
        str(ANNOUNCE_SCRIPT),
        "--text", text[:300],
        "--output", str(output_path),
        "--voice", voice,
        "--intensity", str(intensity),
        "--speed", str(speed),
    ]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=300)
        ok = output_path.exists() and output_path.stat().st_size > 100
        return ok, "" if ok else "output missing or empty"
    except subprocess.CalledProcessError as e:
        return False, e.stderr.strip() or f"exit code {e.returncode}"
    except FileNotFoundError:
        return False, "Kokoro python not found"
    except subprocess.TimeoutExpired:
        return False, "TTS timed out"


# ---------------------------------------------------------------------------
# Mix
# ---------------------------------------------------------------------------

def mix_sting_and_voice(sting_path, voice_path, out_path, sting_after=False):
    """Mix sfx sting with TTS voiceover using ffmpeg.
    
    If sting_after=True: voice plays first, sting hits as an end tag.
    If sting_after=False: sting plays as a brief hit then background bed behind voice."""
    try:
        if sting_after:
            # Voice first (~2.5s), then sting hits as end tag
            cmd = [
                "ffmpeg", "-y",
                "-i", str(sting_path),
                "-i", str(voice_path),
                "-filter_complex",
                "[0:a]adelay=2400|2400,volume=1.0[sting];"
                "[1:a]volume=1.3[voice];"
                "[sting][voice]amix=inputs=2:duration=longest:dropout_transition=2,"
                "loudnorm=I=-14:TP=-1.5:LRA=7[out]",
                "-map", "[out]",
                "-ar", "24000",
                str(out_path),
            ]
        else:
            # Sting hits first, then drops to bed behind voice
            cmd = [
                "ffmpeg", "-y",
                "-i", str(sting_path),
                "-i", str(voice_path),
                "-filter_complex",
                "[0:a]adelay=0|0[sting];"
                "[1:a]adelay=300|300,volume=1.3[voice];"
                "[sting]volume=0.35[sting_bed];"
                "[sting_bed][voice]amix=inputs=2:duration=longest:dropout_transition=2,"
                "loudnorm=I=-14:TP=-1.5:LRA=7[out]",
                "-map", "[out]",
                "-ar", "24000",
                str(out_path),
            ]
        subprocess.run(cmd, check=True, capture_output=True, timeout=30)
        return out_path.exists()
    except Exception as e:
        print(f"  ffmpeg mix failed: {e}", file=sys.stderr)
        return False


def mix_sting_only(sting_path, out_path):
    """Just apply effects to the sting, no voiceover."""
    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(sting_path),
            "-af",
            "volume=1.0,afade=t=out:st=8:d=2,loudnorm=I=-14:TP=-1.5:LRA=7",
            "-ar", "24000",
            str(out_path),
        ]
        subprocess.run(cmd, check=True, capture_output=True, timeout=30)
        return out_path.exists()
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

import random

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate station IDs with musical stings")
    parser.add_argument("--output", "-o", type=Path, default=Path("station-ids"))
    parser.add_argument("--count", "-n", type=int, default=10,
                        help="Total IDs to generate (default: 10)")
    parser.add_argument("--no-stings", action="store_true",
                        help="Skip ACE-Step stings, TTS only")
    parser.add_argument("--no-llm", action="store_true",
                        help="Skip LLM, use fallback texts")
    parser.add_argument("--prompt", type=Path,
                        default=Path(__file__).parent / "prompts" / "station_ids.md")
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / ".tmp").mkdir(exist_ok=True)
    print(f"Output: {args.output}/")

    # Check ACE-Step
    ace_ok = False
    if not args.no_stings:
        ace_ok = check_ace_step()
        if not ace_ok:
            print("  WARNING: ACE-Step not reachable — stings will be skipped", flush=True)
            print(f"  Start it: cd ACE-Step-1.5 && uv run acestep-api", flush=True)
        else:
            print("  ACE-Step: OK", flush=True)

    # Generate texts
    print("Preparing texts...", flush=True)
    if args.no_llm:
        ids, jingles = FALLBACK_IDS, FALLBACK_JINGLES
    else:
        ids, jingles = generate_texts(args.prompt, args.count)

    pool = [(t, "id") for t in ids] + [(t, "jingle") for t in jingles]
    random.shuffle(pool)
    pool = pool[:max(args.count * 2, len(pool))]

    fallback_pool = [(t, "id") for t in FALLBACK_IDS] + [(t, "jingle") for t in FALLBACK_JINGLES]
    random.shuffle(fallback_pool)
    fi = 0

    total = 0
    failed = 0

    while total < args.count and (pool or fi < len(fallback_pool)):
        if not pool:
            pool = fallback_pool[fi:]
            fi = len(fallback_pool)
        text, kind = pool.pop(0)

        slug = "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-")[:30]
        out_path = args.output / f"{kind}-{slug}.wav"

        if out_path.exists():
            continue

        voice = random.choice(VOICES)
        print(f"  [{kind}] \"{text[:50]}\"")

        # 1. Generate musical sting
        sting_path = None
        if ace_ok:
            print(f"    Generating sting...", end="", flush=True)
            caption = generate_sting_caption()
            if caption:
                print(f" ({caption[:40]}...)", flush=True)
                sting_path = generate_sting(caption)
            else:
                print(" (caption failed)", flush=True)

        # 2. Sometimes extend ID text with a jingle tagline when music plays
        extra_tag = None
        if sting_path and kind == "id" and jingles and random.random() < 0.55:
            extra_tag = random.choice(jingles)
            text = f"{text}... {extra_tag}."
            slug = "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-")[:40]
            print(f"    Tagline: \"{extra_tag}\"")

        # 3. Generate TTS (retry with different voice on failure)
        voice_path = args.output / ".tmp" / f"voice-{slug}.wav"
        tts_ok = False
        tts_retries = 3
        tts_error = ""
        for attempt in range(tts_retries):
            if attempt > 0:
                voice = random.choice(VOICES)
                speed = random.uniform(0.85, 1.15)
                intensity = random.uniform(0.2, 0.5)
            else:
                speed = random.uniform(0.8, 1.25)
                intensity = random.uniform(0.2, 0.7)
            print(f"    TTS [{voice}] spd={speed:.2f} int={intensity:.2f}...", end="", flush=True)
            tts_ok, tts_error = generate_tts(text, voice, voice_path, intensity=intensity, speed=speed)
            if tts_ok:
                print(" OK")
                break
            print(f" FAILED ({tts_error})")
        if not tts_ok:
            failed += 1
            continue

        # 4. Mix or TTS-only
        if sting_path:
            sting_after = random.random() < 0.3
            mode = "sting-after" if sting_after else "sting-bed"
            print(f"    Mixing ({mode})...", end="", flush=True)
            if mix_sting_and_voice(sting_path, voice_path, out_path, sting_after=sting_after):
                print(f" → {out_path.name}")
                total += 1
            else:
                # Fallback: just use the TTS
                voice_path.rename(out_path)
                print(f" (mix failed, voice only) → {out_path.name}")
                total += 1
            sting_path.unlink(missing_ok=True)
        else:
            voice_path.rename(out_path)
            print(f"    → {out_path.name} (voice only)")
            total += 1

    # Cleanup
    tmp_dir = args.output / ".tmp"
    if tmp_dir.exists():
        for f in tmp_dir.iterdir():
            f.unlink()
        tmp_dir.rmdir()

    print(f"\nDone: {total} generated, {failed} failed, {args.output}/")


if __name__ == "__main__":
    main()
