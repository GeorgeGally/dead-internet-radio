'use strict';

visuals.register('computers', createPrelingerBroll({
  id: 'computers',
  name: 'Mainframe',
  // About 330 of the films these searches find have an mp4 the player opens.
  recent: 100,
  searches: {
    'computers-footage': '(title:(computer OR computers OR computing OR mainframe OR modem OR "punch card" OR "data processing" OR "electronic brain" OR teletype OR univac OR eniac OR ibm OR programmer OR programmers) OR subject:(computer OR computers OR computing OR "data processing" OR mainframe OR univac OR ibm)) AND date:[1900-01-01 TO 1999-12-31] AND item_size:[1000000 TO 90000000] AND NOT subject:"copyright blocked" AND NOT colorized AND NOT collection:computercommercials',
    'computers-films': '(collection:prelinger OR collection:classic_tv OR collection:feature_films OR collection:movie_trailers OR collection:sciencefiction) AND (computer OR computers OR mainframe OR terminal OR modem OR hackers OR "electronic brain" OR "punch card" OR teletype OR univac) AND date:[1900-01-01 TO 1999-12-31] AND item_size:[1000000 TO 90000000] AND NOT subject:"copyright blocked" AND NOT colorized AND NOT collection:computercommercials',
  },
}));
