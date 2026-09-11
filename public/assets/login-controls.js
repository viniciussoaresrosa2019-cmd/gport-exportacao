(() => {
  'use strict';
  const dialog = document.getElementById('loginDialog');
  const stage = document.getElementById('gportLoginStage');
  const access = dialog?.querySelector('.login-access-layer');
  const password = document.getElementById('loginPassword');
  const toggle = document.getElementById('loginPasswordToggle');
  if (!dialog || !stage || !access || !password || !toggle) return;

  dialog.addEventListener('cancel', event => event.preventDefault());
  toggle.addEventListener('click', () => {
    const visible = password.type === 'text';
    password.type = visible ? 'password' : 'text';
    toggle.setAttribute('aria-pressed', String(!visible));
    toggle.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
    password.focus();
  });

  const portrait = matchMedia('(max-width: 640px) and (orientation: portrait)');
  const syncTurnstileScale = () => {
    const reference = portrait.matches ? access : stage;
    const referenceWidth = portrait.matches ? 580 : 1672;
    const scale = Math.max(portrait.matches ? .68 : .5, reference.getBoundingClientRect().width / referenceWidth);
    dialog.style.setProperty('--login-turnstile-scale', String(scale));
  };
  new ResizeObserver(syncTurnstileScale).observe(stage);
  new ResizeObserver(syncTurnstileScale).observe(access);
  portrait.addEventListener('change', syncTurnstileScale);
  syncTurnstileScale();
})();
