---
title: Play the selected switch sample once per button activation
date: 2026-11-10
module: ui-deck
problem_type: integration_issue
tags: [audio, buttons, keyboard, event-propagation, static-build]
---

# Button activation samples

The Soft Sounds reference's switch A and D are audio variants, not different
button designs. The original CC0 samples are bundled in `public/sounds/`, with
their source URLs and license. The existing button appearance stays unchanged.

`public/button-sounds.js` listens for native `click` events in the capture phase.
This covers pointer, touch, Enter and Space activation without separate pointer
or keyboard handlers producing duplicate sounds. Capture also reaches buttons
such as About, whose action stops event propagation, and sees enabled buttons
before an action disables or removes them. Dynamically created buttons use the
same listener.

The main `.abtn` deck controls play `switch-1.mp3`. Other player buttons play
`switch-4.mp3`. Untrusted programmatic clicks, disabled controls and inert content
stay silent. The radio player's mute or zero volume also silences the samples.
Sample playback failures are caught independently of the button action; the
samples never use or pause the radio's media element or audio graph.

The player includes the script, and `_build_dist_static` copies both the script
and sounds directory into static builds. Keep both paths when changing packaging.

Run the focused regression check with `node --test tests/button_sounds_test.js`.
It covers the A/D mapping, pointer versus keyboard click counts, disabled and
programmatic activations, mute behavior and rejected or throwing playback.
Browser verification must use genuine input events: a script calling `.click()`
intentionally stays silent.
