# Teletext Editorial Redesign

> **Note (2026-07-05):** This plan was not executed. `pages.json` generation was removed from `build_site.py` since the teletext frontend was never built. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing listener interface as a responsive 4:3 editorial teletext broadcast with six distinct page compositions while preserving synchronized audio and navigation behavior.

**Architecture:** Keep the current vanilla `index.html`, `style.css`, and `app.js` architecture. The HTML supplies a stable broadcast frame and real navigation buttons; JavaScript renders page-specific semantic DOM into a 40×25 CSS grid; CSS owns the strict palette, responsive frame sizing, multi-cell typography, mosaic treatment, redraw transition, and reduced-motion behavior.

**Tech Stack:** HTML5, CSS Grid, vanilla JavaScript, Node.js built-in test runner, local static HTTP server, in-app browser.

---

## File Structure

- `src/index.html`: accessible 4:3 broadcast shell, service header, page viewport, navigation controls, audio element.
- `src/style.css`: palette, viewport-fitted 4:3 frame, 40×25 grid, page compositions, responsive scaling, focus and reduced-motion states.
- `src/app.js`: synchronized player, page state, semantic page renderers, mosaic data, redraw behavior, error state.
- `tests/frontend_contract_test.js`: static and runtime contracts for the shell, palette, page variants, grid placement, and preserved playback/navigation behavior.

### Task 1: Lock The Frontend Contracts

**Files:**
- Create: `tests/frontend_contract_test.js`

- [ ] **Step 1: Write failing tests**

Use `node:test`, `node:assert/strict`, and `fs.readFileSync` to assert:

- the HTML contains `#broadcast-frame`, `#page-header`, `#page-body`, real `button` controls, and no Google Fonts URL
- the CSS declares `aspect-ratio: 4 / 3`, a 40-column/25-row grid, only the eight palette hex values, visible focus rules, and reduced-motion rules
- the JavaScript includes renderers for P100, P101, three distinct ad layouts, P105, a redraw class, error rendering, epoch normalization, eight-second cycling, and arrow-key navigation

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/frontend_contract_test.js`

Expected: failures for the missing broadcast frame and page-specific class contracts.

- [ ] **Step 3: Keep the failing suite as the implementation checklist**

Do not weaken assertions to match the current frontend.

### Task 2: Build The 4:3 Broadcast Shell

**Files:**
- Modify: `src/index.html`
- Modify: `src/style.css`

- [ ] **Step 1: Replace the document shell**

Create `#broadcast-frame > #screen`, keep the service header and page body, and replace clickable spans with real previous/next buttons. Remove Google Fonts links.

- [ ] **Step 2: Implement the frame and grid**

Make the frame the largest centered 4:3 rectangle that fits the viewport. Define a 40×25 CSS grid and cell-based custom properties. Keep all surfaces black and use only the eight teletext colors.

- [ ] **Step 3: Add shared typography and service chrome**

Use the bundled VT100 font. Add compact service header/footer styles, multi-cell display type, blue rules, visible focus inversion, and no cards or CRT effects.

- [ ] **Step 4: Run tests**

Run: `node --test tests/frontend_contract_test.js`

Expected: shell, palette, grid, focus, and reduced-motion assertions pass; renderer assertions still fail.

### Task 3: Implement Editorial Page Renderers

**Files:**
- Modify: `src/app.js`
- Modify: `src/style.css`

- [ ] **Step 1: Implement shared render helpers**

Add helpers for semantic regions, display text, rules, metadata, wrapping with explicit limits, and decorative mosaic rendering with `aria-hidden`.

- [ ] **Step 2: Implement P100**

Render the reference-led split composition: oversized three-line station wordmark, small skull/data mark, calibration strip, strapline, signal/status panel, and a right rail containing current track, next track, and direct P100-P105 menu buttons.

- [ ] **Step 3: Implement P101**

Render a yellow masthead and compact numbered bulletin blocks separated by blue rules.

- [ ] **Step 4: Implement P102-P104 as distinct layouts**

P102 is illustration-led, P103 is type-led, and P104 is classified/hybrid. Use the same generated ad schema but map content to fixed line-limited regions.

- [ ] **Step 5: Implement P105**

Fill the content field with repeated signal phrases and deterministic color/scale interruptions.

- [ ] **Step 6: Run tests**

Run: `node --test tests/frontend_contract_test.js`

Expected: all renderer and static contract tests pass.

### Task 4: Add Redraw, Error, And Accessibility Behavior

**Files:**
- Modify: `src/app.js`
- Modify: `src/style.css`

- [ ] **Step 1: Add stepped redraw behavior**

Apply a short `.is-redrawing` state during page navigation and remove it after the stepped animation completes.

- [ ] **Step 2: Preserve live behavior**

Keep the epoch modulo calculation, track seeking, autoplay fallback, ended-event advance, one-second clock, eight-second page cycle, and timer reset after manual navigation.

- [ ] **Step 3: Add designed load failure**

Render a red in-frame system message while retaining header and footer structure.

- [ ] **Step 4: Add reduced-motion behavior**

Disable blinking and redraw animation under `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Run automated verification**

Run:

```bash
node --test tests/frontend_contract_test.js
node --check src/app.js
git diff --check
```

Expected: all commands exit 0.

### Task 5: Build And Verify In Browser

**Files:**
- Generated only: `dist/`

- [ ] **Step 1: Build the static site without regenerating content**

Copy the updated frontend assets into `dist/` while retaining the existing `playlist.json`, `pages.json`, and audio files.

- [ ] **Step 2: Serve the site locally**

Run: `python3 -m http.server 4173 --directory dist`

- [ ] **Step 3: Verify desktop and mobile layouts**

Open `http://localhost:4173`, confirm the 4:3 frame, inspect P100-P105, navigate by buttons and arrow keys, and capture desktop and narrow-viewport screenshots.

- [ ] **Step 4: Verify runtime behavior**

Confirm the clock updates, auto-cycle advances, manual navigation resets the cycle, audio initialization does not throw, and browser console has no application errors.

- [ ] **Step 5: Run final verification**

Run:

```bash
node --test tests/frontend_contract_test.js
node --check src/app.js
git diff --check
```

Expected: zero failures and zero syntax/diff errors.
