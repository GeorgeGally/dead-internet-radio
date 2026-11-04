---
module: player
tags: [looks, presets, localstorage, json, rails-params]
problem_type: integration-issues
---

# Saved looks live on the server

Slot looks used to live in each browser's `visual-slot-presets`, so nothing an
admin saved reached other listeners. They now live in `visual_looks`, served by
`GET /api/v1/looks`. Only an admin session can write.

- localStorage is per address. Old looks only upload from the address they were
  saved on, by a browser signed in at `/admin/login` on that same address.
- Uploading from localhost goes to the local database, not the station's. To
  carry looks across, copy the box on `localhost:3000/admin/visuals` and paste it
  into Import looks on the live admin.
- `visual-looks-cache` is the offline copy. `visual-slot-presets` is never
  overwritten: it moves to `visual-slot-presets-sent` once uploaded.
- Read look bodies from `request.raw_post`. Rails strips nulls from JSON arrays
  in `params`, which would shift an empty filter row `[null, false, 0.5, 0.5]`.
