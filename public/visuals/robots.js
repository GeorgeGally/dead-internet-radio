'use strict';

visuals.register('robots', createPrelingerBroll({
  id: 'robots',
  name: 'Robots',
  searches: {
    'robots-footage': '(title:(robot OR robots OR robotics OR "artificial intelligence" OR "electronic brain" OR "thinking machine" OR automaton) OR subject:(robot OR robots OR robotics OR "artificial intelligence" OR automata OR cybernetics)) AND date:[1900-01-01 TO 1999-12-31] AND item_size:[1000000 TO 90000000] AND NOT subject:"copyright blocked" AND NOT colorized',
    'robots-films': '(collection:movie_trailers OR collection:sciencefiction OR collection:feature_films OR collection:prelinger OR collection:classic_tv) AND (robot OR robots OR "artificial intelligence" OR "electronic brain" OR "thinking machine" OR android OR androids OR cyborg OR cyborgs) AND date:[1900-01-01 TO 1999-12-31] AND item_size:[1000000 TO 90000000] AND NOT subject:"copyright blocked" AND NOT colorized',
  },
}));
