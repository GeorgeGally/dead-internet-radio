'use strict';

// The "i" in the bottom-left corner: a few lines on what this is.
(() => {
  const btn = document.createElement('button');
  btn.id = 'info-btn';
  btn.textContent = 'i';
  btn.setAttribute('aria-label', 'About Dead Internet Radio');

  const card = document.createElement('div');
  card.id = 'info-card';
  card.setAttribute('role', 'dialog');
  card.innerHTML = '<p>Every band on DIR never existed. Until now.</p>'
    + '<p class="info-dim">Written, sung and spun by machines, for whoever is still out there.</p>';

  const toggle = (open) => {
    card.classList.toggle('open', open);
    btn.classList.toggle('on', open);
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(!card.classList.contains('open')); });
  document.addEventListener('click', (e) => { if (!card.contains(e.target)) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });

  document.body.append(card, btn);
})();
