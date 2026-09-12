---
date: 2026-08-26
topic: request-line
---

# Request Line

## Summary

A public request line on Dead Internet Radio: visitors "call in" a request (their name, optional email, a fictional band name, a song title). Requests pass a strict automated content filter, get generated as full tracks through the existing prompt-based pipeline with a DJ voiceover announcing the request, and air on the station. The plumbing is designed so an ACE-Step LoRA style engine and a v2 store/revenue-share can bolt on later without rework.

---

## Problem Frame

Dead Internet Radio is currently a one-way broadcast: visitors listen to shows the owner generates alone. There is no way for a listener to touch the station — no interaction, no reason to come back, no story to tell friends beyond "weird site, cool vibes."

Meanwhile, the generation pipeline (`generate.py` → `djmix.py` → `build_site.py`, backed by ACE-Step 1.5) can already produce on-brand tracks from text prompts — it just has no public-facing intake. The raw capability exists; the missing piece is a door.

A request line is the smallest door that fits the product's identity: like a late-night radio call-in show, except the band doesn't exist. The listener asks for a song by a made-up artist, a robot DJ announces "here's a request from [name] for [song] by [band]," and the track airs. The LoRA idea that started this brainstorm is a fidelity upgrade, not the product — the request line is the product.

---

## Actors

- A1. **Requester** (public visitor): submits a request — their display name, optional email, fictional band name, song title. No account.
- A2. **Station owner** (admin): configures nothing day-to-day; hears the results in rotation and can review rejected requests.
- A3. **Generation pipeline** (existing Python + ACE-Step + Kokoro): produces the track and DJ voiceover asynchronously once a request passes filtering.

---

## Key Flows

- F1. **Submit a request**
  - **Trigger:** Visitor opens the request page on the public site.
  - **Actors:** A1
  - **Steps:** Visitor enters their name, an optional email, a fictional band name, and a song title; submits; sees a themed confirmation ("REQUEST LOGGED... KEEP THIS FREQUENCY TUNED").
  - **Outcome:** Request persisted with pending status, or rejected inline if content fails the filter or rate limit.
  - **Covered by:** R1, R2, R3, R8, R9

- F2. **Generate and air a fulfilled request**
  - **Trigger:** A queued request passes filtering.
  - **Actors:** A3
  - **Steps:** Background job builds a generation prompt from the request via the existing prompt pipeline; ACE-Step renders the track; Kokoro produces the DJ voiceover ("here's a request from X for Y by Z"); voiceover and track are combined; result enters rotation/archive with attribution metadata.
  - **Outcome:** Track airs in rotation and appears in the archive credited to requester/band/song.
  - **Covered by:** R4, R5, R6, R7

- F3. **Reject a bad request**
  - **Trigger:** Any submitted text fails the strict content filter, or a visitor exceeds the rate limit.
  - **Actors:** A1
  - **Steps:** Request is rejected before any GPU time is spent; visitor sees a dead-broadcast-flavored error ("SIGNAL LOST" / equivalent); rejection is recorded for admin visibility.
  - **Outcome:** Nothing generated, nothing aired; abuse attempts leave a trail.
  - **Covered by:** R3, R9, R10

---

## Requirements

**Intake**
- R1. Public request form accepting: requester display name, optional email address, fictional band/artist name, song title. All visitor-supplied text is length-limited.
- R2. Required-field validation: band name, song title, and display name must be present; email optional. Invalid input gets clear inline feedback.
- R3. Strict automated content filter on all submitted text (profanity, racist content, political content). Pass = generate automatically; fail = reject with a themed error message. The filter errs toward rejection — it is the curation mechanism, there is no manual approval step in the happy path.
- R9. Per-visitor rate limiting so one person cannot monopolize GPU capacity. Exact limits set during planning.

**Generation**
- R4. Passed requests are queued and generated asynchronously via background jobs — never blocking the HTTP request.
- R5. Generation uses the existing prompt-based pipeline (`generate.py` prompt approach) producing a track consistent with the station's sound. No LoRA training in v1.
- R6. Each fulfilled track carries a DJ voiceover announcing the request: "here's a request from [name] for [song] by [band]" using the existing TTS voiceover tooling, mixed into the track's audio.
- R7. Fulfilled tracks enter the station rotation/archive as first-class content with attribution metadata (requester name, band, song title).

**Attribution & operations**
- R8. Optional requester email is stored unverified alongside the request. It does no work in v1 — no notifications are sent to it. It exists solely as the future payout anchor for v2 revenue share.
- R10. Admin can view requests and their statuses (pending, generating, aired, rejected-with-reason).
- R11. The generation step is structured so a trained ACE-Step LoRA can be enabled later as a configuration change to the same pipeline step, not a rewrite.
- R12. The request data model captures enough attribution (request, requester name, email-if-present, timestamps) to support a future claim-and-pay flow without schema archaeology.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R8.** Given a visitor fills every field including a clean email, when they submit, the request is accepted, queued, and they see a themed confirmation.
- AE2. **Covers R2.** Given a visitor leaves the band name blank, when they submit, they get inline validation feedback and nothing is queued.
- AE3. **Covers R3, F3.** Given a song title containing a slur or explicit political call-out, when submitted, the request is rejected immediately with a themed error and no generation job is created.
- AE4. **Covers R8.** Given a visitor submits with a fake email, when the track fulfills, the track still airs normally and nothing is sent to the email.
- AE5. **Covers R9.** Given a visitor has hit their request quota, when they submit again, they receive a themed "line's busy" response and no job is queued.
- AE6. **Covers R6, R7.** Given a passed request, when generation completes, the resulting audio contains the DJ announcement naming the requester, band, and song, and appears in archive listings with those credits.

---

## Success Criteria

- A stranger can go from landing on the site to having "their" requested track air on the station without any human intervention in between.
- Abusive submissions are stopped by the filter before spending GPU time, and rejected requests are visible to the owner.
- The owner hears real fulfilled requests in rotation and judges whether fidelity is good enough to skip LoRA training entirely.
- Planning inherits complete product behavior: no endpoint, state machine, filter behavior, or attribution rule needs to be invented downstream.

---

## Scope Boundaries

- LoRA training and LoRA-based generation — deferred; v1 ships prompt-only, structured for a later LoRA drop-in (R11)
- Personal pickup pages, delivery notifications, "your track is ready" emails — not built; tracks simply air
- Store, buying tracks, requester revenue share — explicitly planned for v2 but not built; v1 only lays attribution groundwork (R8, R12)
- Email verification — happens at payout time in v2, never at submit time
- Accounts, sign-in (Google/X or otherwise) — none
- Visitor uploads / personal style engines — outside this product's identity; the station generates, visitors request
- Manual moderation queue in the happy path — replaced by harsh auto-filtering

---

## Key Decisions

- **Prompt-first, LoRA-later**: the request-line plumbing is identical either way; ship fast, then decide on LoRA after hearing real output. ACE-Step 1.5's built-in LoRA training/inference makes the upgrade cheap when wanted.
- **Filters ARE the curation**: no manual approval gate; the automated filter is deliberately harsh and biased toward rejection. Simpler operation, zero latency cost for good actors.
- **Optional unverified email as the sole v1 identity**: verify at payout time (v2), never at submit time. Junk emails cost nothing until money exists; v2's confirmation-email-at-payout is where fraud prevention belongs.
- **Air-only delivery**: no per-request pickup experience. Keeps the anonymous broadcast vibe and removes notification infrastructure entirely.

---

## Dependencies / Assumptions

- ACE-Step server availability and throughput (single local instance via `AceStepManager` / `start-ace-step.sh`) bounds how many requests can fulfill per day; rate limits must match real capacity.
- Existing pipeline components are reused as-is: `generate.py` prompt approach, `announce.py`/Kokoro TTS (separate `kokoro/.venv` environment), FFmpeg mixing conventions per AGENTS.md.
- Solid Queue handles async generation jobs, following the existing `GenerateShowJob` shell-out pattern.
- Public text reaching LLM prompts and TTS audio is treated as untrusted input at every boundary.

---

## Outstanding Questions

### Resolve Before Planning

- None.

### Deferred to Planning

- [Affects R3][Needs research] Filter implementation: blocklist vs. LLM-moderation hybrid, and what "political" means operationally at rejection time.
- [Affects R4, R7][Technical] How standalone request-tracks fit the show-shaped pipeline (tracks live under `output/<show>-<timestamp>/`; requests are singles, not shows) — routing into rotation/archive needs a concrete home.
- [Affects R9][Technical] Rate-limit values matched to measured ACE-Step generation capacity.
- [Affects R11][Technical] Where the LoRA toggle lives in the generation invocation so v2 is configuration, not surgery.
