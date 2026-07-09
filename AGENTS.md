# AGENTS.md

Guidance for coding agents working in this repo.

## Project Shape

Dead Internet Radio is a **Python audio pipeline** with a **Rails 8 web app**, both at root.

**Python pipeline** (`pip install -r requirements.txt`):
- `generate.py` — LLM prompts (via OpenRouter) + ACE-Step music generation. Needs `ACE_STEP_URL` (default `http://localhost:8001`), `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` in `.env`.
- `djmix.py` — crossfades, voiceovers, ID3 tags, cue JSON, final MP3.
- `announce.py` — Kokoro TTS voiceovers (uses `kokoro/.venv/` — separate environment).
- `build_site.py` — builds static site from `src/`, `output/`, `mixes/` into `dist/`.
- `generate_station_ids.py` — station ID jingles.
- Output: `output/` (tracks), `mixes/` (mixed shows), `dist/` (static site), `station-ids/`.

**Rails 8 app** — wraps the pipeline with PostgreSQL, admin dashboard, API:
- `config.api_only = false` — serves admin views AND API endpoints.
- Job adapter: `solid_queue` (not Sidekiq — see `config/application.rb`).
- `Gemfile` is Rails, `requirements.txt` is Python.
- `config/initializers/cors.rb` — allows all origins for `/api/*`.
- `bin/dev` starts the Rails dev server (see `Procfile.dev`).
- Media served via `MediaController` with HTTP Range support — no static copies.

**Frontend** — static teletext/dead-broadcast player in `src/` (vanilla JS, p5 visuals).
- Tests: `node --test tests/` (Node.js contract tests in `tests/`).
- No Rails test suite exists (no `test/` or `spec/`).

**Generated artifacts never go back into seed inputs.** The pipeline writes to `output/<slug>-<timestamp>/`; `prompts/*.md` are read-only seed files.

**Pipeline flow:** `generate.py` → `djmix.py` → `build_site.py`. Or `run.sh` does all three. The Rails app shells through the same Python scripts via `GenerateShowJob`.

**ACE-Step 1.5** runs as a separate server. Start manually: `cd ACE-Step-1.5 && uv run acestep-api`. In Rails, `AceStepManager` auto-starts/stops it.

**Domain terms** (see `CONCEPTS.md`): Slot, Brief, Show, Track, Caption, DJ Drop. The "Writer" bot was renamed to **DJ**.

## Audio Pipeline Gotchas

- FFmpeg `amix` defaults to `normalize=true`. For controlled overlays use `normalize=false`, then normalize final output with `loudnorm=I=-14:TP=-1.5:LRA=7`.
- Keep intermediate mix audio at 44100 Hz, stereo, `pcm_s16le`.
- Station IDs and DJ voiceovers should be checked in context with music, not as isolated WAVs.
- Before touching `amix`/`loudnorm` parameters, check history first (`git log -p -- <file>`) — see Inter-Agent Workflow.

## Verification Commands

Use the narrowest verification that proves the change.

- Dry-run prompts: `python generate.py "late night" --dry-run`
- Build site: `python build_site.py`
- Create mix from existing show: `python djmix.py output/<show-directory>`
- Test TTS manually: `./announce.py --text "This is Dead Internet Radio." --output output/test.wav`
- Frontend contract tests: `node --test tests/`
- Rails dev server: `bin/dev`

## Admin Auth

Session-based login at `/admin/login`. Never HTTP basic auth.
- Credentials from `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars (defaults: `admin` / `deadinternet`).
- `Admin::BaseController#require_admin` checks `session[:admin] == true`.
- Frontend (player) is completely public — no auth, no redirects.

## Inter-Agent Workflow

The user works on `main`. Agents work in background worktrees.

```bash
git worktree add -b feat/my-feature ../dead-internet-radio-feat-my-feature main
# work, commit, push
gh pr create --draft --title "feat: my feature" --body "..."
git worktree remove ../dead-internet-radio-feat-my-feature --force
git worktree prune && git branch -d feat/my-feature
```

- Branch naming: `<category>/<short-description>`.
- Worktree path: `../dead-internet-radio-<branch-slug>/`.
- PR descriptions are the primary handoff. Include problem, affected files, verification steps, and open questions.
- Squash-merge PRs, use PR description as merge commit body.
- Before starting, check `git worktree list`, `gh pr list --state open`, and recent `git log`.
- Orient with `git log --oneline -15` before starting unfamiliar work; use `git log -p -- <file>` or `git blame <file>` before editing code with non-obvious parameters.
- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- When a commit resolves something documented in `docs/solutions/`, mention the doc's path in the commit body (e.g., "See docs/solutions/logic-errors/ffmpeg-amix-normalize-low-volume-2026-06-20.md") so `git log --grep` can find it later.

## Design Principles

Apply Dieter Rams' ten principles when building or modifying UI. Preserve the teletext/dead-broadcast visual language — no generic dashboard UI.

## Before Making Changes

- Search `docs/solutions/` for related prior learnings (YAML frontmatter: `module`, `tags`, `problem_type`).
- Read `CONCEPTS.md` when touching generation pipeline naming.
- Treat `.env` as sensitive. Never print, copy, commit, or document real API keys.
- Preserve user-generated audio and show outputs unless explicitly asked to regenerate.
- Avoid modifying `ACE-Step-1.5/` or `kokoro/` unless the task targets those vendored runtimes.
- Prefer the smallest correct change — most bugs are pipeline parameter issues, file-routing mistakes, or prompt/output boundary violations.
- Add durable solutions to `docs/solutions/<category>/` when solving non-trivial problems.
