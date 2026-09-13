(() => {
  'use strict';

  const dialog = document.getElementById('loginDialog');
  const card = dialog?.querySelector('.login-card');
  const password = document.getElementById('loginPassword');
  const toggle = document.getElementById('loginPasswordToggle');
  if (!dialog || !card || !password || !toggle) return;

  dialog.addEventListener('cancel', event => event.preventDefault());
  toggle.addEventListener('click', () => {
    const visible = password.type === 'text';
    password.type = visible ? 'password' : 'text';
    toggle.setAttribute('aria-pressed', String(!visible));
    toggle.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
    password.focus();
  });

  const syncTurnstileScale = () => {
    const available = Math.max(0, card.clientWidth - 32);
    const scale = Math.min(1, Math.max(.72, available / 300));
    dialog.style.setProperty('--login-turnstile-scale', String(scale));
  };

  new ResizeObserver(syncTurnstileScale).observe(card);
  syncTurnstileScale();
})();
