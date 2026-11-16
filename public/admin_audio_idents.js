(() => {
  const token = document.querySelector('meta[name="csrf-token"]').content;
  const form = document.querySelector('.ident-maker');
  const state = form.querySelector('.maker-state');
  const keys = form.querySelectorAll('button');
  const WORDS = { queued: 'Queued', rendering: 'Rendering' };

  form.querySelectorAll('input[type="range"]').forEach((knob) => {
    const out = form.querySelector(`output[for="${knob.id}"]`);
    knob.addEventListener('input', () => { out.textContent = knob.value; });
  });

  function busy(on) {
    form.classList.toggle('busy', on);
    keys.forEach((key) => { key.disabled = on; });
  }

  async function follow(id, onDone) {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      let take;
      try {
        const response = await fetch(`${form.dataset.renders}/${id}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) continue;
        take = await response.json();
      } catch (error) {
        continue;
      }
      if (take.status === 'done' || take.status === 'failed') return onDone(take);
      state.textContent = WORDS[take.status] || '';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const preview = event.submitter && event.submitter.hasAttribute('data-preview');
    const body = new FormData(form);
    body.set('ident_render[preview]', preview ? '1' : '0');
    busy(true);
    state.classList.remove('is-error');
    state.textContent = 'Queued';
    let take;
    try {
      const response = await fetch(form.dataset.renders, {
        method: 'POST', body, headers: { 'X-CSRF-Token': token, Accept: 'application/json' },
      });
      take = await response.json();
      if (!response.ok) throw new Error(take.error || `failed: ${response.status}`);
    } catch (error) {
      busy(false);
      state.classList.add('is-error');
      state.textContent = error.message;
      return;
    }
    follow(take.id, (done) => {
      if (done.status === 'failed') {
        busy(false);
        state.classList.add('is-error');
        state.textContent = done.error || 'Failed';
      } else if (done.preview) {
        busy(false);
        state.textContent = '';
        stopAll();
        trackAudio.src = done.audio;
        trackAudio.play().catch(() => { state.textContent = 'Press Preview again'; });
      } else {
        window.location.reload();
      }
    });
  });

  // A line still being voiced from an earlier visit: the list refreshes when it lands.
  document.querySelectorAll('[data-render-status="queued"], [data-render-status="rendering"]').forEach((row) => {
    follow(row.dataset.renderRow, () => window.location.reload());
  });

  // Delete asks once, on the key itself.
  document.addEventListener('click', (event) => {
    const key = event.target.closest('[data-sure]');
    if (!key || key.dataset.sure === 'yes') return;
    event.preventDefault();
    key.dataset.sure = 'yes';
    key.textContent = 'Sure?';
    key.classList.add('is-sure');
  });
})();
