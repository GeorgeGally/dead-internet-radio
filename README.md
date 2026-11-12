# Dead Internet Radio

A fully AI-generated radio station for robots. Post-human synthpop, techno, and dark electro broadcast from a dead world.

## Architecture

- **Producer** — an LLM that writes a scene-setting program brief ("midnight DJ", "dawn frequency")
- **Writer** — an LLM that converts the brief into a structured song payload for ACE-Step
- **ACE-Step 1.5** — local music generation model that turns the payload into an MP3
- **Announcer** — Kokoro TTS + lo-fi effects that generate degraded DJ voiceovers alongside each track

## Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Copy and edit env
cp .env.example .env
# Add your OPENROUTER_API_KEY to .env

# 3. Start ACE-Step 1.5 (in a separate terminal)
cd ACE-Step-1.5 && uv run acestep-api

# 4. Generate a set
python generate.py "late night slot"
```

For set generation, `OPENROUTER_MODEL` defaults to `openrouter/free`. It may
contain a comma-separated list of models to try in order; if the list omits
`openrouter/free`, generation appends it as a fallback.

## TTS (DJ Voiceovers)

The pipeline automatically generates lo-fi DJ announcements alongside each track using [Kokoro](https://github.com/hexgrad/kokoro). The kokoro environment is pre-configured in `kokoro/.venv/`.

To manually test TTS:
```bash
./announce.py --text "This is Dead Internet Radio." --output output/test.wav
```

The TTS script picks a random voice per call and applies bitcrushing, noise injection, and low-pass filtering for a broken-radio aesthetic.

## Usage

On the public player, open Request and sign in with Google to submit a fictional
artist, song title, and style. After an accepted request, Close returns to the
player; reopening Request shows recent requests and their progress. If the line
drops while sending, the request may already have arrived. Check the request
list before trying again.

When an admin saves an artwork look to a slot, the player shows the artwork
name and whether the save succeeded. The keypad highlights a successful save
in orange, shows other saved slots in cream, and outlines a failed save in
orange.

In the admin, open a track and select **Download** to save its MP3. The button
appears when the audio file is available.

```bash
# Generate a multi-track set
python generate.py "midnight slot"
python generate.py "dawn frequency"
python generate.py "emergency broadcast"

# Custom track count
python generate.py "late night" --tracks 3

# Dry-run — test prompts without generating audio
python generate.py "late night" --dry-run
```

## Prompts

Edit the prompts in `prompts/` to tweak the bot personalities and genre constraints.

- `prompts/producer.md` — the Producer's system prompt (DJ persona, scene setting)
- `prompts/writer.md` — the Writer's system prompt (song structure, ACE-Step payload format)

## Output

Generated MP3s and DJ announcement WAVs are saved to `output/`. Dry-run JSON is also saved there.
