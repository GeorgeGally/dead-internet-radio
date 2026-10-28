// The request line: a full-screen page over the artwork. Google sign-in is asked
// only here, when a listener wants to request. Listening never needs it.
const requestLine = (() => {
  const API = '/api/v1';
  let card, led, me = null, gsiLoading = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  async function call(method, path, body) {
    const res = await fetch(API + path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': me ? me.csrf_token : '' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    return { ok: res.ok, data };
  }

  async function refreshMe() {
    const { ok, data } = await call('GET', '/me');
    me = ok ? data : null;
    return me;
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

  async function signIn(tokenResp) {
    if (!tokenResp || !tokenResp.access_token) { render('Google didn\'t vouch for that.'); return; }
    const { ok, data } = await call('POST', '/session/google', { access_token: tokenResp.access_token });
    if (ok) { me = data; render(); } else render(data.message || 'Google didn\'t vouch for that.');
  }

  // The site's own button opens Google's popup (Google's rendered button
  // can't be styled). The token client is made once Google's script is in,
  // so the click can open the popup straight away.
  let tokenClient = null;
  function renderSignIn(body, msg) {
    const lede = el('p', 'rq-lede');
    body.appendChild(lede);
    if (!me || !me.google_client_id) {
      lede.textContent = 'Sign-in isn\'t set up yet.';
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
      });
      go.disabled = false;
    }).catch(() => { out.textContent = 'Google is out of reach.'; });
    go.addEventListener('click', () => { if (tokenClient) tokenClient.requestAccessToken(); });
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
    let leds = lights(me.requests_left);
    const foot = el('div', 'rq-foot');
    foot.append(out, leds, wrap);
    if (me.requests_left <= 0) go.disabled = true;
    form.append(artist.row, title.row, style.row, foot);
    body.append(form, el('p', 'rq-note', 'Every artist on DIR is a band that never existed.'));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (go.disabled) return;
      go.disabled = true;
      out.textContent = '\u2026';
      const { data } = await call('POST', '/requests', {
        artist: artist.input.value, title: title.input.value, note: style.input.value,
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      out.textContent = data.message || 'The line went dead. Try again later.';
      // A cover: the station's line is marked in orange.
      const COVER = "We don't do covers. Describe a band that should exist.";
      if (data.status === 'cover' && out.textContent.includes(COVER)) {
        const [before] = out.textContent.split(COVER);
        out.replaceChildren(before, el('mark', 'rq-mark', COVER));
      }
      if (typeof data.requests_left === 'number') {
        me.requests_left = data.requests_left;
        const next = lights(data.requests_left);
        leds.replaceWith(next);
        leds = next;
      }
      if (data.status === 'queued') form.reset();
      if (data.status === 'cover') { artist.input.select(); }
      go.disabled = me.requests_left <= 0;
    });
    setTimeout(() => artist.input.focus(), 0);
  }

  function render(msg) {
    const body = card.querySelector('.rq-body');
    body.replaceChildren();
    if (me && me.signed_in) renderForm(body, msg);
    else renderSignIn(body, msg);
  }

  async function open() {
    if (isOpen()) return;
    card.classList.add('open');
    led.classList.add('on');
    card.querySelector('.rq-body').replaceChildren();
    await refreshMe();
    if (isOpen()) render(me ? '' : 'The line went dead. Try again later.');
  }

  function close() {
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
    top.append(el('span', 'rq-head', 'Request line'), x);
    card.append(top, el('div', 'rq-body'));
    document.body.appendChild(card);

    btn.addEventListener('click', () => (isOpen() ? close() : open()));
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
