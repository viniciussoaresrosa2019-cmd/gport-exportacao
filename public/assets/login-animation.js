(() => {
  'use strict';

  const stage = document.getElementById('gportLoginStage');
  const dialog = document.getElementById('loginDialog');
  const ship = document.getElementById('ship');
  const cargo = document.getElementById('cargo');
  const cable = document.getElementById('cable');
  const traveller = document.getElementById('traveller');
  const route = document.getElementById('route');
  const button = document.getElementById('pause');
  if (!stage || !dialog || !ship || !cargo || !cable || !traveller || !route || !button) return;

  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const params = new URLSearchParams(location.search);
  const requestedFrame = Number(params.get('frame'));
  const reviewTime = params.has('frame') && Number.isFinite(requestedFrame) ? Math.max(0, requestedFrame) : null;
  const auditing = params.has('audit');
  let paused = preference.matches;
  let elapsed = 0;
  let last = null;
  let raf = null;
  let routeLength = 0;

  function render(seconds) {
    const state = window.GportMotion.at(seconds);
    ship.setAttribute('transform', `translate(${state.shipX} ${state.shipY})`);
    cargo.setAttribute('transform', `translate(${state.cargoX} ${state.cargoY}) rotate(${state.cargoAngle} 688.5 612)`);
    cable.setAttribute('d', `M687 562 L${687 + state.cargoX} ${610 + state.cargoY} M690 562 L${690 + state.cargoX} ${610 + state.cargoY}`);
    const point = route.getPointAtLength(state.routeProgress * routeLength);
    traveller.setAttribute('transform', `translate(${point.x} ${point.y})`);
    traveller.setAttribute('opacity', state.routeOpacity);
    if (auditing) {
      stage.dataset.time = seconds.toFixed(4);
      stage.dataset.loop = state.time.toFixed(4);
    }
  }

  function stop() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    last = null;
  }

  function start() {
    if (!paused && !document.hidden && dialog.open && reviewTime === null && raf === null) raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    raf = null;
    if (paused || document.hidden) return;
    if (last !== null) elapsed += (now - last) / 1000;
    last = now;
    const before = performance.now();
    render(elapsed);
    if (auditing) {
      stage.dataset.frames = String(Number(stage.dataset.frames || 0) + 1);
      stage.dataset.maxRenderMs = Math.max(Number(stage.dataset.maxRenderMs || 0), performance.now() - before).toFixed(3);
    }
    raf = requestAnimationFrame(tick);
  }

  function updateButton() {
    button.textContent = paused ? 'Reproduzir animação' : 'Pausar animação';
    button.setAttribute('aria-pressed', String(paused));
  }

  function setPaused(value) {
    paused = value;
    stop();
    updateButton();
    start();
  }

  try {
    if (!window.GPORT_ROUTE || !window.GportMotion) throw new Error('Dados da animação indisponíveis.');
    route.setAttribute('d', window.GPORT_ROUTE);
    routeLength = route.getTotalLength();
    render(reviewTime === null ? 0 : reviewTime);
    stage.classList.add('ready');
  } catch (error) {
    button.disabled = true;
    button.textContent = 'Animação indisponível';
    console.error(error);
  }

  button.addEventListener('click', () => setPaused(!paused));
  preference.addEventListener('change', event => setPaused(event.matches));
  document.addEventListener('visibilitychange', () => { stop(); start(); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  new MutationObserver(() => { stop(); start(); }).observe(dialog, { attributes:true, attributeFilter:['open'] });
  updateButton();
  start();
})();
