// Show page: play the mix, or each track in order, with pause, scrub and time.
(function() {
  var root = document.querySelector('[data-show-player]');
  var data = document.getElementById('show-player-sources');
  if (!root || !data) return;
  var sources = JSON.parse(data.textContent);
  if (!sources.length) return;

  var audio = new Audio();
  var btn = root.querySelector('[data-show-play]');
  var bar = root.querySelector('[data-show-bar]');
  var fill = root.querySelector('[data-show-fill]');
  var time = root.querySelector('[data-show-time]');
  var mix = sources.length === 1 && sources[0].id == null;
  var index = 0;
  var offset = 0;
  var token = 0;

  function fmt(t) {
    t = Math.floor(t || 0);
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }
  function segMs(i) {
    var s = sources[i];
    if (!s) return 0;
    if (s.ms > 0) return s.ms;
    if (i === index && isFinite(audio.duration) && audio.duration > 0) return Math.round(audio.duration * 1000);
    return 0;
  }
  function totalMs() {
    var n = 0;
    for (var i = 0; i < sources.length; i++) n += segMs(i);
    return n;
  }
  function positionMs() {
    var n = 0;
    for (var i = 0; i < index; i++) n += segMs(i);
    var into = audio.dataset.src ? audio.currentTime * 1000 : offset * 1000;
    return n + into;
  }
  function songAt(t) {
    var rows = document.querySelectorAll('table.songs tr[data-track]');
    var at = 0, id = null;
    rows.forEach(function(row) {
      var cue = parseFloat(row.dataset.cue);
      var start = isNaN(cue) ? at : cue;
      at = start + (parseInt(row.dataset.ms, 10) || 0) / 1000;
      if (start <= t + 0.25) id = row.dataset.track;
    });
    return id;
  }
  function clearMark() {
    root.dataset.current = '';
    document.querySelectorAll('table.songs tr.now').forEach(function(row) { row.classList.remove('now'); });
  }
  function mark(id) {
    var key = id == null ? '' : String(id);
    if (root.dataset.current === key) return;
    root.dataset.current = key;
    document.querySelectorAll('table.songs tr.now').forEach(function(row) { row.classList.remove('now'); });
    if (!key) return;
    var row = document.querySelector("table.songs tr[data-track='" + key + "']");
    if (!row) return;
    row.classList.add('now');
    if (btn.classList.contains('playing')) row.scrollIntoView({ block: 'nearest' });
  }
  function paint() {
    var total = totalMs();
    var pos = positionMs();
    var ratio = total ? Math.min(pos / total, 1) : 0;
    fill.style.width = (ratio * 100) + '%';
    bar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    bar.setAttribute('aria-valuetext', fmt(pos / 1000));
    time.textContent = fmt(pos / 1000) + ' / ' + fmt(total / 1000);
    var started = btn.classList.contains('playing') || index > 0 || audio.currentTime > 0.05;
    if (!started) { clearMark(); return; }
    mark(mix ? songAt(audio.currentTime || 0) : sources[index] && sources[index].id);
  }
  function failed(msg) {
    fill.style.width = '0';
    time.textContent = msg;
    btn.classList.remove('playing');
    btn.textContent = '\u25B6';
    btn.setAttribute('aria-label', 'Play');
  }
  function load(autoplay) {
    var s = sources[index];
    if (!s) return;
    var my = ++token;
    var want = offset;
    offset = 0;
    if (audio.dataset.src === s.src && audio.readyState >= 1) {
      if (want > 0 && isFinite(audio.duration)) audio.currentTime = Math.min(want, audio.duration);
      if (autoplay) start();
      paint();
      return;
    }
    audio.preload = 'auto';
    audio.dataset.src = s.src;
    audio.src = s.src;
    if (autoplay) start();
    audio.addEventListener('loadedmetadata', function once() {
      audio.removeEventListener('loadedmetadata', once);
      if (my !== token) return;
      if (want > 0 && isFinite(audio.duration)) audio.currentTime = Math.min(want, audio.duration);
      if (autoplay && audio.paused) start();
      paint();
    });
  }
  function start() {
    var played = audio.play();
    if (played && played.catch) played.catch(function() { failed('Press play again'); });
  }
  function play() {
    if (typeof stopAll === 'function') stopAll();
    document.querySelectorAll('audio.show-mix').forEach(function(el) { el.pause(); });
    btn.classList.add('playing');
    btn.textContent = '\u25A0';
    btn.setAttribute('aria-label', 'Pause');
    if (audio.dataset.src) { start(); paint(); }
    else load(true);
  }
  function pause() {
    audio.pause();
    btn.classList.remove('playing');
    btn.textContent = '\u25B6';
    btn.setAttribute('aria-label', 'Play');
    paint();
  }

  btn.addEventListener('click', function() {
    if (btn.classList.contains('playing')) pause();
    else play();
  });
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('durationchange', function() {
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    var ms = Math.round(audio.duration * 1000);
    if (mix) sources[0].ms = ms;
    else if (sources[index]) sources[index].ms = ms;
    paint();
  });
  audio.addEventListener('ended', function() {
    if (!mix && index < sources.length - 1) {
      index += 1;
      offset = 0;
      load(true);
      return;
    }
    index = 0;
    offset = 0;
    token += 1;
    audio.pause();
    audio.removeAttribute('src');
    delete audio.dataset.src;
    audio.load();
    btn.classList.remove('playing');
    btn.textContent = '\u25B6';
    btn.setAttribute('aria-label', 'Play');
    clearMark();
    paint();
  });
  audio.addEventListener('error', function() {
    var mine = token;
    setTimeout(function() {
      if (mine !== token || !audio.error) return;
      failed('Can\u2019t play this file');
    }, 0);
  });

  function seekTo(ms) {
    var acc = 0, i = 0;
    for (; i < sources.length - 1; i++) {
      var len = segMs(i);
      if (len <= 0 || acc + len > ms) break;
      acc += len;
    }
    index = i;
    var into = Math.max(0, (ms - acc) / 1000);
    var src = sources[i].src;
    var playing = btn.classList.contains('playing');
    if (audio.dataset.src === src && audio.readyState >= 1) {
      audio.currentTime = isFinite(audio.duration) ? Math.min(into, audio.duration) : into;
      paint();
      return;
    }
    offset = into;
    load(playing);
  }
  function seek(e) {
    var total = totalMs();
    if (!total) return;
    var rect = bar.getBoundingClientRect();
    if (!rect.width) return;
    var ms = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * total;
    seekTo(ms);
  }
  bar.addEventListener('pointerdown', function(e) { bar.setPointerCapture(e.pointerId); seek(e); });
  bar.addEventListener('pointermove', function(e) { if (e.buttons) seek(e); });

  document.addEventListener('click', function(e) {
    var other = e.target.closest && e.target.closest('.btn-play');
    if (!other || other === btn) return;
    audio.pause();
    btn.classList.remove('playing');
    btn.textContent = '\u25B6';
    btn.setAttribute('aria-label', 'Play');
    clearMark();
  }, true);

  if (mix) {
    audio.preload = 'metadata';
    audio.dataset.src = sources[0].src;
    audio.src = sources[0].src;
  }
  paint();
})();
