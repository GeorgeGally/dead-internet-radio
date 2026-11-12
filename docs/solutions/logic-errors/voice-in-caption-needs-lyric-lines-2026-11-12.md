---
module: generation
tags: [lyrics, vocals, ace-step, dj-prompt, remix]
problem_type: logic-errors
---

# A voice in the caption needs lyric lines to sound

Track 1063 ("sliced & diced") had a caption with "A deadpan voice speaks
through a cracked telephone handset", but its lyrics were all `[Instrumental]`
apart from one line. ACE-Step only voices lyric lines, so the voice the caption
describes never sounded. The DJ prompt allowed this ("An all-[Instrumental]
track is fine", "Keep vocals to a minimum").

What holds now:

- `prompts/dj.md` and both DJ guidance blocks in `generate.py` ask for three to
  six short lines, said the way the caption describes, whenever the caption has
  a voice. Captions without one may still be all `[Instrumental]`.
- `generate.ensure_voice` checks every composed song. If the caption describes
  a voice (`describes_voice`, which ignores "no vocals") and the lyrics have
  fewer than three non-tag lines, it asks the DJ once for lyrics. If that fails
  or is still too short, it builds stabs from the existing lines, the title and
  the artist.
- The set brief is not checked: it is written "in the station's voice", which
  would match every song.

## Remix: a new take that leaves the original alone

The track page's Remix button queues `RerenderTrackJob` with kind `remix`.
`generate.py` renders the same song in a new folder, adding vocal lines only
when its caption requires them. The original stays untouched. Remix shows are
excluded from public programmes and air only through a set. Re-render with
notes still replaces the song's audio in place.

On apps1, `GenerationLine` hands the take payload to the generation PC. The
servers repository's `dir-pc-setup.sh` deploys `generate.py` to that PC.
