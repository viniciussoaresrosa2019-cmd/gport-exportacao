(() => {
  'use strict';

  const dialog = document.getElementById('loginDialog');
  const stage = document.getElementById('gportLoginStage');
  const cargo = document.getElementById('loginSuspendedCargo');
  const cables = document.getElementById('loginCargoCables');
  const journey = document.getElementById('loginJourneyPath');
  const traveller = document.getElementById('loginJourneyTraveller');
  if (!dialog || !stage || !cargo || !cables || !journey || !traveller) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const journeyLength = journey.getTotalLength();
  const degrees = Math.PI / 180;
  let startedAt = null;
  let frame = null;

  function cargoAnchor(x, y, shiftX, shiftY, angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return {
      x: 169 + (x - 169) * cosine - (y - 168) * sine + shiftX,
      y: 168 + (x - 169) * sine + (y - 168) * cosine + shiftY
    };
  }

  function render(now) {
    if (startedAt === null) startedAt = now;
    const seconds = (now - startedAt) / 1000;
    const slow = seconds * Math.PI * 2 / 12;
    const shiftX = Math.sin(slow) * .7;
    const shiftY = Math.sin(slow - .4) * 2.2;
    const angle = Math.sin(slow + .6) * .25;
    const left = cargoAnchor(153, 148, shiftX, shiftY, angle * degrees);
    const right = cargoAnchor(183, 148, shiftX, shiftY, angle * degrees);

    cargo.setAttribute('transform', `translate(${shiftX.toFixed(3)} ${shiftY.toFixed(3)}) rotate(${angle.toFixed(3)} 169 168)`);
    cables.setAttribute('d', `M169 99 L${left.x.toFixed(3)} ${left.y.toFixed(3)} M169 99 L${right.x.toFixed(3)} ${right.y.toFixed(3)}`);

    const point = journey.getPointAtLength((seconds % 8) / 8 * journeyLength);
    traveller.setAttribute('cx', point.x.toFixed(3));
    traveller.setAttribute('cy', point.y.toFixed(3));
    frame = requestAnimationFrame(render);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    startedAt = null;
    if (reducedMotion.matches) {
      cargo.removeAttribute('transform');
      cables.setAttribute('d', 'M169 99 L153 148 M169 99 L183 148');
    }
  }

  function sync() {
    if (reducedMotion.matches || document.hidden || !dialog.open) { stop(); return; }
    if (frame === null) frame = requestAnimationFrame(render);
  }

  stage.classList.add('ready');
  reducedMotion.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', sync);
  new MutationObserver(sync).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  sync();
})();
