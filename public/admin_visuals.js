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
})();
