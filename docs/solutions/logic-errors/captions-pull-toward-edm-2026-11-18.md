---
module: generation
tags: [dj-prompt, captions, ace-step, negative-prompt, lyrics]
problem_type: logic-errors
---

# Captions pull ACE-Step toward commercial EDM

Tracks kept coming back with stabs, melodic leads, distorted trumpets and
festival builds, the opposite of the station's dark underground sound.

ACE-Step moves toward every word it reads, even after "no" or "never". The
words reached it four ways:
- The DJ prompt named them in its warnings ("no stabs", "the EDM tells:
  supersaws, lush pads…"), and the DJ echoed them into captions.
- `REGISTER_LINE`, added to every caption, said "the melody stays in the bass".
- The DJ's user messages said "bangers", "slomo disco" and "electroclash", and
  asked for voice lines "across a few sections".
- `voice_stabs()` and the lyric instructions wrote [Intro]/[Verse]/[Bridge]/
  [Outro] lyrics, so ACE-Step planned a song with sections and builds.

The fix:
- `prompts/dj.md` names no unwanted sound, not even as a warning. It builds
  each track from rhythm, bass, one or two signature sounds and one room, and
  describes each genre by its beat and machines; the club-genre slots are
  written as their groove. Captions open with three or four feel words and
  run 30-60 words. A test fails if the prompt names a banned sound.
- `caption_check.py` lists the words (`BANNED`). `compose_checked()` asks the
  DJ again, up to `CAPTION_RETRIES` (2) times, when a caption, shared sound or
  lyric tag carries one. Each retry replaces only the tracks that still carry
  one. A track that still has one renders with `caption_flags` in its payload
  and a WARNING in the log. `revise_song()` runs the same check, and words the
  listener's or station's notes ask for are allowed. Goth, shoegaze and
  darkwave captions may keep "chorus", shoegaze "swell" and "shimmering".
  Negation ("no", "never", "without") counts too: it names what it negates.
- `call_ace_step()` sends `lm_negative_prompt`: bare words from
  `caption_check.NEGATIVE_WORDS`, minus any the caption asks for. It is the
  field name in ACE-Step 1.5's `/release_task` (`release_task_models.py`). It
  replaces the LM's unconditional caption for its CFG (`lm_cfg_scale`, default
  2.5), so it only acts when `thinking` is on. DIR runs with thinking on.
- `one_verse()` sends lyrics as exactly `[Instrumental]` or one `[Verse]` of
  the lines. An edited plan is still sent as written.
- `use_cot_caption` stays `False`: the LM must not rewrite the caption.

Not taken from an outside proposal: a DJ-written `negative` field (the
prompt would have to list the words), checking titles and the technical
fields (ACE-Step never gets them), a skip-render switch and a caption-rewrite
switch.

Prompt files that still name the words: `prompts/rerender.md`,
`prompts/producer.md` and `prompts/set_dj.md`. The rewrite and the remix
paths pass through the check.
