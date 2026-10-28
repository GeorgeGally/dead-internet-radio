# Tech Spec: Dead Internet Radio — Control Center & UI

## Overview

Two-phase project: (1) immediate frontend UI improvements to the player, then (2) a Rails API+admin layer that wraps the existing Python pipeline with a database, admin dashboard, and API-driven player.

---

## Phase 1: Frontend UI Improvements

Three independent tasks, any order.

### 1a. Now-Playing Synth LED Readout

**Problem:** No visual-name or filter-name indicator on the main player screen. Must open gallery to see what's active.

**Solution:** Add a 2-line dark segment-display element to the header `display-ctrl` housing.

```
┌─────────────────────────┐
│ GENERATIVE BLOCKS       │  ← current visual name
│ LED GRID                │  ← current filter name (or blank)
└─────────────────────────┘
```

**HTML:** New `<div id="np-display">` inside `.dc-inner`, sibling to the knob and gallery button.

**CSS:**
- Dark background: `background: #1a1a1a`, `border-radius: 6px`
- Padding: `6px 10px`, min-width to match knob height
- Text styling: monospace, `9px` for visual name (`#ff5a1f`), `8px` for filter line (`rgba(255,255,255,0.4)`)
- Line 1 uppercase, letter-spacing `0.1em`
- Subtle inner shadow for recessed-LCD feel
- Transition: brief crossfade when text changes

**JS:** In `app.js` `setupControls()`:
- Add `updateNowPlaying(visualName, filterName)` function that sets `#np-display` innerHTML
- Call it on: `visuals.notify()` hook, key presses (v/shift+v, 0-9), gallery card click
- `updateTrackTitle()` gets augmented to also drive the display

### 1b. Self-Avoiding Walk Branch Colors

**Problem:** `self_avoiding_walk_3d.js` draws all-black strokes on beige. User wants subtle branch colors from the blocks palette.

**Solution:** Color each path segment with a rotating hue from the existing blocks palette.

**Implementation in `self_avoiding_walk_3d.js`:**

1. Inline a compact palette reference — pick 6 colors from `blocks.js` `PALETTES[0]` that work on beige:
   ```js
   const BRANCH_COLORS = [
     [34, 75, 83],    // deep teal
     [160, 168, 176], // silver grey
     [175, 96, 117],  // dusty rose
     [221, 213, 214], // pale pink
     [232, 230, 227], // warm white
   ];
   ```
   (Hex values converted to [r, g, b] tuples for p5 `stroke()`.)

2. Give `Spot` an optional `color` field. When a spot is pushed onto `path`, assign the next color from the cycle: `branchColorIdx = (branchColorIdx + 1) % BRANCH_COLORS.length`.

3. In `draw()`, replace the single `stroke(0, 200)` before the segment loop with per-segment strokes:
   ```js
   for (let i = 0; i < path.length - 1; i++) {
     const v1 = path[i];
     const v2 = path[i + 1];
     const c = v2.color || BRANCH_COLORS[0];
     stroke(c[0], c[1], c[2], 180);
     line(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
   }
   ```

4. Keep the current-position point stroke as white/orange for visibility.

**Files:** `self_avoiding_walk_3d.js` (~15 lines changed)

### 1c. Gallery Real Previews (Capture-on-Activate)

**Problem:** Gallery cards show CSS-generated abstract patterns based on a hash — not actual rendered previews of the visual.

**Solution:** Capture a frame from each visual when it is first activated and store it as a data URL thumbnail. Gallery cards use the thumbnail when available; fall back to CSS art otherwise.

**`engine.js` changes:**
- Add a `_thumbnails` Map to the visuals module: `id → data URL string`
- After `activate()` starts a visual and the first render loop fires (`setTimeout 500ms`):
  1. Detect which canvas is visible (`#block-canvas:not([style*="display: none"])`, or `#overlay-canvas` if block is hidden, or `#gif-bg` as last resort)
  2. `canvas.toDataURL('image/jpeg', 0.3)` for a small thumbnail
  3. Store in `_thumbnails.set(id, dataUrl)`
- Add `getThumbnail(id)` method returning the data URL or null

**`gallery.js` changes:**
- In `buildGrid()`, after creating `.gallery-card-art`, check `visuals.getThumbnail(item.id)`
- If thumbnail exists: set `art.style.backgroundImage = 'url(...)'` with `background-size: cover`
- If not: keep the current `data-pattern` / `--card-hue` CSS art fallback
- Track label in gallery cards (`getTrackLabel()`) currently shows globally-playing track — this is fine for the gallery context

**CSS:** `.gallery-card-art` already has `position: absolute; inset: 0` — just ensure `background-size: cover` when using an image thumbnail.

**Files:** `engine.js` (+capture logic, ~20 lines), `gallery.js` (+thumbnail check, ~8 lines), `style.css` (minor)

---

## Phase 2: Rails Control Center

### Architecture

```
┌───────────────────────────────────────────────────┐
│                   Rails App (root)                  │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Admin pages  │  │ API endpoints│  │ Sidekiq   │  │
│  │ (views)      │  │ (JSON)       │  │ (jobs)    │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘  │
│         │                │                 │        │
│         └────────────────┼─────────────────┘        │
│                          │                          │
│                   ┌──────┴──────┐                   │
│                   │ PostgreSQL  │                   │
│                   │ (via App)   │                   │
│                   └─────────────┘                   │
│                          │                          │
│                    ┌─────┴─────┐                    │
│                    │ Sidekiq   │                    │
│                    │ shells to │                    │
│                    │ Python    │                    │
│                    └───────────┘                    │
└───────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐      ┌──────────────────┐
│ Python Pipeline  │      │ Static Player    │
│ (python/ dir)    │      │ (public/ dir)    │
│ generate.py      │      │ Fetches from API │
│ djmix.py         │      │ /api/playlist    │
│ announce.py      │      │ /api/shows       │
│ build_site.py    │      │ /api/now_playing │
└─────────────────┘      └──────────────────┘
```

### Directory Layout (Rails at Root)

```
/ (Rails root)
├── app/
│   ├── controllers/
│   │   ├── application_controller.rb
│   │   └── api/
│   │       ├── playlist_controller.rb      # /api/playlist
│   │       ├── shows_controller.rb         # /api/shows
│   │       ├── tracks_controller.rb        # /api/tracks/:id
│   │       ├── visuals_controller.rb       # /api/visuals
│   │       └── now_playing_controller.rb   # /api/now_playing
│   ├── controllers/admin/
│   │   ├── dashboard_controller.rb
│   │   ├── shows_controller.rb
│   │   ├── tracks_controller.rb
│   │   ├── visuals_controller.rb
│   │   └── generation_controller.rb
│   ├── models/
│   │   ├── show.rb
│   │   ├── track.rb
│   │   ├── visual_module.rb
│   │   └── generation_job.rb
│   └── jobs/
│       └── generate_show_job.rb
├── app/views/admin/
│   ├── dashboard/
│   │   └── index.html.erb
│   ├── shows/
│   │   ├── index.html.erb
│   │   └── show.html.erb
│   ├── tracks/
│   │   └── index.html.erb
│   ├── visuals/
│   │   └── index.html.erb
│   └── generation/
│       ├── new.html.erb
│       └── index.html.erb
├── config/
│   ├── routes.rb
│   ├── database.yml                      # PostgreSQL
│   └── initializers/
│       └── sidekiq.rb
├── db/
│   └── migrate/
│       ├── 001_create_shows.rb
│       ├── 002_create_tracks.rb
│       ├── 003_create_visual_modules.rb
│       └── 004_create_generation_jobs.rb
├── python/                               # Existing CLI scripts, moved here
│   ├── generate.py
│   ├── generate_station_ids.py
│   ├── djmix.py
│   ├── announce.py
│   ├── build_site.py
│   └── requirements.txt
├── public/                               # Player source, served by Rails
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── visuals/
├── prompts/                              # Seed LLM prompts
│   ├── producer.md
│   ├── dj.md
│   └── announcer.md
├── ACE-Step-1.5/                         # Vendored runtime
├── kokoro/                               # Vendored runtime
├── output/                               # Generated artifacts
├── docs/                                 # Documentation
├── AGENTS.md
├── CONCEPTS.md
├── TECH_SPEC.md                          # ← this document
└── README.md
```

### Rails Setup Strategy

`rails new .` refuses non-empty directories. Approach:

1. In `/tmp`, run `rails new dead-internet-radio --api --database=postgresql --skip-git --skip-action-mailbox --skip-action-mailer --skip-active-storage --skip-action-text`
2. Copy generated framework files into the repo root:
   - `app/`, `config/`, `db/`, `lib/`, `bin/`, `Gemfile`, `Rakefile`, `config.ru`
3. Merge `.gitignore` manually (append Rails defaults to existing repo ignores)
4. Will NOT overwrite existing files like `AGENTS.md`, `CONCEPTS.md`, `README.md`, Python scripts, `src/`, etc.
5. Run `bundle install`, `rails db:create`, `rails db:migrate`
6. Add `sidekiq` gem, configure

### Database Schema

#### `shows`

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| slot | string | The time/mood descriptor passed to generate.py |
| name | string | Generated show name (showName from generate.py) |
| dj_name | string | DJ character name |
| track_count | integer | Number of tracks generated |
| directory | string | Path to output/ subdirectory |
| mix_file | string | Path to mixed output MP3 |
| status | integer | enum: 0=draft, 1=generating, 2=complete, 3=failed |
| generated_at | timestamp | |
| created_at | timestamp | |
| updated_at | timestamp | |

#### `tracks`

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| show_id | bigint | FK → shows |
| position | integer | Track number within show |
| title | string | |
| artist | string | |
| caption | text | ACE-Step prompt |
| bpm | integer | |
| key | string | e.g. "A MIN" |
| duration_ms | integer | |
| audio_file | string | Path to generated MP3 |
| voiceover_file | string | Path to TTS voiceover |
| script | text | Generated DJ script |
| lyrics | text | |
| brief | text | |
| frequency_band | string | |
| modulation_type | string | |
| signal_path | string | |
| artwork_url | string | Optional custom artwork |

Indexes: `(show_id, position)` unique

#### `visual_modules`

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| slug | string | visual ID (e.g. "blocks", "self_avoiding_walk_3d") |
| name | string | Display name |
| thumbnail | text | data URL or file path |
| active | boolean | |
| created_at | timestamp | |

#### `generation_jobs`

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| slot | string | The input slot |
| track_count | integer | |
| status | integer | enum: 0=pending, 1=running, 2=done, 3=failed |
| output_log | text | stdout/stderr from Python |
| show_id | bigint | FK → shows (nullable, set on success) |
| started_at | timestamp | |
| completed_at | timestamp | |
| created_at | timestamp | |

### API Endpoints

#### Player-facing (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/now_playing` | Current visual, filter, track info |
| GET | `/api/v1/shows` | List all completed shows |
| GET | `/api/v1/shows/:id` | Show detail with tracks |
| GET | `/api/v1/tracks/:id` | Single track detail |
| GET | `/api/v1/visuals` | Visual modules switched on in the admin, with thumbnail URLs |
| GET | `/api/v1/playlist` | Full playlist JSON (replaces static file) |

#### Admin-facing (basic HTTP auth or session-based)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin` | Dashboard overview |
| GET | `/admin/shows` | List shows |
| GET | `/admin/shows/:id` | Show detail |
| POST | `/admin/generation` | Trigger new show generation |
| GET | `/admin/generation` | List generation jobs |
| GET | `/admin/generation/:id` | Job detail with log |
| GET | `/admin/visuals` | Manage visual modules |

### Player → API Integration

Player (`app.js`) currently fetches static JSON files:

```js
// Instead of fetchJson(base + 'playlist.json')
// Player calls:
const data = await fetchJson('/api/v1/playlist');
```

Required player changes:
1. `loadBroadcastData()` → try API first, fall back to static files for local dev
2. `loadShows()` → try `/api/v1/shows`, fall back to static files
3. Add `/api/v1/now_playing` → used for the synth-LED readout (Phase 1a)
4. `visuals.getList()` → when Rails serves visual data, thumbnail URLs come from `/api/v1/visuals`

### Background Jobs (Sidekiq)

```
GenerateShowJob
  ├── shells out: python3 python/generate.py "<slot>" --count <n>
  ├── parses output dir
  ├── shells out: python3 python/djmix.py output/<dir>
  ├── imports tracks into DB
  └── optional: python3 python/build_site.py --output public/
```

### Admin Dashboard Views

- **Dashboard** (`/admin`): Cards showing total shows, tracks, last generation, current state
- **Shows** (`/admin/shows`): Table with name, DJ, track count, generated_at, status badge, play button
- **Tracks** (`/admin/tracks`): Per-show track table with playback, metadata editing
- **Visuals** (`/admin/visuals`): Visual modules list with inline thumbnail previews
- **Generation** (`/admin/generation`): Form to trigger new generation + job history table

No authentication framework initially — deploy behind a VPN or use Rails `http_basic_authenticate_with` for simplicity.

---

## Implementation Order

```
Phase 1 (immediate, no Rails):
  1a. Synth LED readout    ─┐
  1b. SAW colors            ├─ all independent
  1c. Gallery previews     ─┘

Phase 2 (Rails):
  2a. Rails scaffold at root
  2b. Models + migrations
  2c. API controllers (player-facing)
  2d. Admin dashboard
  2e. Sidekiq + GenerateShowJob
  2f. Player API integration
  2g. Build pipeline (python/ → Rails task)
```
