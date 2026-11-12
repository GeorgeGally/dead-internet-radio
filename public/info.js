'use strict';

// The "i" in the bottom-left corner opens a full-screen page on what this is.
(() => {
  const btn = document.createElement('button');
  btn.id = 'info-btn';
  btn.textContent = 'i';
  btn.setAttribute('aria-label', 'About Dead Internet Radio');

  // Every name here comes from the pipeline: generate.py (OpenRouter free
  // models), start-ace-step.sh (ACE-Step 1.5), announce.py (Kokoro voices),
  // public/visuals (p5.js, archive.org, Giphy).
  const PARTS = [
    ['Music', 'ACE-Step 1.5, an open-weights music model, with its 4B planner. It renders every song on the station’s own machine.'],
    ['Writing', 'Free LLMs on OpenRouter: Nemotron 3 Ultra, Gemma 4, Qwen 3.8 and Inkling. They write the shows, the bands, the songs, the lyrics, the set lists and every word the DJs say.'],
    ['Voices', 'Kokoro-82M, an open-weights speech model, in four voices: Lewis, Daniel, Fable and George. Phone line and vocoder by FFmpeg.'],
    ['Mixing', 'FFmpeg. Crossfades, voiceovers and loudness.'],
    ['Picture', 'p5.js sketches, public-domain film from archive.org and the Prelinger Archives, and GIFs from Giphy.'],
  ];

  const card = document.createElement('div');
  card.id = 'info-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'info-title');
  card.tabIndex = -1;
  card.innerHTML = '<div class="info-top"><button class="info-close" type="button">Close</button></div>'
    + '<div class="info-body">'
    + '<section class="info-lore">'
    + '<h1 id="info-title" class="info-title">The world ended. The radio stayed on.</h1>'
    + '<p>Dead Internet Radio is the last station still on the air. Nobody runs it. Machines write the songs, sing them, mix them and read the weather between them.</p>'
    + '<p>Every band on DIR never existed. They exist now, for as long as the signal holds.</p>'
    + '<p>It broadcasts into the void, for whoever is still out there.</p>'
    + '</section>'
    + '<section class="info-tech">'
    + '<h2 class="info-h2">How it works</h2>'
    + '<dl class="info-parts">'
    + PARTS.map(([k, v]) => `<div class="info-part"><dt>${k}</dt><dd>${v}</dd></div>`).join('')
    + '</dl>'
    + '<p class="info-free">Every model that makes the station is free, down to the LLMs that write the scripts.</p>'
    + '</section>'
    + '</div>';

  const close = card.querySelector('.info-close');

  const toggle = (open) => {
    if (open === card.classList.contains('open')) return;
    card.classList.toggle('open', open);
    btn.classList.toggle('on', open);
    if (open) close.focus();
    else btn.focus();
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(!card.classList.contains('open')); });
  close.addEventListener('click', () => toggle(false));
  card.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') toggle(false);
    if (e.key === 'Tab') { e.preventDefault(); close.focus(); }
  });

  document.body.append(card, btn);
})();
