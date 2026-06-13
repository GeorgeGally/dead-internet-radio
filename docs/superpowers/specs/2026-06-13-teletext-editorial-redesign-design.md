# Dead Internet Radio Teletext Editorial Redesign

**Date:** 2026-06-13  
**Status:** Approved design  
**Primary reference:** Teletext Hotline advertisement

## Objective

Redesign the listener-facing site in `src/` as a confident teletext broadcast rather than a narrow terminal simulation.

The interface must preserve the existing synchronized audio, page cycle, page content, and navigation behavior. The redesign changes presentation and page composition, not the broadcast model.

## Visual Thesis

Dead Internet Radio is a full-screen teletext service from after the end of the internet: hard-edged, information-dense, colorful, and editorially composed.

The primary reference is the Teletext Hotline image. The design should inherit its qualities rather than copy its specific content:

- oversized bitmap typography
- a dominant cropped mosaic illustration
- dense but deliberate information hierarchy
- solid color bars and blue structural rules
- uneven, purposeful color emphasis
- page-specific compositions

The result must not look like a centered command-line window, a modern dashboard wearing a bitmap font, or a simulated CRT.

## Broadcast Frame

The broadcast is a responsive 4:3 frame centered within a black browser viewport.

- The frame grows to the largest 4:3 rectangle that fits the available viewport.
- All visual content is clipped to the frame.
- The frame has no casing, border radius, glow, shadow, scanline overlay, glass effect, or ornamental browser chrome.
- On small screens, the complete frame scales down as one unit rather than reflowing into a conventional mobile page.

An invisible 40-column by 25-row grid controls placement. A cell is a layout unit, not a restriction to one text character. Headings, rules, and mosaics may span multiple cells.

## Shared Visual System

### Palette

Use only the established teletext palette:

- black `#000000`
- white `#ffffff`
- cyan `#00ffff`
- yellow `#ffff00`
- green `#00ff00`
- red `#ff0000`
- magenta `#ff00ff`
- blue `#0000ff`

No gradients, transparency, blur, or intermediate colors are permitted.

### Typography

Use the bundled VT100 bitmap font for all text. Remove the Google Fonts dependency.

The type system has three scales:

1. Service text: page number, clock, navigation, metadata.
2. Editorial text: headlines, story copy, advertisement copy.
3. Display text: multi-cell station names, mastheads, prices, destinations, and calls to action.

Display type should be substantially larger than body text. Hierarchy must come from scale, placement, color, and rules rather than from boxes or card treatments.

### Service Header

Every page begins with a compact one-row service header containing:

- page number
- `DEAD INTERNET RADIO`
- current local time

It remains readable but subordinate to the page's main composition.

### Service Footer

Every page ends with a narrow navigation row containing previous and next controls. It uses teletext color inversion on hover and keyboard focus.

The footer is always available but must not become a large cyan banner competing with the content.

### Structural Devices

Use solid bars and horizontal blue rules to establish hierarchy. The existing three-row `▄` and `▀` bands should not be repeated around every heading. They may be retained selectively where a page benefits from an authentic teletext band.

Do not use cards, rounded panels, shadows, outlines around every region, or decorative interface icons.

## Page Compositions

### P100: Now Playing

P100 is the principal station identity screen.

- The left side contains an oversized `DEAD INTERNET RADIO` wordmark, current track title, BPM, key, frequency, and broadcast count.
- The station wordmark is the largest text on the page.
- A cyan satellite-dish mosaic dominates the right side and may crop against the top, right, or bottom edge.
- The illustration must be recognizably designed rather than a filled oval with a stem.
- `TRANSMITTING` appears as a strong green state label with a stepped blinking marker.
- Yellow is reserved for the current track title.
- Blue rules separate major information groups.
- Metadata should scan quickly and should not be centered.

P100 updates live track data without recreating the complete page unless the track changes.

### P101: Headlines

P101 is a dense type-led bulletin.

- A large yellow `HEADLINES` masthead anchors the page.
- Four or five stories are numbered or marked consistently.
- Stories use concise multi-line blocks rather than a loose vertical list.
- Blue rules divide major groups.
- Magenta, cyan, green, or red may emphasize selected labels or phrases, but body copy remains primarily white.
- The page should not force an illustration into the composition. An illustration is allowed only when the generated content leaves a deliberate area for one.
- `FOR FULL STORIES SEE P110` remains as a small service footer line.

### P102: Illustration-Led Advertisement

P102 uses a large bespoke mosaic as its primary visual anchor.

- The illustration occupies roughly 40 to 55 percent of the usable page.
- Sales copy is short and arranged in a strong complementary column.
- The ad has one dominant call to action, number, price, or destination.
- Its composition should evoke a real teletext commercial page rather than a reusable site template.

### P103: Type-Led Advertisement

P103 uses typography as the illustration.

- A price, telephone number, destination, or offer becomes the largest element.
- Supporting copy uses contrasting color groups and blue separators.
- The page remains dense but has one unmistakable reading order.
- No mosaic is required.

### P104: Classified Advertisement

P104 combines modular classified copy with a smaller mosaic.

- Copy groups may occupy distinct grid regions without becoming bordered cards.
- A smaller illustration or symbol balances the page.
- Phone number, operating hours, warning, and offer details receive differentiated color treatment.
- The layout must remain visibly different from P102 and P103.

### P105: Signal

P105 is a full-field signal texture.

- `ARE YOU A ROBOT` repeats across the available field.
- The text fills the page without an introductory content band.
- Selected phrases change color or span larger cell modules to create controlled interference.
- The pattern remains aligned to the grid and readable.
- The shared service header and footer remain present.

## Page Data And Rendering

The existing `playlist.json` and `pages.json` contracts remain unchanged.

Rendering stays in vanilla JavaScript. Each page renderer should create page-specific semantic regions rather than a sequence of generic `.row` elements. Shared helpers are appropriate for the service header, footer, rules, metadata, and mosaic cells.

Advertisement data remains generated at build time. The three fixed ad page types determine composition; generated content fills those known regions. Long content must be clipped or wrapped to explicit line limits so it cannot break the 4:3 layout.

## Interaction And Motion

- Pages auto-cycle every eight seconds.
- Left and right arrow keys navigate.
- Footer controls navigate by click or tap.
- Manual navigation resets the cycle timer.
- Page changes use a brief teletext redraw: a blank frame or stepped block wipe.
- Do not use smooth fades, slides, easing-heavy transitions, or parallax.
- The transmitting marker blinks at a one-second stepped rhythm.
- Hover and focus invert the footer control colors.
- Keyboard focus must remain visible.
- The first click or keypress may start audio when autoplay is blocked; no modal or overlay is introduced.
- `prefers-reduced-motion` disables redraw animation and blinking.

## Error State

Failure to load playlist or page data renders an intentional in-frame red system message. It must identify that broadcast data could not be loaded and retain the service frame instead of exposing raw browser text.

## Accessibility

- Navigation controls remain real interactive elements.
- All controls have visible focus states.
- Color is not the sole indication of control state.
- Text must remain legible at the smallest supported frame size.
- Decorative mosaics are hidden from assistive technology.
- Reduced-motion preferences are respected.

## Implementation Boundaries

The redesign may modify:

- `src/index.html`
- `src/style.css`
- `src/app.js`

It must preserve:

- epoch-based synchronized playback
- autoplay fallback behavior
- page order and eight-second cycle
- keyboard and pointer navigation
- existing playlist and generated page JSON formats
- the strict eight-color palette

It must not add:

- a frontend framework or bundler
- a CRT enclosure or visual effects layer
- track selection, seeking, or archive browsing
- new runtime network dependencies

## Verification

Implementation is complete when:

1. The broadcast renders as a centered, viewport-fitted 4:3 frame.
2. P100 clearly resembles a composed teletext advertisement, with a dominant cropped satellite mosaic and strong station typography.
3. P101, P102, P103, P104, and P105 have visibly distinct editorial layouts.
4. Every element aligns to the underlying 40 by 25 grid.
5. Only the eight approved colors appear in computed styles.
6. Page cycling, keyboard navigation, pointer navigation, clock updates, track changes, and autoplay fallback still work.
7. The site remains usable at common desktop and mobile viewport sizes.
8. Reduced-motion mode removes blinking and redraw animation.
9. Load failures produce the designed red system state.
10. Browser screenshots confirm that the first viewport reads as a broadcast composition, not a centered text column.
