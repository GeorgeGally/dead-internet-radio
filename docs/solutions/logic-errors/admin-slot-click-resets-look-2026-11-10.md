---
module: admin-visuals
tags: [looks, slots, preview, destructive-actions]
problem_type: logic-errors
---

# Admin slot clicks must preview the saved look

The numbered buttons on `/admin/visuals` were introduced in `219c72c` as reset
controls. Their delegated click handler confirmed Reset, sent DELETE to
`/api/v1/looks/:artwork/:slot`, then removed the button. There was no preview
branch. Accepting the dialog deleted the saved look; cancelling it masked the
problem. The player already had a working `selectSlot` / `loadSlot` path.

The numbered button now opens a modal containing that artwork and slot. Reset
slot is a separate action inside the modal and keeps the existing confirmation
and DELETE endpoint. Server-rendered and imported buttons use the same preview
handler. Closing unloads the frame and restores focus.

The iframe uses the public player with `?preview=<artwork>&slot=<number>`, takes
the read-only startup branch, and applies the exact server look through the
existing slot loader. It does not start broadcast playback, rotate artworks,
cache looks, or migrate old browser presets. Missing looks fail visibly rather
than silently falling back to a different saved slot.

Regression coverage is in `tests/visual_toggles_test.js` and
`tests/looks_sync_test.js`. It checks preview without DELETE or confirmation,
selected-slot reset, reset cancellation/failure, exact artwork/filter/dial
restoration, read-only loading, and preview startup before broadcast setup.
