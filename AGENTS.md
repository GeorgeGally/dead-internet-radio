# AGENTS.md

Guidance for coding agents working in this repo.

## Project Shape

Dead Internet Radio is a Python-driven AI radio pipeline with a static web player.

- `generate.py` orchestrates LLM prompts, ACE-Step music generation, and Kokoro DJ voiceovers.
- `djmix.py` creates final DJ mixes with crossfades, voice overlays, station IDs, ID3 tags, cue JSON, and final MP3 encoding.
- `announce.py` generates lo-fi TTS voiceovers through the Kokoro environment.
- `generate_station_ids.py` creates station IDs and jingles.
- `build_site.py` builds the static site into `dist/` from `src/`, `output/`, and `mixes/`.
- `src/` contains the browser player and teletext-style UI.
- `prompts/` contains seed system prompts for Producer, DJ, Announcer, and station IDs.
- `output/`, `mixes/`, `station-ids/`, and `dist/` are generated/artifact directories.

Avoid modifying `ACE-Step-1.5/` or `kokoro/` unless the task explicitly targets those vendored/runtime dependencies.

## Before Making Changes

- Search `docs/solutions/` for related prior learnings. It is organized by category and uses YAML frontmatter fields like `module`, `tags`, and `problem_type`.
- Read `CONCEPTS.md` when touching generation pipeline naming. Use project terms like Slot, Brief, Show, Track, Caption, DJ Drop, Producer, DJ, and Announcer consistently.
- Treat `.env` as sensitive. Never print, copy, commit, or document real API keys.
- Preserve user-generated audio and show outputs unless the user explicitly asks to regenerate or delete them.

## Implementation Principles

- Prefer the smallest correct change. Most bugs in this repo are pipeline parameter issues, file-routing mistakes, or prompt/output boundary violations.
- Keep pipeline steps explicit rather than hiding orchestration in broad abstractions.
- Keep generated artifacts separate from seed inputs. The pipeline must not write generated briefs, payloads, or set notes back into `prompts/*.md`.
- For prompt changes, preserve the existing bot role and output contract. Validate with `python generate.py "test slot" --dry-run` when possible.
- For frontend changes, preserve the established teletext/dead-broadcast visual language instead of introducing generic dashboard UI.

## Design Principles (Dieter Rams)

Apply Dieter Rams' ten principles when building or modifying UI. The `design-principles` skill loads automatically on frontend work. Use `design-is` for a formal evidence-cited audit with a fix plan.

## Audio Pipeline Gotchas

- FFmpeg `amix` defaults to `normalize=true`, which can silently reduce volume across the whole mix. For controlled overlays, use `normalize=false` and normalize the final output with `loudnorm`.
- Final mix loudness should target `loudnorm=I=-14:TP=-1.5:LRA=7` unless there is a deliberate reason to change the station standard.
- Keep intermediate mix audio at `44100 Hz`, stereo, `pcm_s16le` unless changing the whole pipeline.
- Station IDs and DJ voiceovers should be checked in context with music, not only as isolated WAV files.

## Verification Commands

Use the narrowest verification that proves the change.

- Install root dependencies: `pip install -r requirements.txt`
- Dry-run generation prompts: `python generate.py "late night" --dry-run`
- Build the static site: `python build_site.py`
- Create a mix from an existing show: `python djmix.py output/<show-directory>`
- Test TTS manually: `./announce.py --text "This is Dead Internet Radio." --output output/test.wav`

When audio output changes, regenerate or inspect a short representative mix and compare perceived loudness, cue timing, and voice intelligibility.

## Inter-Agent Workflow

All agent work must flow through git. This lets agents discover, review, and build on each other's changes without side-channel coordination.

**Git is the agent knowledge base.** PRs, commit messages, branch names, and worktree paths are how agents communicate, store context, and reference past decisions. An agent investigating a problem should mine git history — PR discussions, commit bodies, and merged branches — as its first step, just as it would read the codebase itself.

**The user works on `main`. Agents work in the background.** The user should never have to think about worktrees, branches, or PRs — the agent handles all of it invisibly.

### How Agents Work (Transparent to the User)

1. When given a task, create a worktree on a new branch off `main`.
2. Do all work inside that worktree. Never touch the user's `main` checkout.
3. Commit, push, and open a draft PR. Mark it ready when shippable.
4. When done, clean up the worktree (`git worktree remove`, `git worktree prune`).

```bash
# Agent creates a worktree silently
git worktree add -b feat/my-feature ../dead-internet-radio-feat-my-feature main
# ... work happens here ...
# Agent pushes and opens PR
git push -u origin feat/my-feature
gh pr create --draft --title "feat: my feature" --body "..."
# Agent cleans up
git worktree remove ../dead-internet-radio-feat-my-feature --force
git worktree prune
git branch -d feat/my-feature
```

- Branch naming: `<category>/<short-description>` (e.g., `fix/crossfade-volume`, `feat/station-id-jingle`, `refactor/mix-pipeline`).
- Worktree path convention: `../dead-internet-radio-<branch-slug>/`.

### Pull Requests as Inter-Agent Communication

- Push early, open a draft PR, and mark ready when the change is shippable.
- The PR description is the primary handoff between agents. Include:
  - What problem this solves and why
  - What files/directories are affected (especially generated artifacts)
  - How to verify the change (command and expected result)
  - Any open questions or known limitations
- Use PR comments for review feedback and decisions. Prefer threaded PR discussion over external chat — it stays with the code.
- When picking up another agent's incomplete work, comment on the PR to signal intent and push to the same branch.

### Git as a Reference Library

Before starting any task, check what agents have already done:

```bash
# What's actively being worked on right now?
git worktree list                     # local worktrees (including other agents')
git branch -a                         # all branches, local and remote
gh pr list --state open               # open PRs and their status

# What decisions were made in the past?
gh pr list --state merged --limit 10  # recently landed work
gh pr view <number>                   # full PR description, discussion, and decisions
gh pr diff <number>                   # exact changeset for a past PR
git log --oneline main -20            # recent merge commits and their intent

# What's the story behind this code?
git log --follow -- <path>            # full history of a file or directory
git log --grep="fix:" -- main         # search commit messages for past fixes
```

Think of git as the agents' shared memory. Every commit message records intent, every PR captures discussion and tradeoffs, and every branch documents a thread of work. Agents should read this history before writing new code.

### Commit Conventions

- Use conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
- Make commits atomic and self-contained. Each commit should leave the repo in a verifiable state.
- Write commit messages that explain intent, not just mechanics. Another agent reading `git log` should understand what was done and why.

### Review Before Merge

- Run verification commands (see above) before marking a PR ready.
- Prefer a second agent's review before merging non-trivial changes.
- Squash-merge to keep a clean `main` history. Use the PR description as the merge commit body.

## Agent-Native Notes

- User-visible actions should have scriptable equivalents where practical. If adding a UI-only behavior, consider whether a CLI/script path is also needed.
- Keep tools and scripts primitive: read, generate, mix, build, and validate. Avoid burying policy decisions in helper code when a prompt or explicit parameter should own the behavior.
- Prefer shared files and manifests over hidden agent-only state so humans and agents inspect the same workspace.
- Git is the universal agent communication bus. If a decision or context is worth sharing, it goes in a commit message, PR description, or AGENTS.md — never only in ephemeral chat history.

## Documentation

## Admin Auth

Admin auth uses session-based login with a styled page — never HTTP basic auth popups. The main site (frontend) is completely public (no auth, no redirects). Credentials from `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars (defaults: `admin` / `deadinternet`).

- `Admin::SessionsController#new` renders the login form, `#create` validates and sets `session[:admin]`
- `Admin::BaseController#require_admin` redirects to `/admin/login` if not authenticated
- Login form matches the teletext/dead-broadcast dark aesthetic (monospace, amber accent, scanlines, minimal)
- Never use `authenticate_or_request_with_http_basic` or any browser-native auth dialog

- Add durable problem solutions to `docs/solutions/<category>/` when a non-trivial issue is solved.
- Update `CONCEPTS.md` when a new domain term becomes important.
- Keep README changes user-facing; keep agent/process guidance here.
