'use strict';

visuals.register('space', createPrelingerBroll({
  id: 'space',
  name: 'Space',
  // About 260 of the films these searches find have an mp4 the player opens.
  recent: 100,
  searches: {
    'space-footage': '(title:(rocket OR rockets OR apollo OR astronaut OR astronauts OR sputnik OR telstar OR "space shuttle" OR "moon landing" OR lunar OR spacecraft OR planets OR "outer space") OR subject:(nasa OR "space exploration" OR "space flight" OR spaceflight OR astronauts OR "artificial satellites")) AND date:[1900-01-01 TO 1999-12-31] AND item_size:[1000000 TO 90000000] AND NOT subject:"copyright blocked" AND NOT colorized AND NOT collection:computercommercials',
    'space-films': '(collection:prelinger OR collection:universal_newsreels OR collection:classic_tv OR collection:sciencefiction OR collection:feature_films) AND (rocket OR rockets OR astronaut OR astronauts OR satellite OR "outer space" OR "space travel" OR "space race" OR spaceship OR lunar OR apollo OR sputnik OR planets OR "to the moon") AND date:[1900-01-01 TO 1999-12-31] AND item_size:[1000000 TO 90000000] AND NOT subject:"copyright blocked" AND NOT colorized',
  },
}));
