---
title: Branches visual self-intersection false positive kills branch growth
date: 2026-07-03
category: logic-errors
module: web_player_visuals
problem_type: logic_error
component: frontend_stimulus
severity: medium
symptoms:
  - Branches grow only ~10 pixels before stopping
  - Each branch dies after ~2 frames and is replaced by a new short spike
  - Generative artwork appears as stuttering short stubs instead of growing tendrils
root_cause: logic_error
resolution_type: code_fix
tags:
  - branches
  - collision-detection
  - segment-intersection
  - generative-art
  - p5
---

# Branches Visual Self-Intersection False Positive Kills Branch Growth

## Problem

The "Branches" generative artwork (`src/visuals/branches.js`) could not grow — branches stopped after ~10 pixels, dying and respawning as short spikes. The visual never produced the intended long, branching organic structures.

## Symptoms

- Branches appear as tiny ~10px spikes instead of growing tendrils
- A new branch spawns from the outer circle roughly every 2 frames
- The branch population cycles rapidly — each branch lives ~2 frames before dying
- The visual is recognizably "branches"-like (lines from center) but never fills the canvas

## What Didn't Work

No failed attempts — the root cause was identified directly via code inspection. The retry mechanism (calling `addBranch()` when a branch died) masked the symptom by constantly spawning new branches instead of letting existing ones grow.

## Solution

Three loop-bound changes in `src/visuals/branches.js` to exclude the adjacent segment from self-intersection checks.

### 1. `selfHit` — skip the segment the new segment is growing from

```diff
- for (let i = 1; i < this.segments.length; i++) {
+ for (let i = 1; i < this.segments.length - 1; i++) {
```

### 2. `othersHit` — iterate all branches but skip self explicitly

```diff
- for (let j = 0; j < branches.length - 1; j++) {
-   const b = branches[j];
+ for (let j = 0; j < branches.length; j++) {
+   const b = branches[j];
+   if (b === this) continue;
```

### 3. `branchHit` — defensive skip of test branch's adjacent segment

```diff
- for (let i = 1; i < s.length; i++) {
+ for (let i = 1; i < s.length - 1; i++) {
```

## Why This Works

The `checkIntersection` function implements standard line-segment intersection using the parametric method. It correctly returns true when two segments share an endpoint (t=1, u=0) — which is correct for general intersection detection. However, it's the **wrong answer** for self-intersection detection in a growing branch.

Each new segment is drawn FROM the branch's current tip, which is also the endpoint of the last existing segment. This means the new segment always shares an endpoint with the adjacent segment. `checkIntersection` treats every new segment as intersecting the adjacent one, so every branch "detects" a self-intersection after adding just 2 segments and stops.

The `othersHit` function had a second, independent bug: it used `branches.length - 1` as the loop bound, assuming the current branch was always the last element in the array. When `chance(2)` in `draw()` (50% probability per frame) spawned a new branch via `push()`, the previously-last branch was no longer last. On the next frame, its `othersHit` loop included its own index, and `branchHit` found the same adjacent-segment false positive.

The combination of both bugs meant:
1. The newest branch died within ~2 frames (selfHit adjacent-segment bug)
2. Every other branch died with the same latency (othersHit self-reference bug)
3. Constant respawns (via `chance(2)` and retry-on-death) masked the pattern as "spiky cycling"

## Prevention

- When using line-segment intersection for self-collision or growth boundary checks, always consider whether endpoint sharing (t=0, t=1, u=0, or u=1) should count as a hit. A variant with an `excludeSharedEndpoints` parameter would make the intent explicit.
- When a loop iterates a collection with a bound like `length - 1` to "exclude the current item," prefer `if (item === this) continue` with a full-range loop instead — the assumption that the current item is always last is brittle.
- If a behavior retry spawns new instances of the same thing, consider whether the retry is masking a failure to grow the existing instance.

## Related Issues

- `docs/solutions/logic-errors/ffmpeg-amix-normalize-low-volume-2026-06-20.md` (another audio pipeline logic fix)
