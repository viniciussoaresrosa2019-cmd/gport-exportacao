(() => {
  'use strict';

  const scene = document.getElementById('loginTerminalScene');
  const art = document.getElementById('loginTerminalArt');
  const trolley = document.getElementById('loginTerminalTrolley');
  const load = document.getElementById('loginTerminalLoad');
  const cables = document.querySelectorAll('#loginTerminalCables path');
  if (!scene || !art || !trolley || !load || !cables.length) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = 0;
  let last = null;
  let frame = null;
  // The preview's exact hold points: a 16s operation with stops at each end.
  const keyframes = [
    [0, 0, 0], [1, 0, 0], [4, 0, -62], [5, 0, -62],
    [8, 72, -62], [9, 72, -62], [12, 72, 8],
    [13, 72, 8], [15.5, 0, 0], [16, 0, 0]
  ];
  const ease = value => value * value * value * (value * (value * 6 - 15) + 10);

  const poseAt = seconds => {
    const time = ((seconds % 16) + 16) % 16;
    const index = keyframes.findIndex((frameData, frameIndex) => frameIndex && time <= frameData[0]);
    const initial = keyframes[Math.max(0, index - 1)];
    const final = keyframes[Math.max(1, index)];
    const progress = ease((time - initial[0]) / (final[0] - initial[0]));
    return { x: initial[1] + (final[1] - initial[1]) * progress, y: initial[2] + (final[2] - initial[2]) * progress };
  };

  const render = seconds => {
    const { x, y } = poseAt(seconds);
    const railY = x * .073;
    trolley.setAttribute('transform', `translate(${x} ${railY})`);
    load.setAttribute('transform', `translate(${x} ${y + railY})`);
    const cablePath = [[566, 346, 566, 445], [582, 350, 582, 444], [618, 355, 618, 447], [632, 355, 632, 446]]
      .map(([startX, startY, endX, endY]) => `M${startX + x},${startY + railY} L${endX + x},${endY + y + railY}`).join(' ');
    cables.forEach(cable => cable.setAttribute('d', cablePath));
    art.dataset.time = seconds.toFixed(3);
  };

  const animate = timestamp => {
    frame = null;
    if (reducedMotion.matches || document.hidden) { last = null; return; }
    if (last !== null) elapsed += Math.min((timestamp - last) / 1000, .1);
    last = timestamp;
    render(elapsed);
    frame = requestAnimationFrame(animate);
  };

  const schedule = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    last = null;
    if (!reducedMotion.matches && !document.hidden) frame = requestAnimationFrame(animate);
  };

  render(0);
  schedule();
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', schedule);
})();
