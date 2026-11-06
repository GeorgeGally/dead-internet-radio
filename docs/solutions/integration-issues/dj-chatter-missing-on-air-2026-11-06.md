---
module: broadcast
tags: [dj, voiceover, kokoro, buffering, deploy]
problem_type: integration-issue
---

# DJ chatter missing on air

Three separate faults looked like one.

**Sets with no DJ.** apps1 has no Kokoro, so a set built there has no voice files and `build_set.py` reports no failure. `config/initializers/zz_no_set_builds.rb` was meant to stop those builds, but it isn't tracked, so every `push-code.sh` deletes it and only `dir.sh` restores it. `SetPlanner` now checks for Kokoro itself. A waiting request can still build a voiceless set there.

**Voice under the music.** Voiceovers are about -23 LUFS and songs about -16. The player mixes them live, so the music has to duck hard: 0.25 through a gain node, because iOS ignores element volume.

**Silence around short segments.** Holding only the next track in memory works for songs, but a 5-second clip can take 9 seconds to arrive, so ID, talk and opening each start a cold download. Hold through short clips up to the next song, and keep clips small.

Building voices on apps1 is not an option today. To refresh the talk, run `build_interludes.py` where Kokoro exists, copy the folder to `output/` on apps1, and import it with `dir-import.rb`. Deploy code that knows a new Show kind before importing one, or it airs as a Show.
