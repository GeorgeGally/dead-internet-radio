---
title: Songs the station disliked kept airing in sets
date: 2026-11-13
category: docs/solutions/logic-errors
module: dead-internet-radio
problem_type: logic_error
component: rails
severity: high
applies_when:
  - A vetoed or disliked song still airs
  - Changing how votes, vetoes or retirement affect what plays
tags:
  - votes
  - veto
  - station-clock
  - library
---

# Songs the station disliked kept airing in sets

## Problem

The admin disliked songs from the public player, and they kept airing: one song
disliked on Nov 4 aired 57 times over the next nine days, in ten sets and its own show.

## Root cause

Two leaks:

1. **The player's votes are anonymous.** `/api/v1/songs/:id/vote` keys a vote
   on the `dir_voter` cookie, so the admin's thumbs there counted as one
   listener's (−1 on the score) and only `vetoed_at` kept a song out.
2. **The clock replays stored shows.** `Station.next_show_tracks` rotates whole
   completed shows and sets. Vetoes and votes only shaped `Library.pool`, the
   pool for *new* sets, so a song already in a set or its own show aired forever.

## Fix

- `tracks.station_vote` holds the admin's vote (voter `"admin"`). It counts
  `Track::STATION_WEIGHT` (3) listeners in `score` and `retired?`, and a −1 is
  a veto (`Track#vetoed?`, scope `not_vetoed`).
- Signed in to the admin, the browser's player votes go in as the station's,
  and `Vote.claim_for_station!` turns its earlier cookie votes into the
  station's on its next admin page.
- `Station.next_show_tracks` skips every song in `Track.kept_out` (vetoed,
  station-disliked, retired), and a show left with no song sits out.
- A station dislike or veto calls `Station.drop_upcoming`, which removes the
  song's bookings ahead (up to `STATION_HORIZON_HOURS`) and closes the gaps.

## Prevention

Anything that decides what airs reads `Track.kept_out` / `kept_out?`, not
`vetoed_at` alone. Covered by `test/services/station_dislike_test.rb`.
