(() => {
  const token = document.querySelector('meta[name="csrf-token"]').content;

  document.querySelectorAll('.switch input').forEach((input) => {
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

  // One preview at a time, in its own row, across pictures and clips.
  let preview = null;
  let key = null;

  function closePreview() {
    if (!preview) return;
    preview.remove();
    preview = null;
    key.classList.remove('playing');
    key.textContent = '▶';
    key = null;
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.btn-play');
    if (!button) return;
    const again = button === key;
    closePreview();
    if (button.dataset.src || again) return;
    trackAudio.pause();
    stopAll();
    key = button;
    key.classList.add('playing');
    key.textContent = '■';
    preview = document.createElement('iframe');
    preview.title = 'Ident preview';
    preview.scrolling = 'no';
    preview.tabIndex = -1;
    preview.src = button.dataset.identSrc;
    button.closest('tr').querySelector('.ident-stage').append(preview);
  });

  window.addEventListener('message', (event) => {
    if (preview && event.source === preview.contentWindow && event.data === 'ident-done') closePreview();
  });
})();
