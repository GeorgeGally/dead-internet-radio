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
})();
