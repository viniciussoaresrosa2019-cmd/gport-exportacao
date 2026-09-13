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

  const widget = document.getElementById('turnstileWidget');
  const syncTurnstileSize = () => {
    if (!widget || !card.clientWidth) return;
    const style = getComputedStyle(card);
    const available = Math.max(0, card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const size = available < 300 ? 'compact' : 'normal';
    if (widget.dataset.size === size) return;
    widget.dataset.size = size;
    widget.dispatchEvent(new Event('gport:security-size'));
  };

  new ResizeObserver(syncTurnstileSize).observe(card);
  syncTurnstileSize();
})();
