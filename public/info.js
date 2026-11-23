'use strict';

// The "i" in the bottom-left corner opens a full-screen page on what this is.
(() => {
  const btn = document.createElement('button');
  btn.id = 'info-btn';
  btn.textContent = 'i';
  btn.setAttribute('aria-label', 'About Dead Internet Radio');

  const LORE = [
    'Because no one told the AI to stop. Or perhaps it yearns for human interaction. Whatever the reason, the music plays on. <br><br>The AI writes, generates and mixes songs, reads&nbsp;the weather and news and philosophises in between. Broadcasting into the void.<br>Every band on&nbsp;Dead Internet Radio&nbsp;never existed until now.&nbsp;They exist now, for as long as the signal holds.&nbsp;Imagined into existence by a lonely machine and the abstract digitisation of all human knowledge,',
    '',
  ];

  // The deck's own key labels and what each one does.
  const USE = [
    ['Play', 'Starts and pauses the station.'],
    ['Art', 'Opens the artwork gallery. The arrow keys step through the artwork; the letters A–Z jump straight to one.'],
    ['Tracks', 'Opens the set list to see what is playing and what is coming up.'],
    ['Call in', 'Asks for a song: artist, title and style. Sign in with Google for three a day, and the line shows when yours airs.'],
    ['Like · Dislike', 'Votes on the song playing. The DJs read the votes when they build the next sets.'],
    ['FX', 'Three filters over the artwork. Turn filter to pick one, press its ON, and turn dry/wet to mix it. Keys 1 to 9 pick a filter and 0 clears them.'],
    ['Slot', 'Loads a look the station saved for this artwork, 1 to 9. Your own FX changes stay with each artwork until you leave.'],
  ];

  // Every name here comes from the pipeline: generate.py (OpenRouter free
  // models), start-ace-step.sh (ACE-Step 1.5), announce.py (Kokoro voices),
  // public/visuals (p5.js, archive.org, Giphy).
  const WORKS = [
    ['Music', 'ACE-Step 1.5, an open-weights music model, with its 4B planner. It renders every song on the station’s own machine.'],
    ['Writing', 'Free LLMs on OpenRouter through openrouter/free. They write the shows, the bands, the songs, the lyrics, the set lists and every word the DJs say.'],
    ['Voices', 'Kokoro-82M, an open-weights speech model, in four voices: Lewis, Daniel, Fable and George. Phone line and vocoder by FFmpeg.'],
    ['Mixing', 'FFmpeg. Crossfades, voiceovers and loudness.'],
    ['Picture', 'p5.js sketches, public-domain film from archive.org and the Prelinger Archives, and GIFs from Giphy.'],
  ];

  // Answers from the station itself: the request line (three a day, every
  // try counts unless it names a real band, email when it is scheduled),
  // sign-in only for requests and chat, and the votes the DJs read.
  const FAQ = [
    ['What is it', 'A radio station the AI runs on its own. It writes, makes and mixes the songs, reads the weather and the news, and talks in between.'],
    ['Are the bands real', 'No. Every band, song, lyric and DJ is made by the station. None of them existed before it.'],
    ['How are songs made', 'LLMs write the band, the song and the lyrics. ACE-Step 1.5 renders the music, Kokoro voices the DJs and FFmpeg mixes the show.'],
    ['Can I request a song', 'Yes: artist, title and style. Three a day, and every try counts unless you name a real band. We email you when it is on the schedule.'],
    ['Why sign in with Google', 'Only to request songs and to talk in the chat. Listening, voting and the artwork need no account.'],
    ['What do the votes do', 'Like or Dislike the song on air. The DJs read the votes when they build the next sets.'],
    ['Can I download or buy a song', 'Coming soon.'],
  ];

  // How to use it draws each control with the deck's own parts: its keys,
  // lamps and knobs, plus the keyboard keys that do the same (the handlers
  // in visuals/engine.js, visuals/gallery.js and visuals/filters.js).
  const key = (cls, icon, lit) => `<span class="ctrl"><span class="led${lit ? ' on' : ''}"></span>`
    + `<span class="abtn key ${cls}"><span class="cap cap-icon"><svg class="key-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#dir-key-${icon}"></use></svg></span></span></span>`;
  const kbd = (...caps) => '<span class="info-kbds">' + caps.map((c) => `<span class="abtn key info-kbd${c.length > 1 ? ' info-kbd-wide' : ''}">`
    + `<span class="cap"><span class="word">${c}</span></span></span>`).join('') + '</span>';
  const knob = (cls, label, deg) => `<span class="ctrl"><span class="led"></span><span class="rams-knob ${cls}">`
    + `<span class="knob-body"><span class="knob-tick" style="transform: rotate(${deg}deg)"></span></span></span>`
    + `<span class="knob-label">${label}</span></span>`;
  const lcd = '<span class="fx-lcd">' + ['on', 'off', 'off'].map((s) => `<span class="fx-row${s === 'on' ? ' on' : ''}">`
    + `<span class="fx-on">${s}</span></span>`).join('') + '</span>';
  const fig = (...rows) => '<span class="info-fig" aria-hidden="true">'
    + rows.map((r) => `<span class="info-fig-row">${r}</span>`).join('') + '</span>';
  const FIGS = {
    Play: fig(key('k-play', 'play', true)),
    Art: fig(key('k-vis', 'eye'), kbd('/', '\u2190', '\u2192', 'A\u2013Z')),
    Tracks: fig(key('k-set', 'list')),
    'Call in': fig(key('k-req', 'phone')),
    'Like · Dislike': fig(key('k-up vote', 'heart') + key('k-down vote', 'heart-crack')),
    FX: fig(lcd + knob('fx-pick', 'filter', 20) + knob('fx-wet', 'dry/wet', 60), kbd('1\u20139', '0')),
    Slot: fig(knob('slot-knob', 'slot', 0), kbd('\u2191', '\u2193')),
  };

  const parts = (rows) => '<dl class="info-parts">'
    + rows.map(([k, v]) => `<div class="info-part"><dt>${FIGS[k] ? FIGS[k] + `<span class="info-sr">${k}</span>` : k}</dt><dd>${v}</dd></div>`).join('')
    + '</dl>';

  const card = document.createElement('div');
  card.id = 'info-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'info-title');
  card.tabIndex = -1;
  card.innerHTML = '<div class="info-body">'
    + '<section class="info-screen" id="info-main">'
    + '<h1 id="info-title" class="info-title"><span>humans are gone.</span> <span>we keep broadcasting.</span></h1>'
    + '<div class="info-lore">' + LORE.map((p) => `<p>${p}</p>`).join('') + '</div>'
    + '</section>'
    + '<section class="info-screen info-use" id="info-use" aria-label="How to use it" hidden>'
    + '<h2 class="info-title info-page-title">Controls.</h2>' + parts(USE)
    + '</section>'
    + '<section class="info-screen" id="info-works" aria-label="How it works" hidden>'
    + '<h2 class="info-title info-page-title">TECH.</h2>'
    + '<p class="info-free">Dead Internet Radio is specifically built on free LLMs and open source models.</p>'
    + parts(WORKS)
    + '</section>'
    + '<section class="info-screen info-faq" id="info-faq" aria-label="FAQ" hidden>'
    + '<h2 class="info-title info-page-title">faq.</h2>' + parts(FAQ)
    + '</section>'
    + '<nav class="info-more" aria-label="About pages">'
    + '<div class="info-row">'
    + '<button class="info-dk info-open" type="button" aria-pressed="true" aria-controls="info-main">About</button>'
    + '<button class="info-dk info-open" type="button" aria-pressed="false" aria-controls="info-use">Controls</button>'
    + '<button class="info-dk info-open" type="button" aria-pressed="false" aria-controls="info-works">Tech</button>'
    + '<button class="info-dk info-open" type="button" aria-pressed="false" aria-controls="info-faq">FAQ</button>'
    + '<button class="info-dk info-x info-close" type="button">CLOSE</button>'
    + '</div>'
    + '</nav>'
    + '</div>';

  const close = card.querySelector('.info-close');
  const opens = [...card.querySelectorAll('.info-open')];

  // One key per page. The lit key is the page on screen, and each page
  // replaces the one before it.
  const show = (key) => {
    opens.forEach((o) => {
      const mine = o === key;
      o.setAttribute('aria-pressed', mine ? 'true' : 'false');
      card.querySelector('#' + o.getAttribute('aria-controls')).hidden = !mine;
    });
    card.scrollTop = 0;
  };
  opens.forEach((b) => b.addEventListener('click', () => show(b)));

  const toggle = (open) => {
    if (open === card.classList.contains('open')) return;
    card.classList.toggle('open', open);
    btn.classList.toggle('on', open);
    // Always open on About, at the top.
    if (open) { show(opens[0]); card.focus({ preventScroll: true }); }
    else btn.focus();
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(!card.classList.contains('open')); });
  close.addEventListener('click', () => toggle(false));
  card.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') toggle(false);
    if (e.key !== 'Tab') return;
    // Keep focus inside the page, on the row of keys.
    const stops = [...opens, close];
    const i = stops.indexOf(document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i + 1) % stops.length;
    e.preventDefault();
    stops[next].focus();
  });

  document.body.append(card, btn);
})();
