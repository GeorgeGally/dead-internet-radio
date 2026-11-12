// The request line: a page over the artwork. Google sign-in is asked
// only here, when a listener wants to request. Listening never needs it.
const requestLine = (() => {
  const API = '/api/v1';
  let card, led, me = null, log = [], gsiLoading = null;
  // Set while Google's sign-in is out, so the line reopens if the page reloads.
  const RETURN_KEY = 'dir-request-return';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  // A dropped or stalled line answers like a refusal, so the page always
  // renders. Only reads give up on time: a send may already be in.
  const READ_WAIT = 10000;
  async function call(method, path, body) {
    const stop = method === 'GET' ? new AbortController() : null;
    const timer = stop ? setTimeout(() => stop.abort(), READ_WAIT) : null;
    try {
      const res = await fetch(API + path, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': me ? me.csrf_token : '' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: stop ? stop.signal : undefined,
      });
      const data = await res.json();
      return { ok: res.ok, data };
    } catch (_) {
      return { ok: false, data: {}, unavailable: true };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function refreshMe() {
    const { ok, data } = await call('GET', '/me');
    me = ok ? data : null;
    const line = me && me.signed_in ? await call('GET', '/requests') : null;
    log = line && line.ok ? line.data : [];
    return me;
  }

  // One light per field, lit once that field has something in it.
  function fieldLights(inputs) {
    const box = el('div', 'rq-leds');
    const dots = inputs.map(() => box.appendChild(el('i')));
    const update = () => inputs.forEach((input, i) => dots[i].classList.toggle('on', input.value.trim() !== ''));
    inputs.forEach((input) => input.addEventListener('input', update));
    update();
    return box;
  }

  // Three lights for the day's three requests: lit = still yours.
  function lights(n) {
    const box = el('div', 'rq-leds');
    for (let i = 0; i < 3; i++) box.appendChild(el('i', i < n ? 'on' : ''));
    box.title = n === 1 ? '1 left today' : `${n} left today`;
    return box;
  }

  // A square orange key with its name printed on it.
  function goButton(label, type) {
    const go = el('button', 'rq-go');
    go.type = type || 'button';
    go.append(el('span', 'rq-go-label', label), el('span', 'rq-go-arrow', '\u2192'));
    return { wrap: go, go };
  }

  function loadGsi() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gsiLoading) return gsiLoading;
    gsiLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { gsiLoading = null; reject(new Error('gsi')); };
      document.head.appendChild(s);
    });
    return gsiLoading;
  }

  function rememberReturn(on) {
    try {
      if (on) sessionStorage.setItem(RETURN_KEY, String(Date.now()));
      else sessionStorage.removeItem(RETURN_KEY);
    } catch (_) {}
  }

  function shouldReturn() {
    try {
      const at = Number(sessionStorage.getItem(RETURN_KEY));
      sessionStorage.removeItem(RETURN_KEY);
      return at > 0 && Date.now() - at < 10 * 60 * 1000;
    } catch (_) { return false; }
  }

  async function signIn(tokenResp) {
    rememberReturn(false);
    if (!tokenResp || !tokenResp.access_token) { render('Google didn\'t vouch for that.'); return; }
    const { ok, data } = await call('POST', '/session/google', { access_token: tokenResp.access_token });
    if (ok) { me = data; await refreshMe(); render(); } else render(data.message || 'Google didn\'t vouch for that.');
  }

  // The site's own button opens Google's popup (Google's rendered button
  // can't be styled). The token client is made once Google's script is in,
  // so the click can open the popup straight away.
  let tokenClient = null;
  function renderSignIn(body, msg) {
    const lede = el('p', 'rq-lede');
    body.appendChild(lede);
    if (!me || !me.google_client_id) {
      lede.textContent = me ? 'Sign-in isn\'t set up yet.' : (msg || 'The line went dead. Try again later.');
      return;
    }
    lede.textContent = 'Name a band that never existed. The station makes the song.';
    const foot = el('div', 'rq-foot');
    const out = el('p', 'rq-msg', msg || 'Sign in with Google to send one.');
    const { wrap, go } = goButton('google');
    go.disabled = true;
    foot.append(out, wrap);
    body.appendChild(foot);
    loadGsi().then(() => {
      tokenClient = tokenClient || google.accounts.oauth2.initTokenClient({
        client_id: me.google_client_id,
        scope: 'openid email profile',
        callback: signIn,
        error_callback: () => { rememberReturn(false); },
      });
      go.disabled = false;
    }).catch(() => { out.textContent = 'Google is out of reach.'; });
    go.addEventListener('click', () => {
      if (!tokenClient) return;
      rememberReturn(true);
      tokenClient.requestAccessToken();
    });
  }

  const STYLES = [
    'midnight slo-mo disco',
    'cold Detroit electro',
    'Berlin warehouse EBM',
    'disco-punk with a broken drum machine',
    'electroclash for an empty mall',
    'slow dark minimal techno in the snow',
    'cosmic disco from a dead satellite',
  ];

  function field(num, label, name, max) {
    const row = el('label', 'rq-row');
    const input = el('input', 'rq-input');
    input.name = name;
    input.maxLength = max;
    input.autocomplete = 'off';
    input.spellcheck = false;
    row.append(el('span', 'rq-num', num), el('span', 'rq-lab', label), input);
    return { row, input };
  }

  function renderForm(body, msg) {
    const form = el('form', 'rq-form');
    const artist = field('01', 'Artist', 'artist', 60);
    const title = field('02', 'Title', 'title', 80);
    // Free text, not a genre list: a style can be "midnight slo-mo disco".
    const style = field('03', 'Style', 'note', 140);
    style.input.placeholder = STYLES[Math.floor(Math.random() * STYLES.length)];
    const done = me.requests_left <= 0 ? 'That\'s three today. The line opens again tomorrow.' : '';
    const out = el('p', 'rq-msg', msg || done);
    const { wrap, go } = goButton('send', 'submit');
    const foot = el('div', 'rq-foot');
    foot.append(out, fieldLights([artist.input, title.input, style.input]), wrap);
    if (me.requests_left <= 0) go.disabled = true;
    form.append(artist.row, title.row, style.row, foot);
    body.append(form);
    const requestLog = el('div', 'rq-log');
    body.append(requestLog);
    renderLog(requestLog);
    body.append(el('p', 'rq-note', 'Every artist on DIR is a band that never existed.'));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (go.disabled) return;
      go.disabled = true;
      out.textContent = '\u2026';
      const { data, unavailable } = await call('POST', '/requests', {
        artist: artist.input.value, title: title.input.value, note: style.input.value,
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!body.contains(form)) return;
      if (unavailable) {
        out.textContent = 'The line dropped. Your request may already be in.';
        const line = await call('GET', '/requests');
        if (line.ok && body.contains(form)) { log = line.data; renderLog(requestLog); }
        return;
      }
      out.textContent = data.message || 'The line went dead. Try again later.';
      // A cover: the station's line is marked in orange.
      const COVER = "We don't do covers. Describe a band that should exist.";
      if (data.status === 'cover' && out.textContent.includes(COVER)) {
        const [before] = out.textContent.split(COVER);
        out.replaceChildren(before, el('mark', 'rq-mark', COVER));
      }
      if (typeof data.requests_left === 'number') me.requests_left = data.requests_left;
      if (data.status === 'accepted') {
        renderSent(body, { artist: artist.input.value, title: title.input.value }, data.message);
        return;
      }
      if (data.status === 'cover') { artist.input.select(); }
      go.disabled = me.requests_left <= 0;
    });
    setTimeout(() => artist.input.focus(), 0);
  }

  const WHERE = { pending: 'Being checked', accepted: 'In line', queued: 'In line', generating: 'Being made', ready: 'Made', failed: 'Lost in the static' };

  function whereItIs(req) {
    if (req.status !== 'scheduled') return WHERE[req.status];
    if (!req.airs_at) return 'Aired';
    return 'Airs ' + new Date(req.airs_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // A rendered request plays here. The radio stops for it and comes back after.
  const preview = new Audio();
  let previewKey = null, radioWasOn = false;

  function stopPreview() {
    if (!previewKey) return;
    preview.pause();
    previewKey.textContent = '\u25b6';
    previewKey.classList.remove('on');
    previewKey.setAttribute('aria-label', 'Play');
    previewKey = null;
    if (radioWasOn) togglePlay();
    radioWasOn = false;
  }

  function startPreview(key, trackId) {
    const same = key === previewKey;
    stopPreview();
    if (same) return;
    const radio = document.getElementById('player');
    radioWasOn = !!radio && !radio.paused;
    if (radioWasOn) stopPlayback();
    previewKey = key;
    key.textContent = '\u25a0';
    key.classList.add('on');
    key.setAttribute('aria-label', 'Stop');
    preview.src = `/media/tracks/${trackId}`;
    preview.play().catch(stopPreview);
  }

  preview.addEventListener('ended', stopPreview);

  // The listener's last few requests and where each one has got to.
  function renderLog(list) {
    const rows = log.filter(whereItIs).slice(0, 5);
    if (previewKey && list.contains(previewKey)) stopPreview();
    list.replaceChildren();
    list.hidden = rows.length === 0;
    if (!rows.length) return;
    rows.forEach((req) => {
      const row = el('div', 'rq-log-row');
      const name = el('p', 'rq-log-name', req.title);
      name.append(el('span', 'rq-log-artist', req.artist));
      if (req.track_id) {
        const key = el('button', 'rq-play', '\u25b6');
        key.type = 'button';
        key.setAttribute('aria-label', 'Play');
        key.addEventListener('click', () => startPreview(key, req.track_id));
        row.append(key);
      } else {
        row.append(el('span', 'rq-play-gap'));
      }
      row.append(name, el('p', 'rq-log-where', whereItIs(req)));
      list.append(row);
    });
  }

  // Sent: the form goes; what was asked for stays on the page.
  function renderSent(body, req, msg) {
    if (previewKey && body.contains(previewKey)) stopPreview();
    body.replaceChildren();
    const done = el('div', 'rq-sent');
    done.append(el('p', 'rq-sent-title', req.title), el('p', 'rq-sent-artist', req.artist));
    const foot = el('div', 'rq-foot');
    // The line closes once a request is in, so it isn't sent again at once.
    const { wrap, go } = goButton('close');
    go.addEventListener('click', close);
    foot.append(el('p', 'rq-msg', msg), lights(me.requests_left), wrap);
    body.append(done, foot);
  }

  function render(msg) {
    const body = card.querySelector('.rq-body');
    stopPreview();
    body.replaceChildren();
    if (me && me.signed_in) renderForm(body, msg);
    else renderSignIn(body, msg);
  }

  async function open() {
    if (isOpen()) return;
    card.classList.add('open');
    led.classList.add('on');
    card.querySelector('.rq-body').replaceChildren(el('p', 'rq-msg', '\u2026'));
    await refreshMe();
    if (isOpen()) render();
  }

  function close() {
    rememberReturn(false);
    stopPreview();
    card.classList.remove('open');
    led.classList.remove('on');
    if (document.activeElement && card.contains(document.activeElement)) document.activeElement.blur();
  }

  function isOpen() { return card.classList.contains('open'); }

  function init() {
    led = document.getElementById('request-led');
    const btn = document.getElementById('btn-request');
    if (!led || !btn) return;
    card = el('div', 'request-card');
    card.id = 'request-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Request a song');
    const top = el('div', 'rq-top');
    const x = el('button', 'rq-close', '\u00d7');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    top.append(el('span', 'rq-head', 'Dead Internet Radio Request line'), x);
    card.append(top, el('div', 'rq-body'));
    document.body.appendChild(card);

    btn.addEventListener('click', () => (isOpen() ? close() : open()));
    if (shouldReturn()) open();
    // Typing in the card must not reach the artwork and filter keys.
    card.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) close();
    });
  }

  return { init, open, close, isOpen };
})();

requestLine.init();
