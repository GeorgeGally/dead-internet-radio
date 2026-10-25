// The request line: a small card over the artwork. Google sign-in is asked
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

  function left(n) {
    return n === 1 ? '1 left today' : `${n} left today`;
  }

  function loadGsi() {
    if (window.google && google.accounts && google.accounts.id) return Promise.resolve();
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

  async function onCredential(resp) {
    const { ok, data } = await call('POST', '/session/google', { credential: resp.credential });
    if (ok) { me = data; render(); } else render(data.message || 'Google didn\'t vouch for that.');
  }

  function renderSignIn(body, msg) {
    if (!me || !me.google_client_id) {
      body.appendChild(el('p', 'rq-msg', 'Sign-in isn\'t set up yet.'));
      return;
    }
    body.appendChild(el('p', 'rq-msg', msg || 'Sign in to request.'));
    const slot = el('div', 'rq-google');
    body.appendChild(slot);
    loadGsi().then(() => {
      google.accounts.id.initialize({ client_id: me.google_client_id, callback: onCredential });
      google.accounts.id.renderButton(slot, { theme: 'filled_black', size: 'medium', shape: 'rectangular', text: 'signin' });
    }).catch(() => { slot.textContent = 'Google is out of reach.'; });
  }

  function field(name, max) {
    const input = el('input', 'rq-input');
    input.name = name;
    input.placeholder = name;
    input.maxLength = max;
    input.autocomplete = 'off';
    input.spellcheck = false;
    return input;
  }

  function renderForm(body, msg) {
    const form = el('form', 'rq-form');
    const artist = field('artist', 60);
    const title = field('title', 80);
    const note = field('note', 140);
    const send = el('button', 'rq-send', 'send');
    send.type = 'submit';
    const out = el('p', 'rq-msg', msg || '');
    const count = el('p', 'rq-count', left(me.requests_left));
    if (me.requests_left <= 0) send.disabled = true;
    form.append(artist, title, note, send);
    body.append(form, out, count);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (send.disabled) return;
      send.disabled = true;
      out.textContent = '…';
      const { data } = await call('POST', '/requests', {
        artist: artist.value, title: title.value, note: note.value,
      });
      out.textContent = data.message || 'The line went dead. Try again later.';
      if (typeof data.requests_left === 'number') {
        me.requests_left = data.requests_left;
        count.textContent = left(data.requests_left);
      }
      if (data.status === 'queued') form.reset();
      send.disabled = me.requests_left <= 0;
    });
    setTimeout(() => artist.focus(), 0);
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
    card.querySelector('.rq-body').replaceChildren(el('p', 'rq-msg', '…'));
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
    card.append(el('div', 'rq-head', 'REQUEST'), el('div', 'rq-body'));
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
