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
  const plus = make('span', 'signal-plus', '+');
  plus.setAttribute('aria-hidden', 'true');
  form.append(plus, input, send, heart);
  // Slash commands open the station's own pages instead of posting to chat.
  const commands = {
    '/request': () => typeof requestLine !== 'undefined' && requestLine.open('request'),
    '/tracklist': () => typeof setList !== 'undefined' && setList.open()
  };
  commands['/playlist'] = commands['/setlist'] = commands['/tracklist'];
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
  // A log stamps each line with the time it was sent.
  function clock(created) {
    const at = created ? new Date(created) : new Date();
    const time = isNaN(at) ? new Date() : at;
    return String(time.getHours()).padStart(2, '0') + ':' + String(time.getMinutes()).padStart(2, '0');
  }
  // Each type is named by plain characters, as a terminal would.
  const marks = { station: '((\u2022))', safety: '\u2622', request: '\u223f\u223f', chat: '@', system: '!' };

  // Lines climb at a steady pace from the composer to mid-page; the stack's mask
  // fades them from a quarter of the screen height. A new line waits, unseen,
  // until the line above has climbed clear of it, so lines never overlap.
  const SPEED = 30, GAP = 8, QUEUE = 6;
  const climbing = [], waiting = [];
  let ticking = false, lastTick = 0;
  const moving = () => !reduced.matches && typeof requestAnimationFrame === 'function';
  function forget(line) {
    const at = climbing.findIndex(c => c.line === line);
    if (at >= 0) climbing.splice(at, 1);
    const queued = waiting.findIndex(w => w.line === line);
    if (queued >= 0) waiting.splice(queued, 1);
  }
  function climb(now) {
    const dt = Math.min(0.1, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    // A burst climbs faster rather than backing up behind the composer.
    const speed = SPEED * (1 + Math.min(2, waiting.length * 0.5));
    const top = stack.clientHeight + 60;
    for (let i = climbing.length - 1; i >= 0; i--) {
      const c = climbing[i];
      c.d += speed * dt;
      c.line.style.transform = 'translateY(' + (-c.d).toFixed(1) + 'px)';
      if (c.d > top) c.drop();
    }
    const next = waiting[0];
    const above = climbing[climbing.length - 1];
    if (next && (!above || above.d >= next.line.offsetHeight + GAP)) {
      waiting.shift();
      next.line.classList.remove('signal-waiting');
      climbing.push(next);
    }
    if (climbing.length || waiting.length) requestAnimationFrame(climb);
    else ticking = false;
  }
  function enqueue(line, drop) {
    line.classList.add('signal-waiting');
    waiting.push({ line, d: 0, drop });
    while (waiting.length > QUEUE) waiting[0].drop();
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(now => { lastTick = now; climb(now); });
  }
  function add(event, initial = false) {
    if (!event || !event.id || hidden()) return;
    const key = String(event.id);
    if (seen.has(key)) return;
    seen.add(key);
    if (seen.size > 800) seen.clear();

    const fictional = event.kind === 'station' && event.body?.startsWith('DIR FICTION /');
    const kind = fictional ? 'safety' : event.kind || 'station';
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
    if (event.action) {
      const act = make('a', 'signal-action', event.action.label);
      act.href = '#';
      act.addEventListener('click', e => { e.preventDefault(); event.action.run(); });
      body.append(document.createTextNode(' '), act);
    }
    const mark = make('span', 'signal-mark', marks[kind] || marks.station);
    mark.setAttribute('aria-hidden', 'true');
    const words = make('span', 'signal-text');
    words.append(label, document.createTextNode(' '), body);
    line.append(mark, words, make('span', 'signal-time', clock(event.created_at)));
    entries.set(key, line);
    stack.append(line);
    // Old messages may provide atmosphere on entry but never remain as chat history.
    const drop = () => {
      forget(line);
      if (!line.isConnected) return;
      entries.delete(key);
      line.remove();
    };
    if (moving()) {
      enqueue(line, drop);
      setTimeout(drop, 90000); // a line that never gets to climb still goes
    } else {
      while (stack.childElementCount > maxVisible) {
        const old = stack.firstElementChild;
        entries.delete(old.dataset.signalId);
        old.remove();
      }
      setTimeout(drop, initial || event.kind === 'chat' ? 10000 : 12000);
    }
  }
  function remove(id) {
    const key = String(id);
    const line = entries.get(key);
    if (line) { forget(line); line.remove(); }
    entries.delete(key);
    seen.add(key);
  }
  function floatHeart() {
    if (hidden()) return;
    const node = make('span', 'signal-floating-heart', '♥');
    // Every heart rises from the heart key and drifts aside so a burst spreads.
    const from = heart.getBoundingClientRect();
    node.style.left = (from.left + from.width / 2) + 'px';
    node.style.top = (from.top + from.height / 2) + 'px';
    node.style.fontSize = (28 + Math.random() * 12).toFixed(0) + 'px';
    node.style.setProperty('--signal-drift', ((Math.random() - 0.65) * 80).toFixed(0) + 'px');
    hearts.append(node);
    setTimeout(() => node.remove(), reduced.matches ? 100 : 3200);
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
  // Every notice is a system line in the stream, never a browser popup.
  function notice(body, action) {
    input.blur();
    add({ id: 'local:' + ++localId, kind: 'system', body, action });
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
  const COMMANDS = 'Commands: /request, /tracklist';
  input.addEventListener('focus', () => { if (signedIn) profile(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (runCommand(input.value)) return;
    if (/^\/\S*$/.test(input.value.trim())) {
      input.value = '';
      notice(COMMANDS);
      return;
    }
    if (hidden()) return;
    if (!chatEnabled) {
      if (input.value.trim()) notice('Chat is offline. Your message wasn\u2019t sent.');
      return;
    }
    if (!signedIn) {
      // Opening the card at once would hide the stream and this line with it.
      if (!input.value.trim()) return requestSignIn();
      return notice('Sign in to transmit. Your message is kept.', { label: 'Sign in', run: requestSignIn });
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
    if (!wasHidden && nowHidden) {
      entries.forEach(line => line.remove());
      entries.clear();
      climbing.length = waiting.length = 0;
    }
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
