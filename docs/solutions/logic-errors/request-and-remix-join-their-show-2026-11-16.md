---
title: Requests and remixes join the show they belong to
date: 2026-11-16
category: docs/solutions/logic-errors
module: dead-internet-radio
problem_type: logic_error
component: request-line
tags:
  - requests
  - remix
  - shows
---

## Problem

Every listener request and every remix stood in the admin as its own one-song
show (`output/request-line-<stamp>/`, `output/remix-<stamp>/`).

The importer's unit is a rendered folder, and each request or remix renders into
a folder of its own. That was fine when requests waited in the library for a
set (`02f1121`): the set's copy of the song was what aired. Once apps1 stopped
building sets (`5329384`), a request went on air right after the current song
but stayed in its one-song show. Remixes (`0f9ed3a`) used the same import.

## What holds now

- The folder is still imported first. `SongHome` then moves the song into the
  show it belongs to and drops the empty one-song show. The song keeps its id,
  so its request link, votes, plays and bookings stay with it.
- A request joins the show on air at its booked time, after the song it follows.
  Between shows it opens the next show. With neither, it stays where it was
  rendered.
- A remix joins its original song's show as a take (`tracks.take`), after the
  running order. `Track.running` is the running order: the station clock, the
  API and the admin show page read that, so a take never airs as the next song.
  The job names its take in `options.take_track_id`.
- The audio stays in the folder it was rendered into: `tracks.folder` overrides
  the show's directory in `Track#audio_path`. Nothing is copied or moved on
  disk, so djmix and build_site never see a joined song in the show's folder.
  `ReimportShowJob` matches the folder's songs to the show's own tracks
  (`folder IS NULL`) for the same reason.
- Old one-song shows: `bin/rails requests:fold_shows` is a dry run that prints
  where each song would go. `APPLY=1` applies it.

## Gotcha

`Show has_many :tracks, dependent: :destroy`. Destroying the emptied show
through an object whose `tracks` were preloaded destroys the song that just
left it. Find the show again before destroying it.
