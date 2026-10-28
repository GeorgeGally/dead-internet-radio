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

// Edit or Remix opens the same notes field, prefilled or empty.
function openNotes(btn, mode) {
  var row = btn.closest('tr').nextElementSibling;
  while (row && !row.classList.contains('notes-row')) row = row.nextElementSibling;
  if (!row) return;
  var open = row.hidden;
  row.hidden = !open;
  if (!open) return;
  var input = row.querySelector('input[name="instructions"]');
  input.value = mode === 'remix' ? '' : (btn.dataset.notes || '');
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
