---
title: LLM seed prompt files overwritten by run output on every generation
date: 2026-06-13
category: docs/solutions/logic-errors
module: dead-internet-radio
problem_type: logic_error
component: tooling
symptoms:
  - prompts/producer.md contains a previous run's LLM-generated brief instead of authoring instructions
  - prompts/dj.md contains a previous run's track list and set notes markdown instead of DJ composition instructions
  - DJ bot receives stale duration constraints baked in from a prior run's system prompt
  - Music quality degrades silently over successive runs with no error
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - generate
  - llm-prompts
  - seed-prompts
  - overwrite
  - pipeline
---

# LLM seed prompt files overwritten by run output on every generation

## Problem

`generate.py` used a `backup_and_write()` helper that, at the end of every generation run, replaced the seed prompt files (`prompts/producer.md` and `prompts/dj.md`) with that run's generated output. Subsequent runs then loaded corrupted content as their LLM system prompts, silently degrading generation quality.

## Symptoms

- `prompts/producer.md` contains a previous run's LLM-generated brief instead of authoring instructions
- `prompts/dj.md` (formerly `writer.md`) contains a previous run's full track list and set notes markdown instead of DJ composition instructions
- DJ bot receives stale duration constraints from a prior set's notes baked into its system prompt (e.g., "15-30 seconds" from an old run)
- Generation quality degrades over successive runs with no error or warning

## What Didn't Work

The bug was identified directly from code inspection after noticing that `dj.md` had been replaced with a previous run's set notes. No false leads — the `backup_and_write()` call was found and removed.

## Solution

Removed both `backup_and_write()` calls, the function itself, `import shutil`, and the `BACKUPS_DIR` constant. Generated artifacts now route to timestamped per-show output directories.

**Before:**
```python
import shutil

BACKUPS_DIR = PROMPTS_DIR / "backups"

def backup_and_write(path: Path, content: str):
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    if path.exists():
        timestamp = time.strftime("%Y-%m-%d-%H%M%S")
        backup_path = BACKUPS_DIR / f"{path.stem}-{timestamp}{path.suffix}"
        shutil.copy2(path, backup_path)
    path.write_text(content)

# Called at end of each run:
backup_and_write(PRODUCER_PROMPT_PATH, brief)
backup_and_write(WRITER_PROMPT_PATH, set_content)
```

**After:**
```python
# brief just printed, not written back to producer.md
print(f"\n{brief}\n")

# set notes saved to per-show output directory, not back into prompts/
set_file = show_prompts_dir / f"set-{slugify(slot)}.md"
set_file.write_text(set_content)
print(f"  Set notes → {set_file}")
```

## Why This Works

The seed prompt files (`prompts/producer.md`, `prompts/dj.md`) are static authoring documents — they define the LLM bots' behavior and should never be mutated by the pipeline they drive. Generated output (briefs, set notes) is ephemeral run data that belongs in `output/<show-folder>/prompts/` alongside the audio it produced. Separating static config from dynamic output eliminates the overwrite vector entirely.

## Prevention

- Treat any file loaded as an LLM system prompt as read-only within the pipeline — never open it for writing
- Route all generated artifacts (briefs, set notes, JSON logs) to a timestamped output directory, not back into `prompts/`
- When a "backup and write" pattern appears in a generation pipeline, treat it as a code smell: ask whether the destination file is static config or dynamic output
- The `prompts/` directory should contain only human-authored seed files; nothing the pipeline generates should land there

## Related Issues

- See also: `docs/solutions/best-practices/ace-step-duration-quality-tradeoff.md` — quality degradation from this bug was partly masked by and conflated with the duration issue
