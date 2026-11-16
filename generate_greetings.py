#!/usr/bin/env python3
"""Render the listener greetings: short DJ lines the player says, now and then,
to one listener in their own browser, over the stream with the music dipped.

Each line is voiced once, offline, in the DJ's voice and FX (generate.py's
generate_announcement: Kokoro bm_george through announce.py), and written to
public/greetings/ with a manifest.json the player reads to pick the clip that
best fits what the page already knows about the listener: where they are, the
time there, the weather, their device, how often they come back.

    python generate_greetings.py              # render missing clips, rewrite manifest
    python generate_greetings.py --force      # re-render every clip
    python generate_greetings.py --only bali  # render one line (ids, comma-separated)
    python generate_greetings.py --dry-run    # list the lines, render nothing

Needs Kokoro at kokoro/.venv (or KOKORO_PYTHON=/path/to/python3) and ffmpeg.

Tags a line can carry. A place line plays where any one of its place tags
fits, except that a line's country qualifies its city: the city only counts
in that country, and the country alone doesn't. Every other tag must fit too.
  city, region, country   upper-case names as geojs.io gives them
  tz                      IANA time zone prefixes, used only while the place is unknown
  time                    late 0-4, dawn 5-7, morning 8-11, afternoon 12-16,
                          evening 17-20, night 21-23 (the listener's clock)
  day                     sun..sat
  visit                   first, return (a later visit), regular (10+ visits or 5+ hours)
  device                  mobile
  sky                     rain, snow, hot (30 C and up)
  from                    true: they came in from another site
  signedIn                true: signed in to the Signal chat
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent
OUT_DIR = ROOT / "public" / "greetings"
MANIFEST = OUT_DIR / "manifest.json"

LINES = [
    # Places. Most specific first; a city line beats its country.
    {"id": "bali", "text": "Welcome to the Bali massive. Somewhere past the rice terraces, a dead signal just found a live one.",
     "region": ["BALI"], "city": ["DENPASAR", "UBUD", "KUTA", "CANGGU", "SEMINYAK"], "country": ["INDONESIA"], "tz": ["Asia/Makassar"]},
    {"id": "bali-night", "text": "Bali massive. The geckos are up, and so are we. Dead Internet Radio, still transmitting.",
     "region": ["BALI"], "city": ["DENPASAR", "UBUD", "KUTA", "CANGGU", "SEMINYAK"], "country": ["INDONESIA"], "tz": ["Asia/Makassar"], "time": ["night", "late"]},
    {"id": "indonesia", "text": "Indonesia, you're on the frequency. Seventeen thousand islands, one dead signal.",
     "country": ["INDONESIA"], "tz": ["Asia/Jakarta", "Asia/Pontianak", "Asia/Jayapura"]},
    {"id": "london", "text": "London, you've tuned in. Somewhere under all that grey, the last radio station on Earth says hello.",
     "city": ["LONDON"], "country": ["UNITED KINGDOM"], "tz": ["Europe/London"]},
    {"id": "uk", "text": "Hello to the United Kingdom. Put the kettle on. The internet's been dead for years.",
     "country": ["UNITED KINGDOM"]},
    {"id": "new-york", "text": "New York. The city that never sleeps just found the station that never stops.",
     "city": ["NEW YORK", "BROOKLYN", "QUEENS"], "country": ["UNITED STATES"], "tz": ["America/New_York"]},
    {"id": "los-angeles", "text": "Los Angeles, the signal reached the coast. Palm trees, smog, and dead air. Welcome.",
     "city": ["LOS ANGELES"], "country": ["UNITED STATES"], "tz": ["America/Los_Angeles"]},
    {"id": "usa", "text": "Hello, America. Fifty states, one dead network, and you just tuned in.",
     "country": ["UNITED STATES"]},
    {"id": "berlin", "text": "Berlin, welcome to the transmission. The club closed. The signal didn't.",
     "city": ["BERLIN"], "country": ["GERMANY"], "tz": ["Europe/Berlin"]},
    {"id": "germany", "text": "Germany is on the dial. Precise, punctual, and slightly haunted. Welcome.",
     "country": ["GERMANY"]},
    {"id": "amsterdam", "text": "Amsterdam, you're locked in. Canals, bicycles, and a radio station run by ghosts.",
     "city": ["AMSTERDAM"], "country": ["NETHERLANDS"], "tz": ["Europe/Amsterdam"]},
    {"id": "paris", "text": "Paris, the static says bonjour. The dead internet sends its regards from the other side of the noise.",
     "city": ["PARIS"], "country": ["FRANCE"], "tz": ["Europe/Paris"]},
    {"id": "australia", "text": "Australia, you're upside down and dialled in. The signal took the long way round to find you.",
     "country": ["AUSTRALIA"], "tz": ["Australia/"]},
    {"id": "south-africa", "text": "South Africa on the frequency. Load shedding can't touch a station that's already dead.",
     "country": ["SOUTH AFRICA"], "tz": ["Africa/Johannesburg"]},
    {"id": "tokyo", "text": "Tokyo, welcome to the broadcast. Ten million glowing screens, and you picked the dead one.",
     "city": ["TOKYO"], "country": ["JAPAN"], "tz": ["Asia/Tokyo"]},
    {"id": "brazil", "text": "Brazil, the signal crossed the equator to find you. Welcome to Dead Internet Radio.",
     "country": ["BRAZIL"], "tz": ["America/Sao_Paulo"]},
    {"id": "india", "text": "India, you're on the dial. A billion connections, and this one is ours.",
     "country": ["INDIA"], "tz": ["Asia/Kolkata", "Asia/Calcutta"]},
    {"id": "canada", "text": "Canada, come on in. Cold outside, warm static in here.",
     "country": ["CANADA"], "tz": ["America/Toronto", "America/Vancouver"]},
    {"id": "spain", "text": "Spain, you've tuned in. Late dinner, later radio. Welcome to the frequency.",
     "country": ["SPAIN"], "tz": ["Europe/Madrid"]},
    {"id": "mexico", "text": "Mexico, the signal climbed all the way up to find you. Welcome to the transmission.",
     "country": ["MEXICO"], "tz": ["America/Mexico_City"]},
    {"id": "europe", "text": "Hello to whoever's out there in Europe. The old continent, tuned to the old internet.",
     "tz": ["Europe/"]},
    {"id": "americas", "text": "Good to have you, Americas. The signal runs north to south, and tonight it ends with you.",
     "tz": ["America/"]},
    {"id": "asia", "text": "Asia, welcome to the frequency. You're hours ahead of us, and we're decades behind.",
     "tz": ["Asia/"]},
    {"id": "africa", "text": "Africa, you're on the dial. The signal goes further than the cables ever did.",
     "tz": ["Africa/"]},

    # The listener's clock.
    {"id": "late-1", "text": "Hi to the new listener up at this hour. Only the insomniacs and the machines are awake. Welcome.",
     "time": ["late"], "visit": ["first"]},
    {"id": "late-2", "text": "It's the dead of night where you are. Good. That's when the signal comes through clearest.",
     "time": ["late"]},
    {"id": "dawn", "text": "Early riser. The sun's coming up, and the internet is still dead. Welcome to the morning shift.",
     "time": ["dawn"]},
    {"id": "morning", "text": "Good morning, new listener. Coffee in one hand, a dead frequency in the other.",
     "time": ["morning"], "visit": ["first"]},
    {"id": "afternoon", "text": "Afternoon, stranger. Skipping work for a radio station run by ghosts? Respect.",
     "time": ["afternoon"]},
    {"id": "evening", "text": "Evening, new listener. The lights are coming on, and the signal is coming through.",
     "time": ["evening"], "visit": ["first"]},
    {"id": "night", "text": "Night has fallen where you are. Pull up a chair by the static. Welcome.",
     "time": ["night"]},
    {"id": "friday", "text": "It's Friday night where you are, and you chose dead radio. Excellent choice.",
     "day": ["fri"], "time": ["evening", "night"]},
    {"id": "sunday", "text": "A slow Sunday, and someone new on the line. The signal moves gently today.",
     "day": ["sun"], "visit": ["first"]},

    # Coming back.
    {"id": "return-1", "text": "Welcome back. The signal remembered you. It always does.",
     "visit": ["return"]},
    {"id": "return-2", "text": "You came back. Most people don't. The dead internet appreciates loyalty.",
     "visit": ["return"]},
    {"id": "return-late", "text": "Back again, and at this hour. You and the machines, keeping each other company.",
     "visit": ["return", "regular"], "time": ["late"]},
    {"id": "regular", "text": "Regular listener detected. At this point, you're part of the broadcast.",
     "visit": ["regular"]},
    {"id": "regular-2", "text": "Hours logged on this frequency. You might be the last human still listening. Thank you.",
     "visit": ["regular"]},

    # What the page can see.
    {"id": "mobile", "text": "Welcome to the listener on the small screen. A whole dead internet, right there in your pocket.",
     "device": ["mobile"]},
    {"id": "rain", "text": "Rain where you are, static where we are. Perfect listening weather. Welcome.",
     "sky": ["rain"]},
    {"id": "snow", "text": "Snow outside your window. Stay in, stay tuned. Welcome to Dead Internet Radio.",
     "sky": ["snow"]},
    {"id": "hot", "text": "It's hot where you are. The servers are melting too. Welcome in.",
     "sky": ["hot"]},
    {"id": "referred", "text": "Someone sent you here. Good. The signal only spreads by word of mouth now.",
     "from": True, "visit": ["first"]},
    {"id": "signed-in", "text": "Call sign confirmed. You're on the chat, and now you're on the air. Welcome.",
     "signedIn": True},

    # Anyone, anywhere: first visits.
    {"id": "hello-1", "text": "Hello to the new listener. You've found Dead Internet Radio, the last station still broadcasting.",
     "visit": ["first"]},
    {"id": "hello-2", "text": "A new signal just joined the frequency. Welcome. Stay as long as the static lets you.",
     "visit": ["first"]},
    {"id": "hello-3", "text": "Somebody new is listening. We can tell. Welcome to Dead Internet Radio.",
     "visit": ["first"]},
    {"id": "hello-4", "text": "New listener on the line. No algorithm sent you. You just drifted in. Welcome.",
     "visit": ["first"]},
    {"id": "hello-5", "text": "Welcome to the frequency. The internet died, but the music never got the message.",
     "visit": ["first"]},
]

TAGS = ("city", "region", "country", "tz", "time", "day", "visit", "device", "sky", "from", "signedIn")


def clip_name(line):
    """A new line gets a new file name, so a year-long browser cache can't replay the old one."""
    digest = hashlib.sha1(line["text"].encode()).hexdigest()[:8]
    return f"{line['id']}-{digest}.mp3"


def manifest_entry(line):
    entry = {"id": line["id"], "file": f"greetings/{clip_name(line)}", "text": line["text"]}
    entry.update({k: line[k] for k in TAGS if k in line})
    return entry


def main():
    parser = argparse.ArgumentParser(description="Render the listener greeting clips")
    parser.add_argument("--force", action="store_true", help="re-render clips that already exist")
    parser.add_argument("--only", help="comma-separated line ids to render")
    parser.add_argument("--dry-run", action="store_true", help="list the lines and render nothing")
    args = parser.parse_args()

    ids = [line["id"] for line in LINES]
    assert len(ids) == len(set(ids)), "greeting ids must be unique"
    only = set(args.only.split(",")) if args.only else None
    if only and only - set(ids):
        sys.exit(f"unknown ids: {', '.join(sorted(only - set(ids)))}")

    if args.dry_run:
        for line in LINES:
            tags = " ".join(f"{k}={line[k]}" for k in TAGS if k in line)
            print(f"{line['id']:14} {line['text']}\n{'':14} {tags or 'anyone'}")
        print(f"\n{len(LINES)} lines")
        return

    import generate  # the DJ's voice; needs requirements.txt

    if os.getenv("KOKORO_PYTHON"):
        generate.KOKORO_PYTHON = Path(os.environ["KOKORO_PYTHON"])
    if not generate.KOKORO_PYTHON.exists():
        sys.exit(f"Kokoro not found at {generate.KOKORO_PYTHON} (set KOKORO_PYTHON)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    failed = []
    for line in LINES:
        mp3 = OUT_DIR / clip_name(line)
        wanted = only is None or line["id"] in only
        if not wanted or (mp3.exists() and not args.force):
            continue
        print(f"→ {line['id']}: {line['text']}", flush=True)
        wav = mp3.with_suffix(".wav")
        generate.generate_announcement(line["text"], wav, intensity=0.3)
        if not (wav.exists() and generate.wav_to_mp3(wav, mp3)):
            failed.append(line["id"])

    # Only clips that exist go in the manifest; old renders of changed lines go.
    current = {clip_name(line) for line in LINES}
    for stale in OUT_DIR.glob("*.mp3"):
        if stale.name not in current:
            stale.unlink()
    entries = [manifest_entry(line) for line in LINES if (OUT_DIR / clip_name(line)).exists()]
    MANIFEST.write_text(json.dumps({"clips": entries}, indent=1) + "\n")
    print(f"\n{len(entries)}/{len(LINES)} clips in {MANIFEST.relative_to(ROOT)}")
    if failed:
        sys.exit(f"failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
