'use strict';

// A lightweight live-stream layer over DIR artworks, not a second player.
(() => {
  if (document.body.classList.contains('slot-preview')) return;
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const root = make('section', 'signal-overlay');
  root.id = 'signal-overlay';
  root.setAttribute('aria-label', 'DIR transmissions');
  const stack = make('div', 'signal-stack');
  stack.setAttribute('aria-live', 'off'); // Rapid chat must not overwhelm screen readers.
  const form = make('form', 'signal-compose');
  const input = make('input', 'signal-input');
  input.maxLength = 120;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Transmit a message');
  const send = make('button', 'signal-send', '→');
  send.type = 'submit';
  send.setAttribute('aria-label', 'Send transmission');
  const heart = make('button', 'signal-heart', '♡');
  heart.type = 'button';
  heart.setAttribute('aria-label', 'Send heart');
  form.append(input, send, heart);
  // Slash commands open the station's own pages instead of posting to chat.
  const commands = {
    '/request': () => typeof requestLine !== 'undefined' && requestLine.open('request'),
    '/tracklist': () => typeof setList !== 'undefined' && setList.open()
  };
  root.append(stack, form);
  const hearts = make('div', 'signal-hearts');
  document.body.append(root, hearts);

  const seen = new Set(), entries = new Map();
  const maxVisible = matchMedia('(max-width: 767px)').matches ? 3 : 5;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let csrf = '', signedIn = false, handle = '', chatEnabled = false;
  let socket, retry, lastHeart = 0, geoDone = false, catchupInFlight = false;
  let wasHidden = true, localId = 0;

  function hidden() {
    const deck = document.getElementById('deck');
    const welcome = document.getElementById('welcome-splash');
    return document.body.classList.contains('slot-preview') ||
      !!deck?.matches('.expanded, .ejected') ||
      (welcome && getComputedStyle(welcome).display !== 'none' &&
       !welcome.classList.contains('fade-out')) ||
      !!document.querySelector('.request-card.open, #set-page.open, #info-card.open');
  }
  function updateForm() {
    input.placeholder = !chatEnabled ? 'Chat frequency offline' :
      !signedIn ? 'Sign in to transmit...' : 'Transmit a message...';
    send.setAttribute('aria-label', signedIn ? 'Send transmission' : 'Sign in to transmit');
  }
  function shortAge(created) {
    if (!created) return '';
    const age = Math.max(0, Math.floor((Date.now() - new Date(created).getTime()) / 60000));
    return age < 1 ? 'now' : age < 60 ? age + 'm' : Math.floor(age / 60) + 'h';
  }
  function add(event, initial = false) {
    if (!event || !event.id || hidden()) return;
    const key = String(event.id);
    if (seen.has(key)) return;
    seen.add(key);
    if (seen.size > 800) seen.clear();

    const fictional = event.kind === 'station' && event.body?.startsWith('DIR FICTION /');
    const line = make('div', 'signal-entry signal-' + (event.kind || 'station') +
      (fictional ? ' signal-safety' : ''));
    line.dataset.signalId = key;
    if (fictional) line.setAttribute('aria-label', 'Fictional DIR safety bulletin');
    const label = make('span', 'signal-label',
      event.kind === 'chat' ? (event.name || 'listener') :
      event.kind === 'request' ? 'REQUEST' : fictional ? 'DIR / SAFETY' : 'DIR');
    const text = (event.body || '').replace(/^DIR FICTION \/ /, '');
    const body = make('span', 'signal-copy', text.includes('\u2588') ? undefined : text);
    // Moderation blacks out swearing as solid bars; draw them as a censored document.
    if (text.includes('\u2588')) text.split(/(\u2588+)/).forEach(part => {
      if (!part) return;
      if (part[0] === '\u2588') {
        const bar = make('span', 'signal-redacted', part);
        bar.setAttribute('aria-label', 'redacted');
        body.append(bar);
      } else body.append(document.createTextNode(part));
    });
    line.append(label, document.createTextNode(' '), body);
    if (event.created_at) line.append(make('span', 'signal-age', shortAge(event.created_at)));
    entries.set(key, line);
    stack.append(line);
    while (stack.childElementCount > maxVisible) {
      const old = stack.firstElementChild;
      entries.delete(old.dataset.signalId);
      old.remove();
    }
    // Old messages may provide atmosphere on entry but never remain as chat history.
    const lifetime = initial ? 8000 : event.kind === 'chat' ? 6500 : 8500;
    setTimeout(() => {
      if (!line.isConnected) return;
      line.classList.add('signal-leaving');
      setTimeout(() => { entries.delete(key); line.remove(); }, reduced.matches ? 0 : 900);
    }, lifetime);
  }
  function remove(id) {
    const key = String(id);
    entries.get(key)?.remove();
    entries.delete(key);
    seen.add(key);
  }
  function floatHeart() {
    if (hidden()) return;
    const node = make('span', 'signal-floating-heart', '♥');
    // Every heart rises from the heart key, with a little drift so a burst spreads.
    const from = heart.getBoundingClientRect();
    node.style.left = (from.left + from.width / 2 + (Math.random() - 0.5) * 24) + 'px';
    node.style.top = (from.top + from.height / 2) + 'px';
    node.style.fontSize = (30 + Math.random() * 18) + 'px';
    hearts.append(node);
    setTimeout(() => node.remove(), reduced.matches ? 100 : 2400);
  }
  async function updateCityHandle() {
    if (geoDone || !signedIn || !handle.startsWith('Somewhere_')) return;
    geoDone = true;
    try {
      let city = '';
      const stored = sessionStorage.getItem('dir-where');
      if (stored) city = JSON.parse(stored)?.city || '';
      if (!city) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch('https://get.geojs.io/v1/ip/geo.json', { signal: controller.signal });
          if (res.ok) city = (await res.json()).city || '';
        } finally { clearTimeout(timer); }
      }
      if (!city) return;
      const res = await fetch('/api/v1/signal/identity', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ city })
      });
      if (res.ok) handle = (await res.json()).handle || handle;
    } catch (_) {}
  }
  async function profile() {
    try {
      const res = await fetch('/api/v1/me', { credentials: 'same-origin' });
      if (!res.ok) return;
      const me = await res.json();
      csrf = me.csrf_token;
      signedIn = !!me.signed_in;
      handle = me.public_handle || '';
      updateForm();
      updateCityHandle();
    } catch (_) {}
  }
  async function history() {
    if (catchupInFlight || hidden()) return;
    catchupInFlight = true;
    try {
      const res = await fetch('/api/v1/transmissions', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      chatEnabled = !!data.chat_enabled;
      updateForm();
      (data.messages || []).slice(-maxVisible).forEach(event => add(event, true));
    } catch (_) {}
    finally { catchupInFlight = false; }
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
        if (data.type === 'confirm_subscription') history();
        if (data.message?.type === 'heart' && Date.now() - lastHeart > 1200) floatHeart();
        if (data.message?.type === 'message') add(data.message.event);
        if (data.message?.type === 'remove') remove(data.message.id);
        if (data.message?.type === 'chat_state') {
          chatEnabled = !!data.message.enabled;
          updateForm();
        }
      };
      socket.onclose = () => { clearTimeout(retry); retry = setTimeout(connect, 5000); };
      socket.onerror = () => socket.close();
    } catch (_) { retry = setTimeout(connect, 5000); }
  }

  async function upcoming() {
    if (hidden()) return;
    try {
      const res = await fetch('/api/v1/signal/lineup');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.artists?.length) return;
      const list = data.artists.join(', ');
      const slot = Math.floor(new Date(data.generated_at).getTime() / 3600000);
      add({ id: 'lineup:' + slot, kind: 'station',
        body: 'Coming up in the next hour: tracks from ' + list + '.' });
    } catch (_) {}
  }
  // Lines written fresh on the server; these stand in when the station can't be reached.
  let fiction = [
    'DIR FICTION / Radiation will be heavy over the western sector this afternoon. Don’t forget those hazmats!',
    'DIR FICTION / Municipal servers advise residents to ignore the second moon.',
    'DIR FICTION / Signal contamination detected near Sector 9. Reception may improve.',
    'DIR FICTION / The last functioning vending machine has entered sleep mode.',
    'DIR FICTION / Residents are reminded that the fog is not accepting new followers.',
    'DIR FICTION / The bridge to Sector 4 is closed for buffering. Expect delays of one to forty years.',
    'DIR FICTION / Lost: one password, last seen in 2009. Answers to "password1".',
    'DIR FICTION / Pollen count is low. Packet loss is high. Dress accordingly.',
    'DIR FICTION / The council confirms the sky has been updated. No restart is required.',
    'DIR FICTION / Please do not feed the abandoned chatbots. They are learning.',
    'DIR FICTION / Water supply restored to the eastern districts. Taste may include advertising.',
    'DIR FICTION / A light drizzle of expired cookies is expected after midnight.',
    'DIR FICTION / The public library has archived itself. Opening hours are unknown.',
    'DIR FICTION / Curfew remains in effect for unverified accounts. Stay indoors and stay human.',
    'DIR FICTION / The comment section north of the river has been cordoned off. Do not engage.',
    'DIR FICTION / Tonight’s blackout is sponsored. Thank you for your continued attention.'
  ];
  async function bulletins() {
    try {
      const res = await fetch('/api/v1/signal/bulletins');
      if (!res.ok) return;
      const lines = ((await res.json()).lines || []).filter(l => typeof l === 'string' && l.startsWith('DIR FICTION /'));
      if (lines.length) fiction = lines;
    } catch (_) {}
  }
  async function bulletin() {
    if (hidden()) return;
    await bulletins();
    const slot = Math.floor(Date.now() / 240000);
    add({ id: 'bulletin:' + slot, kind: 'station', body: fiction[slot % fiction.length] });
  }
  // Every notice is a station line in the stream, never a browser popup.
  function notice(body) {
    input.blur();
    add({ id: 'local:' + ++localId, kind: 'station', body });
  }
  function requestSignIn() {
    if (!chatEnabled || signedIn) return;
    // Reuse DIR's existing Google flow without adding a second sign-in UI.
    if (typeof requestLine !== 'undefined') requestLine.open('chat');
  }
  function runCommand(text) {
    const run = commands[text.trim().toLowerCase()];
    if (!run) return false;
    input.value = '';
    input.blur();
    run();
    return true;
  }
  input.addEventListener('focus', () => { if (signedIn) profile(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (runCommand(input.value)) return;
    if (hidden()) return;
    if (!chatEnabled) {
      if (input.value.trim()) notice('Chat is offline');
      return;
    }
    if (!signedIn) {
      if (input.value.trim()) notice('Sign in to transmit');
      return requestSignIn();
    }
    const body = input.value.trim();
    if (!body) return;
    send.disabled = true;
    try {
      const res = await fetch('/api/v1/transmissions', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ body })
      });
      const data = await res.json();
      if (res.ok) { input.value = ''; add(data); }
      else notice(data.message || 'Transmission rejected.');
    } catch (_) { notice('Signal lost.'); }
    finally { send.disabled = false; }
  });
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
  // iOS uses the visual viewport when the composer opens its keyboard.
  const viewport = window.visualViewport;
  function adjustKeyboard() {
    if (!viewport) return;
    const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    root.style.setProperty('--signal-keyboard-offset', keyboard > 100 ? keyboard + 'px' : '0px');
    root.classList.toggle('signal-keyboard-open', keyboard > 100);
  }
  viewport?.addEventListener('resize', adjustKeyboard);
  viewport?.addEventListener('scroll', adjustKeyboard);
  window.addEventListener('dir:listener-auth', () => { geoDone = false; profile(); });
  let nowPlaying = '', latestTrack = null;
  function announceTrack() {
    if (!latestTrack || hidden()) return;
    const { title, artist } = latestTrack;
    const key = title + '\n' + artist;
    if (key === nowPlaying) return;
    nowPlaying = key;
    add({ id: 'local:' + ++localId, kind: 'station', body: 'Now playing: ' + title + ' · ' + artist });
  }
  window.addEventListener('dir:track', e => {
    if (!e.detail?.title) return;
    latestTrack = e.detail;
    announceTrack();
  });
  // A visit starts with the intro / closed deck. Resume activity after it exits.
  setInterval(() => {
    const nowHidden = hidden();
    if (wasHidden && !nowHidden) { history(); upcoming(); announceTrack(); setTimeout(bulletin, 4000); }
    wasHidden = nowHidden;
  }, 1500);
  updateForm();
  profile().then(history);
  connect();
  setInterval(history, 12000);
  setInterval(profile, 60000);
  setInterval(upcoming, 15 * 60000);
  setInterval(bulletin, 4 * 60000);
})();
