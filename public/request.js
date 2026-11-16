// The request line: a page over the artwork. Google sign-in is asked
// only here, when a listener wants to request. Listening never needs it.
const requestLine = (() => {
  const API = '/api/v1';
  let card, led, me = null, log = [], gsiLoading = null, openReason = 'request', callText = '';
  // Set while Google's sign-in is out, so the line reopens if the page reloads.
  const RETURN_KEY = 'dir-request-return';
  const DRAFT_KEY = 'dir-call-draft';

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
      if (on) {
        sessionStorage.setItem(RETURN_KEY, String(Date.now()));
        sessionStorage.setItem(DRAFT_KEY, callText);
      } else {
        sessionStorage.removeItem(RETURN_KEY);
        sessionStorage.removeItem(DRAFT_KEY);
      }
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
    if (ok) {
      me = data;
      await refreshMe();
      window.dispatchEvent(new Event('dir:listener-auth'));
      if (openReason === 'chat') close(); else render();
    } else render(data.message || 'Google didn\'t vouch for that.');
  }

  // The site's own button opens Google's popup (Google's rendered button
  // can't be styled). The token client is made once Google's script is in,
  // so the click can open the popup straight away.
  let tokenClient = null;
  function renderIntro(body) {
    body.append(el('p', 'rq-intro', "somewhere out there, your favourite band exists.\n\nyou just haven't heard them yet.\n\ngive us a band name and a song title.\nwe'll see what we can pick up."));
  }

  function renderSignIn(body, msg) {
    const lede = el('p', 'rq-lede');
    if (openReason === 'chat' || !me || !me.google_client_id) body.appendChild(lede);
    if (!me || !me.google_client_id) {
      lede.textContent = me ? 'Sign-in isn\'t set up yet.' : (msg || 'The line went dead. Try again later.');
      return;
    }
    lede.textContent = openReason === 'chat' ? 'Sign in with Google to transmit a message to the station.' : '';
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
    style.input.value = callText;
    style.input.addEventListener('input', () => { callText = style.input.value; });
    style.input.placeholder = STYLES[Math.floor(Math.random() * STYLES.length)];
    const done = me.requests_left <= 0 ? 'That\'s three today. The line opens again tomorrow.' : '';
    const out = el('p', 'rq-msg', msg || done);
    const { wrap, go } = goButton('[ SEND REQUEST ]', 'submit');
    wrap.classList.add('rq-submit');
    const foot = el('div', 'rq-foot');
    foot.append(out, fieldLights([artist.input, title.input, style.input]), wrap);
    if (me.requests_left <= 0) go.disabled = true;
    form.append(artist.row, title.row, style.row, foot, el('p', 'rq-note', 'all requests are subject to the laws of physics, which are no longer strictly enforced.'));
    body.append(form);
    const requestLog = el('div', 'rq-log');
    body.append(requestLog);
    renderLog(requestLog);

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
    const clock = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (req.airs_at) return 'Airs ' + clock(req.airs_at);
    return req.aired_at ? 'Aired ' + clock(req.aired_at) : 'Aired';
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

  // Sent: the form goes; what was asked for stays on the page, and the
  // station logs it going out, in the signal's own marks.
  function renderSent(body, req, msg) {
    if (previewKey && body.contains(previewKey)) stopPreview();
    body.replaceChildren();
    const done = el('div', 'rq-sent');
    done.append(el('p', 'rq-sent-title', req.title), el('p', 'rq-sent-artist', req.artist));
    const tx = el('div', 'rq-tx');
    const pad = (n) => String(n).padStart(2, '0');
    const at = Date.now();
    let lastWords;
    [
      ['request', '\u223f\u223f', 'Into the signal.'],
      ['station', '((\u2022))', `${req.artist} exists now, for as long as the signal holds.`],
      ['station', '((\u2022))', 'The machine is writing the song.'],
    ].forEach(([kind, mark, words], i) => {
      const t = new Date(at + i * 1000);
      const row = el('p', `rq-tx-row rq-tx-${kind}`);
      lastWords = el('span', 'rq-tx-words', words);
      row.append(el('span', 'rq-tx-time', `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`),
        el('span', 'rq-tx-mark', mark), lastWords);
      tx.append(row);
    });
    const cursor = lastWords.appendChild(el('i', 'rq-tx-cursor'));
    const foot = el('div', 'rq-foot');
    // The line closes once a request is in, so it isn't sent again at once.
    const { wrap, go } = goButton('close');
    go.addEventListener('click', close);
    foot.append(el('p', 'rq-msg', msg), lights(me.requests_left), wrap);
    body.append(done, tx, foot);
    transmit(done, tx, foot, cursor);
  }

  // The request goes out: the song settles, the log lines arrive a beat
  // apart, then the cursor keeps blinking. Still without GSAP or motion.
  function transmit(done, tx, foot, cursor) {
    const gsap = window.gsap;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!gsap || still) return;
    gsap.timeline()
      .from(done.children, { y: 24, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.08 })
      .from(tx.children, { opacity: 0, x: -6, duration: 0.25, ease: 'steps(3)', stagger: 0.55 }, '+=0.15')
      .from(foot, { opacity: 0, y: 8, duration: 0.5, ease: 'power2.out' }, '-=0.1')
      .to(cursor, { opacity: 0, duration: 0.5, ease: 'steps(1)', repeat: -1, yoyo: true });
  }

  function render(msg) {
    const body = card.querySelector('.rq-body');
    stopPreview();
    body.replaceChildren();
    if (openReason === 'request') renderIntro(body);
    if (me && me.signed_in) renderForm(body, msg);
    else renderSignIn(body, msg);
  }

  async function open(reason = 'request', prefill = '') {
    if (isOpen()) return;
    openReason = reason;
    callText = prefill;
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
    card.setAttribute('aria-label', 'Call in');
    const top = el('div', 'rq-top');
    const x = el('button', 'rq-close', '\u00d7');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    top.append(el('h1', 'rq-head', 'REQUEST A TRANSMISSION'), x);
    card.append(top, el('div', 'rq-body'));
    document.body.appendChild(card);

    btn.addEventListener('click', () => (isOpen() ? close() : open('request')));
    if (shouldReturn()) {
      let draft = '';
      try { draft = sessionStorage.getItem(DRAFT_KEY) || ''; sessionStorage.removeItem(DRAFT_KEY); } catch (_) {}
      open('request', draft);
    }
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
