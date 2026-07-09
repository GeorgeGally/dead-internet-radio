---
title: "Strengthen Git Orientation Guidance in AGENTS.md"
type: docs
status: completed
date: 2026-07-09
---

# Strengthen Git Orientation Guidance in AGENTS.md

## Summary

Expands the existing one-line git-orientation bullet in AGENTS.md's Inter-Agent Workflow section into concrete, copy-pasteable commands (recent-log orientation, blame-before-edit), plus a pointer from Audio Pipeline Gotchas back to it, plus a lightweight commit convention linking fixes to `docs/solutions/`. No new heading is introduced. Net addition is roughly 4-5 lines — a fraction of the size of the near-identical section removed from this same file today.

---

## Problem Frame

AGENTS.md's Inter-Agent Workflow section already gestures at git orientation ("Before starting, check `git worktree list`, `gh pr list --state open`, and recent `git log`") but gives no concrete commands beyond that. It used to have more: commit `91af584`, authored today (2026-07-09, 01:26), removed a `### Git as a Reference Library` subsection — nine git/gh commands plus a paragraph framing git as "the agents' shared memory." That removal happened inside a broad length cut touching Project Shape, Admin Auth, Design Principles, and Inter-Agent Workflow (which shrank from roughly 80 lines to 8) in the same commit — not a targeted rejection of git-as-context specifically.

An earlier version of this plan proposed a new standalone `## Git Archaeology` section plus a churn/hotspot diagnostic, framed as if AGENTS.md had no git guidance at all. Adversarial review caught both errors: the "no git guidance" claim is false (the line above already exists), and a new standalone section revives almost exactly the shape of content that was cut today for being bloat. This revision instead strengthens the existing line in place and drops the churn diagnostic, which had already been flagged as unreliable at this repo's 13-commit depth and produced a command with a blank-line output artifact.

---

## Requirements

- R1. The existing git-orientation bullet in Inter-Agent Workflow gains concrete, copy-pasteable commands: recent-log orientation and blame/log-before-edit for risk-prone code.
- R2. The addition stays smaller than what was cut today (target: 4-5 lines total, no new heading) so it doesn't reintroduce the bloat the same commit removed.
- R3. Audio Pipeline Gotchas gains one inline pointer back to the blame-before-edit practice, so it fires at the exact risk site.
- R4. AGENTS.md documents a lightweight commit convention: mention the `docs/solutions/` path in the commit body when a commit resolves a documented problem, so `git log --grep` can find it later.
- R5. No nested-AGENTS.md restructuring, git hooks, CI enforcement, or resurrection of the full removed section are introduced — scope stays a minimal, in-place content edit.

---

## Key Technical Decisions

- KTD1. Prose mention over formal git trailer syntax for solution-doc linking: no commit convention of any kind (trailer or prose) has existed in this repo before, so the weak precedent (2/13 commits reference `docs/solutions/`, 2/7 docs ever linked) measures whether anyone linked solution docs at all, not whether trailer syntax underperforms prose. The actual case for prose is that it reads identically to an LLM consumer via `git log --grep` while adding no syntax to learn or enforce.
- KTD2. Drop the churn/hotspot diagnostic entirely rather than reframe it: the repo's 13-commit, 1-month history makes churn indistinguishable from recency, the proposed command produced a blank-line artifact as its top result in testing, and cutting it keeps the addition smaller — consistent with R2's size constraint.
- KTD3. Expand the existing Inter-Agent Workflow bullet in place rather than add a new top-level section: the near-identical content already existed as a standalone `### Git as a Reference Library` section and was cut today as part of a length pass. A new heading is the shape most likely to read as bloat again; an in-place expansion of an existing line is smaller and sits where the file already gestures at this practice.
- KTD4. No CI or git-hook enforcement of the solution-doc-linking convention: keeps this plan a pure content change. If the convention doesn't get adopted organically, enforcement is a separate, later decision — not assumed here.

---

## Scope Boundaries

### Deferred to Follow-Up Work

- Restoring the full pre-compaction `### Git as a Reference Library` section verbatim — considered and rejected in favor of the leaner in-place expansion (KTD3).
- Nested AGENTS.md / `app/AGENTS.md` Rails-specific split — a separate axis, discussed previously, not part of this plan.
- Skills-as-modules (`SKILL.md`) for gotcha content — deprioritized; revisit only if the gotcha list grows substantially.
- Temporary vs. permanent instruction sections — deprioritized; no active migration in this repo to warrant it.
- Retroactively editing past commit messages to add solution-doc links — history is immutable; the convention is forward-looking only.

---

## Risks & Dependencies

- Recurrence risk: this category of content (git-as-context guidance) was already cut once today for being bloat. Even at a much smaller size, a future compaction pass could cut it again if a reviewer pattern-matches on topic rather than size. Mitigated by introducing no new heading and keeping the net addition to roughly 4-5 lines (KTD3, R2).
- Adoption risk: the solution-doc-linking convention has no enforcement (KTD4) and weak existing precedent (2/13 commits). It may not get consistently followed. Accepted as a documentation-only bet with no code or CI dependency.

---

## Implementation Units

### U1. Strengthen the git-orientation bullet and cross-link it from Audio Pipeline Gotchas

**Goal:** Turn the existing one-line git gesture into concrete, copy-pasteable commands, sized to survive the next compaction pass.

**Requirements:** R1, R2, R3, R5

**Dependencies:** none

**Files:** AGENTS.md

**Approach:** Replace the single existing bullet — "Before starting, check `git worktree list`, `gh pr list --state open`, and recent `git log`." — with three bullets in the same location: (1) the original worktree/PR-list check, kept as-is; (2) `git log --oneline -15` for recent-commit orientation; (3) `git log -p -- <file>` or `git blame <file>` before editing code with non-obvious parameters. Introduce no new heading. Add one line inside `## Audio Pipeline Gotchas` pointing back to bullet (3), so agents editing `amix`/`loudnorm` values are cued at the exact risk site rather than relying on a rule stated only once, elsewhere in the file.

**Patterns to follow:** The bullet being replaced, and the file's existing terse-bullet voice (see Verification Commands for tone).

**Test scenarios:** Test expectation: none -- documentation-only change with no runtime behavior.

**Verification:** Net addition across both edits is roughly 4-5 lines. No new top-level heading is introduced (KTD3). File lands under roughly 100 lines. The result does not recreate the prose/philosophy paragraph that was cut from this file today.

### U2. Document solution-doc linking convention

**Goal:** Make `docs/solutions/` entries discoverable via `git log --grep` by establishing a plain-prose commit-body convention going forward.

**Requirements:** R4, R5

**Dependencies:** none (independent of U1)

**Files:** AGENTS.md

**Approach:** Add one line next to the existing conventional-commits guidance in `## Inter-Agent Workflow`: when a commit resolves something documented in `docs/solutions/`, mention the doc's path in the commit body (e.g., "See docs/solutions/logic-errors/ffmpeg-amix-normalize-low-volume-2026-06-20.md") — plain prose, no trailer key required.

**Patterns to follow:** Existing conventional-commits bullet phrasing in the Inter-Agent Workflow section.

**Test scenarios:** Test expectation: none -- documentation-only change with no runtime behavior.

**Verification:** Convention is stated as a single imperative sentence. No formal trailer syntax introduced, per KTD1. Sits next to the existing conventional-commits guidance rather than as a disconnected new section.

---

## Sources & Research

- `git show 91af584 -- AGENTS.md` (this session) revealed a `### Git as a Reference Library` section — nine git/gh commands plus a "git is shared memory" paragraph — was removed today, 2026-07-09 at 01:26, inside a broad length cut that also touched Project Shape, Admin Auth, Design Principles, and Inter-Agent Workflow in the same commit. Not a targeted rejection of git-as-context; this plan re-adds the concept at roughly one-quarter the size of what was cut.
- Current AGENTS.md line 77 (`grep -n "Before starting, check" AGENTS.md`) already carries a one-line git gesture with no concrete commands — this plan strengthens that line in place rather than adding a new section.
- `git log --all --grep="docs/solutions"` → 2 matches against 7 existing solution docs — informs KTD1 (the evidence is about whether anyone links solution docs at all, not trailer-vs-prose specifically).
- A blame-style check on `djmix.py:183` (`amix ... normalize=false`) traces cleanly to the fix documented in `docs/solutions/logic-errors/ffmpeg-amix-normalize-low-volume-2026-06-20.md`, confirming blame-before-edit has real payoff in this repo.
- The originally-proposed churn command (`git log --format=format: --name-only | sort | uniq -c | sort -rg | head`) produced a blank-line artifact as its top result when run against this repo, in addition to being an unreliable signal at 13 commits — both informed dropping it (KTD2).
