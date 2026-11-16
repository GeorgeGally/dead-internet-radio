(() => {
  const token = document.querySelector('meta[name="csrf-token"]').content;

  document.querySelectorAll('.switch input[data-ident-id]').forEach((input) => {
    input.addEventListener('change', async () => {
      const row = input.closest('tr');
      const paint = () => row.classList.toggle('is-off', !input.checked);
      paint();
      try {
        const response = await fetch(`/admin/idents/${input.dataset.identId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token, Accept: 'application/json' },
          body: JSON.stringify({ station_ident: { active: input.checked } }),
        });
        if (!response.ok) throw new Error(`save failed: ${response.status}`);
      } catch (error) {
        input.checked = !input.checked;
        paint();
      }
    });
  });

  // A picture ident plays full screen, as it airs. Esc, a click or its own
  // end brings the list back.
  let stage = null;

  function close() {
    if (!stage) return;
    const leaving = stage;
    stage = null;
    if (document.fullscreenElement === leaving) document.exitFullscreen().catch(() => {});
    leaving.remove();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.btn-play[data-ident-src]');
    if (!button) return;
    close();
    trackAudio.pause();
    stopAll();
    stage = document.createElement('div');
    stage.className = 'ident-full';
    const frame = document.createElement('iframe');
    frame.title = 'Ident';
    frame.scrolling = 'no';
    frame.tabIndex = -1;
    frame.src = button.dataset.identSrc;
    stage.append(frame);
    stage.addEventListener('click', close);
    document.body.append(stage);
    if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
  });

  document.addEventListener('fullscreenchange', () => {
    if (stage && !document.fullscreenElement) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  window.addEventListener('message', (event) => {
    if (stage && event.source === stage.firstChild.contentWindow && event.data === 'ident-done') close();
  });
})();
