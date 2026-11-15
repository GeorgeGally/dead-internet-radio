// Polls .track-job-loader elements: same progress JSON as the generation job page.
(function() {
  var clocks = [];

  function elapsed(since) {
    var s = Math.max(0, Math.floor((Date.now() - since) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return (h ? h + ':' + pad(m) : m) + ':' + pad(s % 60);
  }

  function kindLabel(kind) {
    if (kind === 'remix') return 'Remixing';
    if (kind === 'rerender') return 'Editing';
    return 'Rendering';
  }

  function trackPct(p) {
    var t = (p.tracks || {})['1'] || {};
    if (p.fraction != null) return Math.min(95, Math.round(p.fraction * 100));
    if (t.elapsed_s != null) {
      var est = t.estimated_s > 0 ? t.estimated_s : 240;
      return Math.min(95, Math.round(t.elapsed_s / est * 100));
    }
    return null;
  }

  function applyLoader(el, p) {
    var fill = el.querySelector('.js-track-job-fill');
    var bar = el.querySelector('.loader-bar');
    var stage = el.querySelector('.js-track-job-stage');
    var kind = el.dataset.kind || p.kind;
    if (p.status === 'failed') {
      el.classList.add('track-job-failed');
      if (bar) bar.classList.remove('loader-sweep');
      if (fill) fill.style.width = '100%';
      if (stage) stage.textContent = p.error || 'Failed — open job for details';
      return;
    }
    if (p.status === 'done' || p.complete) {
      location.reload();
      return;
    }
    var pct = trackPct(p);
    if (bar) bar.classList.toggle('loader-sweep', pct == null);
    if (fill && pct != null) fill.style.width = pct + '%';
    if (stage) {
      var label = kindLabel(kind);
      if (p.stage) stage.textContent = label + ' · ' + p.stage;
      else if (pct != null) stage.textContent = label + ' · ' + pct + '%';
      else stage.textContent = label + '…';
    }
    if (p.since) el.dataset.since = p.since;
  }

  function tick(el) {
    fetch(el.dataset.progress, { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(p) {
        applyLoader(el, p);
        if (!el.classList.contains('track-job-failed') && p.status !== 'done' && !p.complete) {
          setTimeout(function() { tick(el); }, 2500);
        }
      })
      .catch(function() { setTimeout(function() { tick(el); }, 5000); });
  }

  function startClocks() {
    clocks.forEach(clearInterval);
    clocks = [];
    document.querySelectorAll('.track-job-loader').forEach(function(el) {
      var clockEl = el.querySelector('.js-track-job-clock');
      if (!clockEl) return;
      var show = function() {
        var since = Date.parse(el.dataset.since);
        if (!isNaN(since)) clockEl.textContent = elapsed(since);
      };
      show();
      clocks.push(setInterval(show, 1000));
      tick(el);
    });
  }

  document.addEventListener('DOMContentLoaded', startClocks);
  window.initTrackJobLoaders = startClocks;
})();