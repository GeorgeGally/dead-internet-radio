'use strict';

// Live transmissions are independent text entries, never an opaque panel.
(() => {
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const root = make('section', 'signal-overlay');
  root.id = 'signal-overlay';
  root.setAttribute('aria-label', 'Live transmissions');
  const stack = make('div', 'signal-stack');
  const form = make('form', 'signal-compose');
  const input = make('input', 'signal-input');
  input.maxLength = 120;
  input.placeholder = 'Transmit a message...';
  input.setAttribute('aria-label', 'Transmit a message');
  const send = make('button', 'signal-send', '→');
  send.type = 'submit';
  send.setAttribute('aria-label', 'Send transmission');
  const heart = make('button', 'signal-heart', '♡');
  heart.type = 'button';
  heart.setAttribute('aria-label', 'Send heart');
  form.append(input, send, heart);
  root.append(stack, form);
  const hearts = make('div', 'signal-hearts');
  document.body.append(root, hearts);

  const seen = new Set();
  const maxVisible = matchMedia('(max-width: 767px)').matches ? 3 : 5;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let csrf = '', signedIn = false, socket, retry, lastHeart = 0;

  function hidden() {
    const deck = document.getElementById('deck');
    const welcome = document.getElementById('welcome-splash');
    return document.body.classList.contains('slot-preview') ||
      deck?.matches('.expanded, .ejected') ||
      (welcome && getComputedStyle(welcome).display !== 'none' &&
       !welcome.classList.contains('fade-out')) ||
      !!document.querySelector('.request-card.open, #set-page.open');
  }
  function add(event) {
    if (!event || !event.id || seen.has(String(event.id)) || hidden()) return;
    seen.add(String(event.id));
    if (seen.size > 400) seen.clear();
    const line = make('div', 'signal-entry signal-' + (event.kind || 'station'));
    const label = make('span', 'signal-label',
      event.kind === 'chat' ? (event.name || 'listener') :
      event.kind === 'request' ? 'REQUEST' : 'DIR');
    line.append(label, document.createTextNode(' '), make('span', 'signal-copy', event.body));
    stack.append(line);
    while (stack.childElementCount > maxVisible) stack.firstElementChild.remove();
    setTimeout(() => {
      line.classList.add('signal-leaving');
      setTimeout(() => line.remove(), reduced.matches ? 0 : 500);
    }, event.kind === 'chat' ? 6500 : 8500);
  }
  function floatHeart() {
    if (hidden()) return;
    const node = make('span', 'signal-floating-heart', '♥');
    node.style.left = (10 + Math.random() * 65) + '%';
    node.style.fontSize = (17 + Math.random() * 15) + 'px';
    hearts.append(node);
    setTimeout(() => node.remove(), reduced.matches ? 100 : 2400);
  }
  async function profile() {
    try {
      const res = await fetch('/api/v1/me', { credentials: 'same-origin' });
      if (!res.ok) return;
      const me = await res.json();
      csrf = me.csrf_token;
      signedIn = !!me.signed_in;
    } catch (_) {}
  }
  async function history() {
    try {
      if (hidden()) return;
      const res = await fetch('/api/v1/transmissions');
      if (!res.ok) return;
      const rows = await res.json();
      rows.slice(-maxVisible).forEach(add);
    } catch (_) {}
  }
  function connect() {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      socket = new WebSocket(scheme + '//' + location.host + '/cable');
      socket.onopen = () => socket.send(JSON.stringify({
        command: 'subscribe', identifier: JSON.stringify({ channel: 'SignalChannel' })
      }));
      socket.onmessage = e => {
        let data;
        try { data = JSON.parse(e.data); } catch (_) { return; }
        if (data.message?.type === 'heart') floatHeart();
        if (data.message?.type === 'message') add(data.message.event);
      };
      socket.onclose = () => { clearTimeout(retry); retry = setTimeout(connect, 5000); };
      socket.onerror = () => socket.close();
    } catch (_) { retry = setTimeout(connect, 5000); }
  }
  async function upcoming() {
    if (hidden()) return;
    try {
      const res = await fetch('/api/v1/broadcast');
      if (!res.ok) return;
      const timeline = await res.json();
      const now = timeline.serverTime || Date.now();
      const tracks = (timeline.segments || []).filter(t =>
        !t.interlude && t.startsAt >= now && t.startsAt < now + 3600000 &&
        t.artist && t.artist !== 'Dead Internet Radio');
      const names = [...new Set(tracks.map(t => t.artist))].slice(0, 3);
      if (names.length) add({ id: 'lineup:' + Math.floor(now / 3600000),
        kind: 'station', body: 'Coming up in the next hour: tracks from ' + names.join(', ') + '.' });
    } catch (_) {}
  }
  const fiction = [
    'DIR FICTION / Radiation will be heavy over the western sector this afternoon. Don’t forget those hazmats!',
    'DIR FICTION / Municipal servers advise residents to ignore the second moon.',
    'DIR FICTION / Signal contamination detected near Sector 9. Reception may improve.',
    'DIR FICTION / The last functioning vending machine has entered sleep mode.'
  ];
  function bulletin() {
    const slot = Math.floor(Date.now() / 1200000);
    add({ id: 'bulletin:' + slot, kind: 'station', body: fiction[slot % fiction.length] });
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (hidden()) return;
    if (!signedIn) {
      // Only the existing Request interface owns Google authentication.
      document.getElementById('btn-request')?.click();
      return;
    }
    const body = input.value.trim();
    if (!body) return;
    send.disabled = true;
    input.setCustomValidity('');
    try {
      const res = await fetch('/api/v1/transmissions', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ body })
      });
      const data = await res.json();
      if (res.ok) { input.value = ''; add(data); }
      else { input.setCustomValidity(data.message || 'Transmission rejected.'); input.reportValidity(); }
    } catch (_) { input.setCustomValidity('Signal lost.'); input.reportValidity(); }
    finally { send.disabled = false; }
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
  heart.addEventListener('click', async () => {
    if (hidden() || Date.now() - lastHeart < 1000) return;
    lastHeart = Date.now();
    floatHeart();
    try {
      await fetch('/api/v1/transmissions/heart', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
    } catch (_) {}
  });

  profile().then(history);
  connect();
  setInterval(history, 12000); // Cable reconnect and proxy fallback.
  setInterval(profile, 60000);
  setTimeout(upcoming, 8000);
  setInterval(upcoming, 15 * 60000);
  setTimeout(bulletin, 18000);
  setInterval(bulletin, 20 * 60000);
})();
