'use strict';

(() => {
  const sounds = {};

  document.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const button = event.target.closest('button');
    if (!button || button.matches(':disabled, [aria-disabled="true"]') || button.closest('[inert]')) return;
    const player = document.getElementById('player');
    if (player && (player.muted || player.volume === 0)) return;

    try {
      const sample = button.matches('.abtn') ? 'switch-1' : 'switch-4';
      const sound = sounds[sample] ||= new Audio(`sounds/${sample}.mp3`);
      sound.currentTime = 0;
      sound.play().catch(() => {});
    } catch (e) {}
  }, true);
})();
