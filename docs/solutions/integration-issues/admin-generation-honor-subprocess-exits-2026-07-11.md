---
title: Admin generation must honor generate.py subprocess exits
date: 2026-07-11
category: docs/solutions/integration-issues
module: dead-internet-radio
problem_type: integration_issue
component: admin-generation
severity: high
applies_when:
  - Admin generation fails after generate.py prints a Show folder
  - generate.py exits nonzero before playlist.json or track MP3s are complete
  - Rails logs mention AceStepManager.reinitialize! after an upstream generator failure
tags:
  - rails
  - active-job
  - ace-step
  - generate.py
  - admin
  - subprocess
---

# Admin generation must honor generate.py subprocess exits

## Context

Admin generation shells out to `generate.py`, then runs `djmix.py` and imports the completed show. `generate.py` prints `Show folder:` early, before ACE-Step has necessarily finished generating any track audio.

In the observed failure, ACE-Step timed out while polling the first track. `generate.py` exited 1 after creating a partial output folder containing only the opening announcement, prompt logs, and `show.json`.

## Root Cause

`GenerateShowJob` treated a parsed `Show folder:` line as enough evidence to continue, even when the `generate.py` process returned a nonzero exit status. That let the job move toward remix/import work for an incomplete show directory.

The job also called `AceStepManager.reinitialize!`, but that manager method was private, so Rails recorded this secondary error:

```text
ERROR: private method `reinitialize!' called for AceStepManager:Class
```

That secondary error obscured the actual upstream timeout:

```text
TimeoutError: timed out
Exit: 1
```

## Fix

Check the `generate.py` exit status immediately after the process completes and before parsing or acting on the show directory:

```ruby
output1, exit1 = run_and_stream(log, gen_job, cmd1, chdir: root)
append_log(log, gen_job, "Exit: #{exit1}")
raise "generate.py failed with exit #{exit1}" if exit1 != 0
```

Keep `AceStepManager.reinitialize!` public because `GenerateShowJob` legitimately calls it between generation and mixing to free GPU memory.

## Prevention

Add a regression test that stubs `generate.py` to return output containing `Show folder:` with exit 1. The expected behavior is:

- the `GenerationJob` becomes `failed`
- the log includes `generate.py failed with exit 1`
- the log does not include `Running: djmix.py`

Also test that `AceStepManager` publicly responds to `reinitialize!`, since the job depends on that manager API.

## Operator Notes

For a failed generation job, individual songs only exist if `generate.py` emitted completed track MP3s before failing. Completed shows expose tracks in Admin > Shows > selected show. Incomplete failed jobs may only have partial files under `output/<show-folder>/`, and they are not imported into `shows`/`tracks` until the full generation and mix pipeline succeeds.
