'use strict';

// A silent runway loop, cover-fit. The file has no audio track; the element
// stays muted so the browser will still autoplay it.
visuals.register('catwalk', (() => {
  let myP5 = null;
  let video = null;

  function discardVideo() {
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    video = null;
  }

  function makeVideo() {
    const v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('aria-hidden', 'true');
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    v.src = 'visuals/media/catwalk.mp4';
    v.addEventListener('canplay', () => { if (video === v) v.play().catch(() => {}); });
    document.body.appendChild(v);
    v.play().catch(() => {});
    return v;
  }

  function drawCover(p) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return false;
    const d = p.pixelDensity();
    const scale = Math.max(p.width / vw, p.height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const ctx = p.drawingContext;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(video, ((p.width - dw) / 2) * d, ((p.height - dh) / 2) * d, dw * d, dh * d);
    ctx.restore();
    return true;
  }

  function start() {
    ['block-canvas', 'gif-bg', 'overlay-canvas'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    discardVideo();
    video = makeVideo();
    myP5 = new p5((p) => {
      p.setup = () => {
        visuals.setupP5Canvas(p);
        p.background(0);
      };
      p.draw = () => {
        if (!video || video.readyState < 2 || !drawCover(p)) p.background(0);
        canvasFilters.applyToP5(p);
      };
    });
  }

  function stop() {
    discardVideo();
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Catwalk', start, stop };
})());
