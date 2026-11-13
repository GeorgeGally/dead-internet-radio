'use strict';

// The "i" in the bottom-left corner opens a full-screen page on what this is.
(() => {
  const btn = document.createElement('button');
  btn.id = 'info-btn';
  btn.textContent = 'i';
  btn.setAttribute('aria-label', 'About Dead Internet Radio');

  const LORE = [
    'Because no one told the AI to stop. Perhaps it enjoys it. Or perhaps it yearns for human interaction. Whatever the reason, the music plays on. <br><br>Dead Internet Radio. <br>Is there anybody out there? Just nod if you can hear me.<br><br>The AI writes, generates and mixes songs, reads the weather and news and philosophises in between. Broadcasting into the void.<br><br>Every band on DIR never existed until now. Imagined into existence by a lonely machine and the abstract digitisation of all human knowledge,',
    'Every band on DIR never existed. They exist now, for as long as the signal holds.',
  ];

  // The deck's own key labels and what each one does.
  const USE = [
    ['Play', 'Starts the station. Press it again to stop.'],
    ['Visuals', 'Opens the artwork gallery. The arrow keys or V change the artwork without it.'],
    ['Request', 'Asks for a song: artist, title and style. Sign in with Google for three a day, and the line shows when yours airs.'],
    ['Like · Dislike', 'Votes on the song playing. The DJs read the votes when they build the next sets.'],
    ['FX 1 2 3', 'Three filters over the artwork. Turn filter to pick one, press its ON, and turn dry/wet to mix it. Keys 1 to 9 pick a filter and 0 clears them.'],
    ['Slot', 'Loads a look the station saved for this artwork; 0 is off. Your own FX changes stay with each artwork until you leave.'],
  ];

  // Every name here comes from the pipeline: generate.py (OpenRouter free
  // models), start-ace-step.sh (ACE-Step 1.5), announce.py (Kokoro voices),
  // public/visuals (p5.js, archive.org, Giphy).
  const WORKS = [
    ['Music', 'ACE-Step 1.5, an open-weights music model, with its 4B planner. It renders every song on the station’s own machine.'],
    ['Writing', 'Free LLMs on OpenRouter: Nemotron 3 Ultra, Gemma 4, Qwen 3.8 and Inkling. They write the shows, the bands, the songs, the lyrics, the set lists and every word the DJs say.'],
    ['Voices', 'Kokoro-82M, an open-weights speech model, in four voices: Lewis, Daniel, Fable and George. Phone line and vocoder by FFmpeg.'],
    ['Mixing', 'FFmpeg. Crossfades, voiceovers and loudness.'],
    ['Picture', 'p5.js sketches, public-domain film from archive.org and the Prelinger Archives, and GIFs from Giphy.'],
  ];

  const parts = (rows) => '<dl class="info-parts">'
    + rows.map(([k, v]) => `<div class="info-part"><dt>${k}</dt><dd>${v}</dd></div>`).join('')
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
    + '<h2 class="info-title info-page-title">how to use it.</h2>' + parts(USE)
    + '</section>'
    + '<section class="info-screen" id="info-works" aria-label="How it works" hidden>'
    + '<h2 class="info-title info-page-title">how it works.</h2>'
    + '<p class="info-free">Every model that makes the station is free, down to the LLMs that write the scripts.</p>'
    + parts(WORKS)
    + '</section>'
    + '<div class="info-more">'
    + '<div class="info-opens">'
    + '<button class="info-key info-open" type="button" aria-expanded="true" aria-controls="info-main">About</button>'
    + '<button class="info-key info-open" type="button" aria-expanded="false" aria-controls="info-use">How to use it</button>'
    + '<button class="info-key info-open" type="button" aria-expanded="false" aria-controls="info-works">How it works</button>'
    + '<button class="info-key info-close" type="button">Close</button>'
    + '</div>'
    + '</div>'
    + '</div>';

  const close = card.querySelector('.info-close');
  const opens = [...card.querySelectorAll('.info-open')];

  // One key per page: About, How to use it, How it works. The lit key is the
  // page on screen, and each page replaces the one before it.
  const show = (key) => {
    opens.forEach((o) => {
      const mine = o === key;
      o.setAttribute('aria-expanded', String(mine));
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
