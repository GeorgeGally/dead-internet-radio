// Admin track player: a row's play key (.btn-play, data-src) plays it and
// pressing again stops; the playing row gets a full-width scrub bar under it.
var trackAudio = new Audio();
var currentBtn = null;
var scrubRow = null;
var scrub = document.createElement('div');
scrub.className = 'scrub';
scrub.innerHTML = '<div class="scrub-bar"><div class="scrub-fill"></div></div><span class="scrub-time"></span>';
var fill = scrub.querySelector('.scrub-fill'), time = scrub.querySelector('.scrub-time');

function fmt(t) { t = Math.floor(t || 0); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
function showProgress() {
  var d = trackAudio.duration || 0;
  fill.style.width = d ? (trackAudio.currentTime / d * 100) + '%' : '0';
  time.textContent = fmt(trackAudio.currentTime) + ' / ' + fmt(d);
}
trackAudio.addEventListener('timeupdate', showProgress);
trackAudio.addEventListener('durationchange', showProgress);

function failed(msg) {
  fill.style.width = '0';
  time.textContent = msg;
  if (currentBtn) { currentBtn.classList.remove('playing'); currentBtn.textContent = '\u25B6'; }
}
trackAudio.addEventListener('error', function() { if (currentBtn) failed('Can\u2019t play this file'); });

var bar = scrub.querySelector('.scrub-bar');
function seek(e) {
  var r = bar.getBoundingClientRect();
  if (trackAudio.duration) trackAudio.currentTime = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * trackAudio.duration;
}
bar.addEventListener('pointerdown', function(e) { bar.setPointerCapture(e.pointerId); seek(e); });
bar.addEventListener('pointermove', function(e) { if (e.buttons) seek(e); });

function stopAll() {
  document.querySelectorAll('.btn-play').forEach(function(b) { b.classList.remove('playing'); b.textContent = '\u25B6'; });
  currentBtn = null;
  if (scrubRow) { scrubRow.remove(); scrubRow = null; }
  scrub.remove();
}
// A table row gets a full-width scrub under it; anything else uses its [data-scrub].
function attachScrub(btn) {
  var row = btn.closest('tr');
  if (row) {
    var cell = document.createElement('td');
    cell.colSpan = row.children.length;
    cell.appendChild(scrub);
    scrubRow = document.createElement('tr');
    scrubRow.className = 'scrub-row';
    scrubRow.appendChild(cell);
    row.after(scrubRow);
    return;
  }
  var slot = btn.parentElement && btn.parentElement.querySelector('[data-scrub]');
  (slot || btn.parentElement).appendChild(scrub);
}
function playTrack(btn) {
  var playing = btn.classList.contains('playing');
  stopAll();
  document.querySelectorAll('audio.show-mix').forEach(function(a) { a.pause(); });
  if (playing) { trackAudio.pause(); return; }
  currentBtn = btn;
  fill.style.width = '0';
  time.textContent = '0:00';
  btn.classList.add('playing');
  btn.textContent = '\u25A0';
  attachScrub(btn);
  trackAudio.src = btn.dataset.src;
  trackAudio.load();
  var played = trackAudio.play();
  if (played && played.catch) played.catch(function() { failed('Press play again'); });
}
trackAudio.addEventListener('ended', stopAll);

// Re-render opens a notes field under its track.
function openRerender(btn) {
  var row = btn.closest('tr').nextElementSibling;
  while (row && !row.classList.contains('rerender-row')) row = row.nextElementSibling;
  row.hidden = !row.hidden;
  if (!row.hidden) row.querySelector('input').focus();
}

// Edit or Remix opens the same notes field; remix posts to remix, edit to rerender.
function openNotes(btn, mode) {
  var row = btn.closest('tr').nextElementSibling;
  while (row && !row.classList.contains('notes-row')) row = row.nextElementSibling;
  if (!row) return;
  var open = row.hidden;
  row.hidden = !open;
  if (!open) return;
  var remix = mode === 'remix';
  var form = row.querySelector('.notes-form');
  if (form) form.action = remix ? btn.dataset.remixUrl : btn.dataset.editUrl;
  var input = row.querySelector('input[name="instructions"]');
  input.value = remix ? '' : (btn.dataset.notes || '');
  input.placeholder = remix
    ? 'Optional direction: faster, add a 303 line…'
    : 'How should it change? Slower, darker bass, more space…';
  var submit = row.querySelector('.notes-submit');
  if (submit) submit.textContent = remix ? 'Remix' : 'Edit';
  var hint = row.querySelector('.notes-hint');
  if (hint) hint.textContent = remix ? row.dataset.remixHint : row.dataset.editHint;
  input.focus();
}

// Swap opens the library songs that could take a set slot; typing searches.
function openSwap(btn) {
  var row = btn.closest('tr').nextElementSibling;
  while (row && !row.classList.contains('swap-row')) row = row.nextElementSibling;
  row.hidden = !row.hidden;
  if (row.hidden) return;
  var box = row.querySelector('.swap-results'), search = row.querySelector('.swap-search'), t;
  function load() {
    fetch(btn.dataset.options + '?q=' + encodeURIComponent(search.value), { credentials: 'same-origin' })
      .then(function(r) { return r.text(); }).then(function(html) { box.innerHTML = html; });
  }
  search.oninput = function() { clearTimeout(t); t = setTimeout(load, 250); };
  load();
  search.focus();
}

// The set player names the song the mix is on, marks its row and opens its
// takes. A song played on its own row is the song playing too.
function songStarts(table) {
  var at = 0;
  return Array.prototype.map.call(table.querySelectorAll('tr[data-track]'), function(row) {
    var cue = parseFloat(row.dataset.cue);
    var start = isNaN(cue) ? at : cue;
    at = start + (parseInt(row.dataset.ms, 10) || 0) / 1000;
    return { id: row.dataset.track, start: start };
  });
}
function showSong(id) {
  var player = document.querySelector('[data-set-player]');
  if (player && player.dataset.song !== id) {
    player.dataset.song = id;
    player.querySelectorAll('.sp-song').forEach(function(el) { el.hidden = el.dataset.track !== id; });
  }
  document.querySelectorAll('table.songs tr[data-track]').forEach(function(row) {
    row.classList.toggle('now', row.dataset.track === id);
  });
  var label = document.querySelector('[data-now-playing]');
  if (label) {
    var row = document.querySelector('table.songs tr[data-track="' + id + '"]');
    label.textContent = row && row.dataset.now ? row.dataset.now : '';
  }
}
function followMix(audio) {
  var table = document.querySelector('table.songs');
  if (!table) return;
  var starts = songStarts(table), t = audio.currentTime, now = starts[0];
  starts.forEach(function(s) { if (s.start <= t + 0.25) now = s; });
  if (now) showSong(now.id);
}
['timeupdate', 'seeked', 'play'].forEach(function(type) {
  document.addEventListener(type, function(e) {
    if (!e.target.matches || !e.target.matches('audio.show-mix')) return;
    if (type === 'play') { trackAudio.pause(); stopAll(); }
    followMix(e.target);
  }, true);
});
document.addEventListener('click', function(e) {
  var btn = e.target.closest && e.target.closest('table.songs tr[data-track] .btn-play');
  if (btn) showSong(btn.closest('tr').dataset.track);
});
// A table.sortable sorts by any titled column: press its header, press again
// to turn the order round. A cell's data-sort, when given, is what it sorts by.
function sortValue(row, i) {
  var cell = row.children[i];
  if (!cell) return '';
  return (cell.dataset.sort != null ? cell.dataset.sort : cell.textContent).trim();
}
function sortTable(th) {
  var table = th.closest('table'), head = th.parentElement, i = Array.prototype.indexOf.call(head.children, th);
  var asc = th.getAttribute('aria-sort') !== 'ascending';
  head.querySelectorAll('th').forEach(function(h) { h.removeAttribute('aria-sort'); });
  th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
  var rows = Array.prototype.filter.call(table.querySelectorAll('tr'), function(r) {
    return r !== head && !r.classList.contains('scrub-row') && r.closest('table') === table;
  });
  var values = rows.map(function(r) { return sortValue(r, i); });
  var numeric = values.every(function(v) { return v === '' || !isNaN(Number(v)); });
  var order = rows.map(function(r, n) { return n; }).sort(function(a, b) {
    var x = values[a], y = values[b];
    if (x === '' || y === '') return x === y ? a - b : (x === '' ? 1 : -1);
    var c = numeric ? Number(x) - Number(y) : x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true });
    return (asc ? c : -c) || a - b;
  });
  var body = rows[0] && rows[0].parentElement;
  order.forEach(function(n) { body.appendChild(rows[n]); });
  if (scrubRow && currentBtn && currentBtn.closest('table') === table) currentBtn.closest('tr').after(scrubRow);
}
// Run on load, and again when a generation page swaps in its finished state.
function initAdminTables() {
  var player = document.querySelector('[data-set-player]'), first = document.querySelector('table.songs tr[data-track]');
  if (player && first && !player.dataset.song) showSong(first.dataset.track);
  document.querySelectorAll('table.sortable tr:first-child th').forEach(function(th) {
    if (!th.textContent.trim() || th.querySelector('.th-sort')) return;
    var key = document.createElement('button');
    key.type = 'button';
    key.className = 'th-sort';
    key.textContent = th.textContent.trim();
    key.addEventListener('click', function() { sortTable(th); });
    th.textContent = '';
    th.appendChild(key);
  });
}
document.addEventListener('DOMContentLoaded', function() {
  initAdminTables();
  if (window.initTrackJobLoaders) window.initTrackJobLoaders();
});
