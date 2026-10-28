// Admin track player: a row's play key (.btn-play, data-src) plays it and
// pressing again stops; the playing row gets a scrub bar in its [data-scrub] cell.
var trackAudio = new Audio();
var scrub = document.createElement('div');
scrub.className = 'scrub';
scrub.innerHTML = '<div class="scrub-bar"><div class="scrub-fill"></div></div><span class="scrub-time"></span>';
var fill = scrub.querySelector('.scrub-fill'), time = scrub.querySelector('.scrub-time');

function fmt(t) { t = Math.floor(t || 0); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
trackAudio.addEventListener('timeupdate', function() {
  var d = trackAudio.duration || 0;
  fill.style.width = d ? (trackAudio.currentTime / d * 100) + '%' : '0';
  time.textContent = fmt(trackAudio.currentTime) + ' / ' + fmt(d);
});

var bar = scrub.querySelector('.scrub-bar');
function seek(e) {
  var r = bar.getBoundingClientRect();
  if (trackAudio.duration) trackAudio.currentTime = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * trackAudio.duration;
}
bar.addEventListener('pointerdown', function(e) { bar.setPointerCapture(e.pointerId); seek(e); });
bar.addEventListener('pointermove', function(e) { if (e.buttons) seek(e); });

function stopAll() {
  document.querySelectorAll('.btn-play').forEach(function(b) { b.classList.remove('playing'); b.textContent = '\u25B6'; });
  scrub.remove();
}
function playTrack(btn) {
  var playing = btn.classList.contains('playing');
  stopAll();
  document.querySelectorAll('audio.show-mix').forEach(function(a) { a.pause(); });
  if (playing) { trackAudio.pause(); return; }
  trackAudio.src = btn.dataset.src;
  trackAudio.play();
  btn.classList.add('playing');
  btn.textContent = '\u25A0';
  fill.style.width = '0';
  time.textContent = '';
  var row = btn.closest('tr');
  (row.querySelector('[data-scrub]') || row.children[1]).appendChild(scrub);
}
trackAudio.addEventListener('ended', stopAll);

// Re-render opens a notes field under its track.
function openRerender(btn) {
  var row = btn.closest('tr').nextElementSibling;
  while (row && !row.classList.contains('rerender-row')) row = row.nextElementSibling;
  row.hidden = !row.hidden;
  if (!row.hidden) row.querySelector('input').focus();
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
