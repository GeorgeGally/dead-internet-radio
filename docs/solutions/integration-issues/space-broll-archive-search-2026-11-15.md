---
title: Space B-roll searches archive.org for rockets, the moon landing and planets
date: 2026-11-15
category: integration-issues
module: web_player_visuals
problem_type: integration_issue
component: space
tags: [broll, archive.org, space, nasa, apollo, rockets, footage, drawer]
---

# Space B-roll searches archive.org for rockets, the moon landing and planets

`space.js` (shown as Space) is a fifth artwork built on `createPrelingerBroll`,
after Aliens, Robots and Mainframe. It passes two archive.org `searches` and
keeps the last 100 films shown (`recent: 100`).

| Search | Finds |
| --- | --- |
| `space-footage` | Titles naming rockets, Apollo, astronauts, Sputnik, Telstar, the space shuttle, the moon landing, lunar, spacecraft, planets or outer space, or subjects naming NASA, space exploration, space flight, astronauts or artificial satellites, 1900 to 1999 |
| `space-films` | Prelinger, Universal newsreels, classic TV, sci-fi and features naming rockets, astronauts, satellites, outer space, space travel, the space race, spaceships, lunar, Apollo, Sputnik, planets or "to the moon", 1900 to 1999 |

What the searches leave out, and why:

- `collection:nasa` as a whole: about 6,000 items, mostly Earth-science
  visualisations (hurricanes, ozone, glaciers). The NASA items worth showing
  (Apollo clips from the Image Exchange, Marshall launches and engine tests,
  Voyager and lunar flybys) already match by title or subject.
- The bare word `moon` in the films search: it pulls in Paper Moon, Bloody
  Moon and Full Moon in Paris.
- The word `satellite` in titles: it matches satellite TV feeds.
  `subject:"artificial satellites"` finds the real ones.
- `title:(mercury OR gemini)`: car adverts.
- `collection:computercommercials` (as in Mainframe): Samsung boot screens and
  video game adverts.

Both keep the size limit, skip copyright-blocked and colorized items, and stay
under the 500-character limit in `BrollIndexController` once
`AND mediatype:movies` is added (475 and 471).

Measured on 2026-11-15: 226 and 60 matches, of which 211 and 56 had an mp4 the
player opens (45 MB or less). Examples: Apollo 8 to 17 clips, Apollo 11 launch,
1959 Lunik newsreel, Chimp into space (1961), Thor launching a Courier
satellite, Voyager 2 at Saturn, Uranus and Neptune, Moonwalk: As It Happened
(1989), The Phantom Rocket (1933). Some results are off-theme: WWII rocket
launchers and sci-fi trailers.

The drawer thumbnail is a frame from the Thor/Courier launch newsreel (CEP435).

`node --test tests/video_reel_test.js tests/drawer_playing_outline_test.js tests/visuals_filter_contract_test.js`
covers the searches, no fallback footage, the filters and the drawer tile.
