---
title: Static files not deployed in --shows-only mode, breaking DJ voiceovers
date: 2026-06-16
category: docs/solutions/integration-issues
module: build_site.py
problem_type: integration_issue
component: tooling
symptoms:
  - "DJ voiceovers never play in deployed web player — opening announce plays but mid-set voiceovers are silent"
  - "`index.html` in `dist/` is stale — missing `<audio id=\"voiceover-el\">` element"
  - "`app.js` in `dist/` is stale — lacks `startVoiceoverIfNeeded()`, `stopVoiceover()`, and volume ducking logic"
  - "`--shows-only` flag deploys updated `shows.json` and `playlist.json` but never syncs static assets"
  - "Deployed `dist/` reflects a previous deploy from before voiceover code was written"
root_cause: missing_workflow_step
resolution_type: code_fix
severity: high
tags:
  - build-site
  - deployment
  - shows-only
  - static-files
  - voiceover
---
# Static files not deployed in `--shows-only` mode, breaking DJ voiceovers

## Problem

`build_site.py --shows-only` updated `shows.json` and per-show `playlist.json` files but never copied static assets (`src/index.html`, `src/app.js`, `src/style.css`) to `dist/`. The deployed `dist/` directory contained stale files from a previous full build — missing the `<audio id="voiceover-el">` element in `index.html` and the entire voiceover ducking subsystem in `app.js`.

## Symptoms

- Opening DJ announce plays (it's a normal MP3 track) but mid-show voiceovers that duck the main track are completely silent
- Running `build_site.py --shows-only` produces no error — no indication that static files were skipped
- Inspecting `dist/index.html` reveals no voiceover audio element
- Inspecting `dist/app.js` shows code predating the ducking feature — no `startVoiceoverIfNeeded`, `stopVoiceover`, or volume manipulation

## What Didn't Work

The issue was discovered during manual inspection of `dist/` after noticing voiceovers never played. No false leads — the missing `_build_dist_static()` call was found by reading `build_site.py`.

## Solution

Moved `_build_dist_static()` call outside the `--shows-only` guard to run unconditionally:

**Before:**
```python
if args.shows_only:
    find_shows()
    build_shows_manifest()
    print("Done.")
    return
```

**After:**
```python
# Always copy static files (needed even in shows-only mode)
print("Copying static assets...", flush=True)
_build_dist_static()
print()

if args.shows_only:
    print("Done (shows-only mode).")
    return
```

`_build_dist_static()` copies all files from `src/` (excluding `src/shows/`) to `dist/` using `shutil.copytree()` + `shutil.copy2()`.

## Why This Works

The `--shows-only` flag is an optimization for the rapid edit-deploy loop — it skips the expensive generation and mixing steps and only rebuilds metadata and static files. But "rebuild static files" was the implicit contract that the code never fulfilled. Adding the call restores the invariant: after any `build_site.py` run, `dist/` always reflects the current state of both dynamic content (`shows.json`, `playlist.json`) and static assets (`index.html`, `app.js`, `style.css`).

## Prevention

- `_build_dist_static()` now runs unconditionally in both `--shows-only` and full build paths
- When adding a `--flag` that deploys only a subset of build artifacts, enumerate the subset explicitly and verify each artifact type is present in the output
- After deploy, open the app and test every code path that depends on new HTML elements or JS features — not just the happy path

## Related Issues

- `docs/solutions/best-practices/openrouter-free-router-pattern.md` — same codebase, different category
- `docs/solutions/logic-errors/prompt-seed-overwrite-on-run.md` — another silent pipeline correctness issue
