# Plan: Request Line

## Problem summary

Visitors of Dead Internet Radio can only listen. Requirements doc (`docs/brainstorms/request-line-requirements.md`) defines a public request line: visitor submits display name + optional email + fictional band + song title; a strict automated filter rejects profanity/racist/political content; passing requests generate asynchronously as full tracks (existing prompt pipeline style) with a DJ voiceover announcing the request ("here's a request from X for Y by Z"); fulfilled tracks air in rotation/archive with attribution. No LoRA, no pickup pages, no accounts. Optional unverified email stored as future payout anchor.

## Relevant learnings

- `docs/solutions/best-practices/ace-step-duration-quality-tradeoff.md` — keep generated tracks ≤ ~90s; longer = generic structures. Request tracks: target 45–75s.
- `docs/solutions/best-practices/openrouter-free-router-pattern.md` — target `openrouter/free`, never a hardcoded list of free models.
- `docs/solutions/logic-errors/ffmpeg-amix-normalize-low-volume-2026-06-20.md` — overlays use `amix normalize=false` + final `loudnorm=I=-14:TP=-1.5:LRA=7`; intermediates at 44100 Hz stereo pcm_s16le.
- `docs/solutions/integration-issues/admin-generation-honor-subprocess-exits-2026-07-11.md` — jobs must fail loudly on nonzero subprocess exits.
- `AGENTS.md` — generated artifacts go to `output/<dir>/`; `prompts/*.md` are read-only seeds; media served via MediaController Range support.

## Scope boundaries

**In:** SongRequest model + states; strict filter (blocklist + LLM moderation); IP rate limit; public API endpoint; single-track Python generator with DJ VO mix; job wiring through AceStepManager/SubprocessRunner; import as Track under a dedicated requests show; admin requests index; public teletext-styled form UI.

**Out:** LoRA training/inference (structure generation step so a `--lora <path>` flag can be added later); email verification or any email sending; payments/store; accounts/sign-in; per-request pickup pages/notifications; manual moderation queue.

## Architecture decisions

1. **Requests are Tracks under a synthetic Show.** A persistent show row (directory `output/request-line`, slot `requests`) accumulates request tracks. This reuses Track/MediaController/playlist/build_site machinery untouched instead of inventing a parallel airing path. No ADR needed — follows existing ShowImporter conventions.
2. **New thin Python entrypoint `request_track.py`.** `generate.py` is a multi-phase show pipeline; a single-track generator that calls OpenRouter (prompt/lyrics), ACE-Step HTTP API, `announce.py` TTS, and ffmpeg directly is simpler than wedging a singles mode into generate.py. Reuses its helpers by import where practical.
3. **Two-stage filter: deterministic blocklist first, then one LLM moderation call** via OpenRouter (`openrouter/free`). Blocklist catches obvious abuse cheaply/offline; LLM covers racist/political judgment. Fail-closed: moderation timeout/error ⇒ reject.
4. **DB-backed rate limit** (count of requests from same IP in trailing window) rather than in-memory caches — works across web/worker processes, survives restarts, zero new deps.

## Implementation units

### Unit 1 — SongRequest model and states

**Goal:** Persisted request with validation, attribution fields, and an explicit status machine: `pending → rejected | queued → generating → aired | failed`.

**Files:**
- Create `db/migrate/*_create_song_requests.rb` — columns: `requester_name:string`, `email:string` (nullable), `band_name:string`, `song_title:string`, `status:integer` (enum, default pending), `rejection_reason:string` (nullable), `ip_address:string`, `track_id:bigint` (nullable FK), `timestamps` + index on `[ip_address, created_at]`.
- Create `app/models/song_request.rb` — presence validations (name, band, title); length limits (name 40, band 60, title 80, email 254); format validation on email when present; enum statuses.
- Modify `db/schema.rb` via migration run.

**Patterns to follow:** existing models in `app/models/` (plain ApplicationRecord, rails enums).

**Test scenarios:** happy-path save; missing band rejected; over-length title rejected; malformed email rejected; nil email accepted; default status is pending.

**Verification:** `bin/rails db:migrate && bin/rails test test/models/song_request_test.rb`

**Dependencies:** none.

### Unit 2 — Content filter service

**Goal:** `ContentFilter.call!(text...)` returns ok/reject(reason) for all submitted strings. Stage 1: deterministic blocklist (profanity/slur list checked case-insensitively on normalized text) — instant reject. Stage 2: single LLM moderation call (OpenRouter, `openrouter/free`) with a strict system prompt: reject racism, hate, explicit politics, sexual content; return verdict JSON. Fail-closed on any error/timeout.

**Files:**
- Create `app/services/content_filter.rb` — result object (ok?/reason).
- Create `config/blocklist.txt` (checked-in seed word list; owner-editable).
- Test `test/services/content_filter_test.rb` with stubbed OpenRouter client.

**Patterns to follow:** `app/services/progress_parser.rb`; OpenRouter usage pattern in `generate.py` (`call_llm`) for the request shape — replicate in Ruby with Net::HTTP (no new gems unless Faraday already present).

**Test scenarios:** blocklist hit rejects without calling LLM; clean text passes when moderator approves; racist/political sample rejected by moderator verdict; moderator timeout/network error ⇒ reject (fail-closed); multiple fields — any bad field rejects whole request.

**Verification:** `bin/rails test test/services/content_filter_test.rb`

**Dependencies:** none.

### Unit 3 — Intake endpoint with rate limiting

**Goal:** `POST /api/v1/requests` accepts the four fields, applies length/presence validation, rate limit, then ContentFilter; persists accept/reject; returns themed JSON. Rate limit: reject when same IP has ≥ N requests in trailing window (N=3/hour default, env-overridable).

**Files:**
- Create `app/controllers/api/v1/requests_controller.rb` (create only; strong params; IP from `request.remote_ip`).
- Modify `config/routes.rb` — `resources :requests, only: [:create]` inside `api/v1`.
- Test `test/controllers/api/v1/requests_controller_test.rb`.

**Patterns to follow:** existing `api/v1` controllers; CORS already configured for `/api/*`.

**Test scenarios:** valid submission creates pending record + 201 with themed payload; blank field ⇒ 422 field errors, nothing persisted; blocklist word ⇒ rejected record with reason, themed error body; rate-limit exceeded ⇒ themed "line's busy" response before any filtering; filter service failure ⇒ fail-closed reject.

**Verification:** `bin/rails test test/controllers/api/v1/requests_controller_test.rb`

**Dependencies:** Units 1–2.

### Unit 4 — Single-track Python generator

**Goal:** `python3 request_track.py --band "..." --title "..." --dj-line "..." --out-dir <dir>` produces one finished MP3 (≤ ~75s): OpenRouter writes prompt + lyrics (`openrouter/free`), ACE-Step renders audio via its HTTP API (`ACE_STEP_URL`), `announce.py` renders the DJ line, ffmpeg overlays VO at the top (`normalize=false`) and loudnorms the result. Writes `<slug>.mp3` + `<slug>.json` (band, title, requester_name, durations, files) into the given dir. Exits nonzero with message on any stage failure.

**Files:**
- Create `request_track.py`.
- Test `tests/request_track_contract_test.py` (arg parsing, output-contract assertions using mocked subprocess/HTTP; no GPU needed).

**Patterns to follow:** reuse helpers from `generate.py` (LLM call, wav→mp3, announcement) by import; `announce.py` CLI shape; ffmpeg rules from learnings above; honor subprocess exit codes.

**Test scenarios:** full dry mock run produces mp3 + json with required keys; missing band arg exits nonzero; ACE-Step HTTP failure exits nonzero without writing partial json; json duration reflects actual file.

**Verification:** `python3 -m pytest tests/request_track_contract_test.py -q` (or `python3 tests/request_track_contract_test.py` if pytest absent); then one real smoke run against live ACE-Step: `python3 request_track.py --band "Static Bloom" --title "Carrier Signal" --dj-line "Here's a request from Pat for Carrier Signal by Static Bloom." --out-dir /tmp/req-test`

**Dependencies:** none (independent of Rails units).

### Unit 5 — Fulfillment job

**Goal:** `FulfillRequestJob` performs: mark generating → `AceStepManager.acquire` → run_and_stream `request_track.py` into `output/request-line/` → import resulting track as `Track` under the synthetic requests Show → attach to song_request, mark aired. Nonzero exit or missing artifacts ⇒ status failed. Concurrency-limited alongside existing jobs (`key: 'generation'`) so request generation never collides with show generation.

**Files:**
- Create `app/jobs/fulfill_request_job.rb`.
- Modify `app/models/concerns/show_importer.rb` OR add import logic in the job (prefer smallest: local import method modeled on `GenerateShowJob#import_show` reading the per-track json).
- Ensure/show-create logic for the `output/request-line` synthetic show (slot `requests`).
- Test `test/jobs/fulfill_request_job_test.rb` (stub SubprocessRunner/AceStepManager).

**Patterns to follow:** `GenerateShowJob` (acquire/release, run_and_stream, exit honoring per learning, import), `RemixShowJob` concurrency limit.

**Test scenarios:** success path creates Track + links song_request + aired; script exit 1 ⇒ failed status, no Track; missing json after exit 0 ⇒ failed; ACE-Step session always released (success and failure).

**Verification:** `bin/rails test test/jobs/fulfill_request_job_test.rb`

**Dependencies:** Units 1, 4.

### Unit 6 — Wire intake to fulfillment

**Goal:** Accepted requests enqueue `FulfillRequestJob` (via Solid Queue; dev inline adapter works unchanged).

**Files:**
- Modify `app/controllers/api/v1/requests_controller.rb` — enqueue after successful filter pass.

**Test scenarios:** accepted request has a queued job enqueued; rejected request enqueues nothing.

**Verification:** `bin/rails test test/controllers/api/v1/requests_controller_test.rb`

**Dependencies:** Units 3, 5.

### Unit 7 — Admin requests view

**Goal:** Admin sees all song requests with status, submitted text, attribution, rejection reasons; newest first.

**Files:**
- Create `app/controllers/admin/requests_controller.rb` (index only, `require_admin` via `Admin::BaseController`).
- Create `app/views/admin/requests/index.html.erb` (match existing admin table styling).
- Modify `config/routes.rb` (admin namespace).

**Test scenarios:** requires auth (redirects to login); lists requests with statuses; non-admin cannot access.

**Verification:** `bin/rails test test/controllers/admin/requests_controller_test.rb`

**Dependencies:** Unit 1.

### Unit 8 — Public request form UI

**Goal:** Teletext/dead-broadcast styled request panel in the player site: four inputs, submit → themed confirmation ("REQUEST LOGGED... KEEP THIS FREQUENCY TUNED") or themed rejection/busy messages. No accounts, no polling page.

**Files:**
- Modify `public/index.html`, `public/app.js`, `public/style.css`.
- Contract test `tests/request_form_contract_test.js` asserting DOM hooks exist and fetch targets `/api/v1/requests`.

**Patterns to follow:** existing `public/app.js` fetch patterns; preserve teletext visual language per AGENTS.md (Rams principles; no generic dashboard UI).

**Test scenarios:** form present with correct fields; disabled/submitting state during send; success renders confirmation copy; 422 renders field-level message; rejection renders themed signal-lost copy.

**Verification:** `node --test tests/`

**Dependencies:** Unit 3.

## Verification strategy

Per-unit commands above (TDD: each unit starts RED, then GREEN, refactor within unit).

Broader:
1. Full suites: `bin/rails test` and `node --test tests/`.
2. End-to-end smoke with live stack: start ACE-Step (`./start-ace-step.sh`), `bin/dev`, submit a clean request through the UI, watch Solid Queue log fulfill it, confirm the track appears in the requests show playlist and plays through MediaController; confirm DJ VO names the requester/band/title.
3. Abuse smoke: submit slur/political samples and a rate-limit burst; verify themed rejections, no GPU acquisition, records visible in admin with reasons.
4. Audio check in context: fulfilled track auditioned alongside existing station audio (per AGENTS.md, never judge VO/levels in isolation) — loudnorm target −14 LUFS consistent with station IDs.
