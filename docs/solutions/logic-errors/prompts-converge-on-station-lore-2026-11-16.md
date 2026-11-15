---
module: generation
tags: [dj-prompt, producer-prompt, rerender, variety, captions]
problem_type: logic-errors
---

# Song prompts converge on the station's own words

Across the last 46 live songs, "relay" was in 17, "basement" in 18, "tape
warble" in 14 and "clap on two and four" in 13. One request caption read "dry
909 kick and clap… overloaded preamp until the concrete answers back… cracked
telephone handset… tape warble and 60Hz mains hum… degraded cassette in a cold
basement", and the same sentences turned up in other sets.

Where the words came from:
- `prompts/dj.md` handed them over. The intro, the caption schema and the
  weirdness levers listed tape warble, cassette and preamp overload. The
  signal_path examples were "60Hz mains hum… degraded relay station… preamp
  overload". The caption examples that worked ended in basements, DAT and
  "filter opening slowly over minutes".
- `prompts/producer.md` set the aesthetic as "concrete… the tapes from the clubs
  and basements", so every brief came back with basements and tape. A request
  brief was about the request line itself ("a rack of copper in a concrete
  basement"), and that became "Copper request line from basement rack".
- The producer only wrote one paragraph for the whole show. No track had an idea
  of its own, so the DJ filled every caption from the same page.
- In a re-render (`prompts/rerender.md`), "change only what the notes ask for"
  kept the old caption. `revise_song` never touched the old frequency band,
  modulation or signal path, so `{**old, **song}` carried them over word for
  word. With the notes "super dark darkwave… robo techno, 132bpm", the word
  "darkwave" was dropped and the handset, tape and basement stayed.

The fix:
- The producer writes one idea per track: era and city, the instrument at its
  centre, the voice, the room. There are no concrete examples in that part of
  the prompt, because the first try copied its own bracketed examples straight
  into the ideas. The DJ composes track N from idea N. The idea is saved in the
  payload and on `tracks.idea`, and it shows on the song page, in the set player
  and in the plan.
- `worn_phrases()` collects four-word runs that recent shows used in more than
  one song and hands them to the DJ as WORN PHRASES. Shared-artist tracks may
  repeat their act's sound sentence and nothing else.
- Station wear goes on at most a third of a set's tracks.
- Re-render notes lead. The producer rewrites all the sound fields, and
  `missing_terms()` asks once more when a genre, style or instrument word
  (`NOTE_VOCABULARY`) or the tempo from the notes is missing. Direction words
  (faster, darker) are met by the change and are not checked.

Test with the production model list. The local `.env` uses `openrouter/free`,
which writes keyword-soup captions and broken JSON, so it hides prompt changes.
