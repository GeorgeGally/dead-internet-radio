// Thumbs on the song on air: + for more like this, − for not for me. No
// sign-in; the server knows this browser by a cookie. Pressing the lit key
// again takes the vote back. The lights remember this browser's votes.
const votes = (() => {
  const KEY = 'dir-votes';
  let songId = null;
  let mine = {};
  try { mine = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) {}

  const up = document.getElementById('btn-vote-up');
  const down = document.getElementById('btn-vote-down');
  const upLed = document.getElementById('vote-up-led');
  const downLed = document.getElementById('vote-down-led');

  function paint() {
    const v = songId ? mine[songId] || 0 : 0;
    if (upLed) upLed.classList.toggle('on', v === 1);
    if (downLed) downLed.classList.toggle('on', v === -1);
    if (up) up.disabled = !songId;
    if (down) down.disabled = !songId;
  }

  // Called by the player whenever the song changes. Openings have no songId.
  function show(track) {
    songId = track && track.songId ? String(track.songId) : null;
    paint();
  }

  async function cast(value) {
    if (!songId) return;
    const id = songId;
    const next = mine[id] === value ? 0 : value;
    const before = mine[id] || 0;
    mine[id] = next;
    paint();
    try {
      const res = await fetch(`/api/v1/songs/${id}/vote`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: next }),
      });
      if (!res.ok) throw new Error(res.status);
    } catch (_) {
      mine[id] = before;
    }
    if (!mine[id]) delete mine[id];
    try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch (_) {}
    paint();
  }

  if (up) up.addEventListener('click', () => cast(1));
  if (down) down.addEventListener('click', () => cast(-1));
  // The player may already be on a song by the time this loads.
  if (typeof playlist !== 'undefined' && playlist && playlist.tracks) show(playlist.tracks[currentTrack]);
  else paint();

  return { show };
})();
