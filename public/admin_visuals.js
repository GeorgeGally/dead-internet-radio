(() => {
  const token = document.querySelector('meta[name="csrf-token"]').content;
  const inputs = Array.from(document.querySelectorAll('.switch input'));
  const allOff = document.querySelector('.all-off');
  const paintAllOff = () => { allOff.hidden = inputs.some((input) => input.checked); };
  paintAllOff();

  inputs.forEach((input) => {
    input.addEventListener('change', async () => {
      const row = input.closest('tr');
      const paint = () => {
        row.classList.toggle('is-off', !input.checked);
        paintAllOff();
      };
      paint();

      try {
        const response = await fetch(`/admin/visuals/${input.dataset.visualId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token,
            Accept: 'application/json',
          },
          body: JSON.stringify({ visual_module: { active: input.checked } }),
        });
        if (!response.ok) throw new Error(`save failed: ${response.status}`);
      } catch (error) {
        input.checked = !input.checked;
        paint();
      }
    });
  });

  const nameCells = Array.from(document.querySelectorAll('.name-cell'));
  nameCells.forEach((cell) => {
    let saved = cell.dataset.name;
    const restore = () => { cell.textContent = saved; };
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        cell.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        restore();
        cell.blur();
      }
    });
    cell.addEventListener('blur', async () => {
      const name = cell.textContent.replace(/\s+/g, ' ').trim();
      if (!name || name === saved) {
        restore();
        return;
      }
      cell.textContent = name;
      try {
        const response = await fetch(`/admin/visuals/${cell.dataset.visualId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token,
            Accept: 'application/json',
          },
          body: JSON.stringify({ visual_module: { name } }),
        });
        if (!response.ok) throw new Error(`save failed: ${response.status}`);
        saved = name;
        cell.dataset.name = name;
      } catch (error) {
        restore();
      }
    });
  });

  const looksCall = (path, method, body) => fetch(`/api/v1/looks/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: body ? JSON.stringify(body) : undefined,
  });

  const slotButton = (artwork, slot) => {
    const name = document.querySelector(`[data-looks="${artwork}"]`).closest('tr').querySelector('.name-cell').dataset.name;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'look-slot';
    button.dataset.artwork = artwork;
    button.dataset.slot = slot;
    button.setAttribute('aria-label', `Reset ${name} slot ${slot}`);
    button.textContent = slot;
    return button;
  };

  document.querySelector('.visuals').addEventListener('click', async (event) => {
    const button = event.target.closest('.look-slot');
    if (!button) return;
    const { artwork, slot } = button.dataset;
    if (!window.confirm(`Reset ${artwork} slot ${slot}?`)) return;
    const response = await looksCall(`${artwork}/${slot}`, 'DELETE');
    if (response.ok) button.remove();
  });

  // The box opens on this browser's old looks, ready to carry to another address.
  const json = document.getElementById('looks-json');
  const result = document.getElementById('looks-result');
  try {
    json.value = localStorage.getItem('visual-slot-presets') || localStorage.getItem('visual-slot-presets-sent') || '';
  } catch (error) {}

  document.getElementById('looks-import').addEventListener('click', async () => {
    let looks;
    try {
      looks = JSON.parse(json.value);
    } catch (error) {
      result.textContent = 'Not valid JSON';
      return;
    }
    const response = await looksCall('merge', 'POST', { looks });
    if (!response.ok) {
      result.textContent = 'Not imported';
      return;
    }
    const merged = await response.json();
    result.textContent = `${merged.added} added, ${merged.moved} moved, ${merged.present} already here, ${merged.left_out} left out`;
    document.querySelectorAll('[data-looks]').forEach((cell) => {
      const slots = Object.keys(merged.looks[cell.dataset.looks] || {});
      cell.replaceChildren(...slots.map((slot) => slotButton(cell.dataset.looks, slot)));
    });
  });
})();
