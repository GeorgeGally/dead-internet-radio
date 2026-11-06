---
title: A sign-flip bounce pins the ball to any wall it starts inside
date: 2026-11-06
category: docs/solutions/logic-errors
module: visuals
problem_type: logic_error
component: frontend
tags: [visuals, p5, bouncy, resize]
---

# A sign-flip bounce pins the ball to any wall it starts inside

Bouncy sometimes drew only a narrow strip along the left or top edge of the screen: about 1 start in 9 at 1728x1117 and 1 in 4 on a phone.

**Cause:** the ball spawned anywhere from `0`, but the wall sat at `sz / 2`, and the bounce was `if (x < sz / 2) speedx *= -1`. Starting inside that margin, the test held on every frame, so the direction flipped every frame and the ball shook in place while the other axis kept moving. Shrinking the window pinned it the same way at the far walls.

**Fix:** aim away from the wall (`speedx = Math.abs(speedx)`) rather than flipping, and spawn inside the walls.

Bouncy's trail layer was also fixed to the window size at startup, so a window that grew afterwards stretched the art and left the new space undrawn. It now rebuilds on resize. `tests/bouncy_test.js` covers the spawn and resize cases.

To reproduce a random spawn in the browser, return a low `Math.random` only when `new Error().stack` includes the visual's file. Wait for the startup thumbnail prewarm to end first, because it stops whatever is playing.
