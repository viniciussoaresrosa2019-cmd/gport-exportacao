(() => {
  'use strict';

  const canvas = document.querySelector('.login-wave-overlay');
  if (!canvas) return;

  const context = canvas.getContext('2d');
  const foregroundCanvas = document.querySelector('.login-ship-waterline');
  const foregroundContext = foregroundCanvas?.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // Each crest lives on its own clock. It fades in, rises, breaks into a short highlight
  // and disappears before returning at a different depth of the water.
  const wavelets = Array.from({ length: 46 }, (_, index) => ({
    y: .31 + ((index * 37) % 63) / 100,
    x: ((index * 61) % 101) / 100,
    length: 34 + (index * 19) % 98,
    amplitude: 1.8 + (index * 11) % 7,
    drift: .014 + (index % 7) * .0022,
    duration: 3400 + (index * 613) % 5100,
    offset: -(index * 947) % 8500,
    phase: index * 1.73,
    alpha: .19 + (index % 6) * .038,
    width: .55 + (index % 4) * .2
  }));
  // These are transparent, short crests that cross only the ship's keel. Unlike
  // a second raster image, they cannot introduce a rectangular background seam.
  const hullWavelets = Array.from({ length: 19 }, (_, index) => ({
    x: ((index * 43) % 103) / 100,
    y: .32 + ((index * 17) % 52) / 100,
    length: 26 + (index * 13) % 76,
    amplitude: 2.2 + (index * 7) % 5,
    drift: .012 + (index % 5) * .002,
    duration: 3900 + (index * 509) % 4300,
    offset: -(index * 719) % 7700,
    phase: index * 1.21,
    alpha: .16 + (index % 5) * .026
  }));
  let frame = 0;
  let visible = !document.hidden;

  const sizeCanvas = (target, targetContext) => {
    if (!target || !targetContext) return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    target.width = Math.max(1, Math.round(rect.width * ratio));
    target.height = Math.max(1, Math.round(rect.height * ratio));
    targetContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const resize = () => {
    sizeCanvas(canvas, context);
    sizeCanvas(foregroundCanvas, foregroundContext);
  };

  const drawHullWaterline = time => {
    if (!foregroundCanvas || !foregroundContext) return;
    const { width, height } = foregroundCanvas.getBoundingClientRect();
    foregroundContext.clearRect(0, 0, width, height);
    foregroundContext.lineCap = 'round';
    hullWavelets.forEach(wave => {
      const cycle = (((time + wave.offset) % wave.duration) + wave.duration) % wave.duration / wave.duration;
      const life = Math.pow(Math.sin(cycle * Math.PI), 1.18);
      const x = ((wave.x * width + time * wave.drift) % (width + wave.length * 2)) - wave.length;
      const y = height * wave.y + Math.sin(time * .00027 + wave.phase) * 1.8;
      const crest = wave.amplitude * (1 + Math.sin(time * .00039 + wave.phase) * .2);
      foregroundContext.beginPath();
      foregroundContext.moveTo(x, y);
      foregroundContext.bezierCurveTo(x + wave.length * .2, y - crest, x + wave.length * .64, y - crest * .88, x + wave.length, y + crest * .14);
      foregroundContext.strokeStyle = `rgba(53, 103, 134, ${wave.alpha * life})`;
      foregroundContext.lineWidth = .6 + (wave.amplitude * .08);
      foregroundContext.stroke();
      if (life > .38) {
        foregroundContext.beginPath();
        foregroundContext.moveTo(x + wave.length * .26, y - crest * .42);
        foregroundContext.quadraticCurveTo(x + wave.length * .43, y - crest * .78, x + wave.length * .61, y - crest * .38);
        foregroundContext.strokeStyle = `rgba(111, 156, 181, ${wave.alpha * life * .62})`;
        foregroundContext.lineWidth = .55;
        foregroundContext.stroke();
      }
    });
  };

  const draw = time => {
    frame = 0;
    if (reducedMotion.matches || !visible) {
      canvas.dataset.waveMotion = reducedMotion.matches ? 'reduced' : 'paused';
      return;
    }
    const { width, height } = canvas.getBoundingClientRect();
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    wavelets.forEach(wave => {
      const cycle = (((time + wave.offset) % wave.duration) + wave.duration) % wave.duration / wave.duration;
      const life = Math.pow(Math.sin(cycle * Math.PI), 1.35);
      const x = ((wave.x * width + time * wave.drift) % (width + wave.length * 2)) - wave.length;
      const y = height * wave.y + Math.sin(time * .00023 + wave.phase) * wave.amplitude * .18;
      const crest = wave.amplitude * (1 + Math.sin(time * .00037 + wave.phase) * .14);
      context.beginPath();
      context.moveTo(x, y);
      context.bezierCurveTo(
        x + wave.length * .22, y - crest,
        x + wave.length * .63, y - crest * .78,
        x + wave.length, y + crest * .12
      );
      context.strokeStyle = `rgba(67, 113, 144, ${wave.alpha * life})`;
      context.lineWidth = wave.width;
      context.stroke();
      if (life > .22) {
        const glintStart = x + wave.length * (.24 + cycle * .18);
        context.beginPath();
        context.moveTo(glintStart, y - crest * .5);
        context.quadraticCurveTo(glintStart + wave.length * .18, y - crest * .9, glintStart + wave.length * .34, y - crest * .42);
        context.strokeStyle = `rgba(112, 166, 197, ${wave.alpha * life * .92})`;
        context.lineWidth = Math.max(.5, wave.width * .7);
        context.stroke();
      }
    });
    drawHullWaterline(time);
    canvas.dataset.waveMotion = 'running';
    frame = requestAnimationFrame(draw);
  };

  const restart = () => {
    cancelAnimationFrame(frame);
    resize();
    if (reducedMotion.matches) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      foregroundContext?.clearRect(0, 0, foregroundCanvas.width, foregroundCanvas.height);
      canvas.dataset.waveMotion = 'reduced';
      return;
    }
    frame = requestAnimationFrame(draw);
  };

  new ResizeObserver(restart).observe(canvas);
  if (foregroundCanvas) new ResizeObserver(restart).observe(foregroundCanvas);
  reducedMotion.addEventListener('change', restart);
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) restart();
    else cancelAnimationFrame(frame);
  });
  restart();
})();
