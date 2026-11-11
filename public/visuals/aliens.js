'use strict';

visuals.register('aliens', createPrelingerBroll({
  id: 'aliens',
  name: 'Aliens',
  searches: {
    'aliens-sightings': '(title:(ufo OR ufos OR "flying saucer" OR "flying saucers" OR "unidentified flying") OR subject:(ufo OR ufos OR "flying saucers" OR "unidentified flying objects")) AND date:[1900-01-01 TO 1999-12-31] AND item_size:[1000000 TO 90000000] AND NOT subject:"copyright blocked"',
    'aliens-films': '(collection:movie_trailers OR collection:sciencefiction OR collection:feature_films OR collection:prelinger OR collection:classic_tv) AND (ufo OR "flying saucer" OR "flying saucers" OR alien OR aliens OR martian OR martians OR "outer space" OR invaders OR spaceship) AND date:[1900-01-01 TO 1989-12-31] AND item_size:[1000000 TO 90000000] AND NOT subject:"copyright blocked"',
  },
}));
