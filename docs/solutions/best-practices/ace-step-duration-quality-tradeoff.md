---
title: ACE-Step generates generic song structures beyond 90 seconds
date: 2026-06-13
category: docs/solutions/best-practices
module: dead-internet-radio
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Generating atmospheric, loop-based, or textural electronic music with ACE-Step
  - Output sounds generic, poppy, or structurally predictable despite good prompts
  - Increasing track duration hoping for longer versions of a quality result
tags:
  - ace-step
  - audio-generation
  - duration
  - quality
  - atmospheric
  - loops
---

# ACE-Step generates generic song structures beyond 90 seconds

## Context

Tracks were extended from 30s to 120-240s in search of longer, more developed pieces. The output became noticeably "cheesy" — generic AI music with verse/chorus/bridge patterns instead of the tight atmospheric loops the project requires. The 30s tracks had been excellent; the 2-4 minute tracks sounded like typical AI slop.

## Guidance

Clamp ACE-Step `audio_duration` to 60-90 seconds for atmospheric, textural, or loop-based electronic music. Explicitly instruct the LLM composing the prompt that tracks are loops, not songs.

```python
# Too short — loops work but leaves quality on the table:
song["duration"] = min(song.get("duration", 30), 30)

# Too long — causes verse/chorus AI slop:
song["duration"] = max(min(song.get("duration", 120), 240), 120)

# Sweet spot for atmospheric loops:
song["duration"] = max(min(song.get("duration", 75), 90), 60)
```

LLM guidance text passed to the DJ bot in `generate.py`:
```python
# Bad (produces song structure):
"- Each track must be 2-4 minutes long (120-240 seconds)."

# Good (preserves loop quality):
"- Each track must be 60-90 seconds. Atmospheric loops, not full songs. No verse/chorus pop structure."
```

Also set this constraint in `prompts/dj.md`:
```
- Duration: 60-90 seconds. Atmospheric loops, not full songs. Do not write verse/chorus pop structures.
```

## Why This Matters

ACE-Step's quality characteristics are not linear with duration. The model's atmospheric and textural capabilities peak in the 30-90 second range. Beyond that it defaults to filling space with generic song-structure patterns learned from training data — verse, chorus, bridge — producing output that sounds like typical AI music regardless of prompt quality. The 60-90s constraint is a model capability boundary, not a creative choice. If genuinely longer tracks are needed, consider generating multiple loops and crossfading in the player layer.

## When to Apply

- Any time ACE-Step output sounds "generic," "poppy," or structurally predictable despite technical, well-crafted prompts — check duration first
- When increasing duration hoping for "more" of a good thing: longer is not better with this model for atmospheric music
- When the project aesthetic requires loops, drones, or ambient textures rather than composed pieces with dynamic song structure
- When adding new generation parameters: default conservatively (75s) and tune up from there, not down from a high value

## Examples

**Before (120-240s range):**
Tracks developed verse/chorus structure, sounded like typical AI-generated pop music, lost the atmospheric loop quality. Caption and prompt quality made no difference — the duration alone caused the regression.

**After (60-90s clamp):**
Tracks maintain coherent atmospheric texture throughout, function as seamless loops, stay within the model's quality envelope. The 75s default lands near the center of the sweet spot.

## Related

- `docs/solutions/logic-errors/prompt-seed-overwrite-on-run.md` — quality degradation from the seed-overwrite bug was initially conflated with this duration issue
