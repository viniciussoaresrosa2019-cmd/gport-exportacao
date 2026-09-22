(() => {
  'use strict';

  const region = document.getElementById('toastRegion');
  const safeMessage = (message, fallback = 'Não foi possível concluir a ação. Tente novamente.') => {
    const text = String(message || '').trim();
    if (!text || /(sql|postgres|database|stack|trace|token|password|senha|\bat\s+\w+\s*\(|cannot\s+(?:read|set)\s+propert(?:y|ies)|\bundefined\b|\bnull\b|failed\s+to\s+fetch|networkerror|typeerror|referenceerror|syntaxerror)/i.test(text)) return fallback;
    return text.slice(0, 240);
  };

  const definitions = {
    success: { icon: '✓', duration: 4000, title: 'Concluído' },
    error: { icon: '!', duration: 10000, title: 'Não foi possível concluir a ação' },
    warning: { icon: '!', duration: 5000, title: 'Atenção' },
    info: { icon: 'i', duration: 4000, title: 'Informação' }
  };
  const activeToasts = new Map();

  const createToast = (type, message, options = {}) => {
    if (!region) return;
    const definition = definitions[type] || definitions.info;
    const cleanMessage = safeMessage(message);
    const key = `${type}:${cleanMessage}`;
    const existing = activeToasts.get(key);
    if (existing?.isConnected) return existing;
    const item = document.createElement('div');
    item.className = `toast toast--${type}`;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');
    item.innerHTML = '<span class="toast__icon" aria-hidden="true"></span><span class="toast__content"><strong class="toast__title"></strong><span class="toast__message"></span></span><button class="toast__close" type="button" aria-label="Fechar notificação">×</button>';
    item.querySelector('.toast__icon').textContent = definition.icon;
    item.querySelector('.toast__title').textContent = definition.title;
    item.querySelector('.toast__message').textContent = cleanMessage;
    activeToasts.set(key, item);
    let dismissTimer = null;
    let removalTimer = null;
    const dismiss = () => {
      if (!item.isConnected || item.classList.contains('is-leaving')) return;
      if (dismissTimer) window.clearTimeout(dismissTimer);
      item.classList.add('is-leaving');
      const remove = () => {
        if (removalTimer) window.clearTimeout(removalTimer);
        activeToasts.delete(key);
        item.remove();
      };
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) remove();
      else {
        item.addEventListener('animationend', remove, { once:true });
        removalTimer = window.setTimeout(remove, 220);
      }
    };
    item.querySelector('.toast__close').addEventListener('click', dismiss);
    region.append(item);
    const timeout = options.duration === undefined ? definition.duration : options.duration;
    if (timeout > 0) dismissTimer = window.setTimeout(dismiss, timeout);
    return item;
  };

  const toast = Object.freeze({
    success: message => createToast('success', message),
    error: message => createToast('error', safeMessage(message)),
    warning: message => createToast('warning', message),
    info: message => createToast('info', message)
  });

  const confirmAction = (title, message, { destructive = true } = {}) => new Promise(resolve => {
    const modal = document.getElementById('confirmDialog');
    const accept = document.getElementById('confirmDialogAccept');
    const cancel = document.getElementById('confirmDialogCancel');
    if (!modal || !accept || !cancel || typeof modal.showModal !== 'function') return resolve(false);
    const returnFocus = document.activeElement;
    document.getElementById('confirmDialogTitle').textContent = title;
    document.getElementById('confirmDialogMessage').textContent = message;
    accept.textContent = destructive ? 'Excluir' : 'Confirmar';
    accept.classList.toggle('danger', destructive);
    const finish = value => {
      accept.onclick = null;
      cancel.onclick = null;
      modal.oncancel = null;
      if (modal.open) modal.close();
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
      resolve(value);
    };
    accept.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
    modal.oncancel = event => { event.preventDefault(); finish(false); };
    modal.showModal();
    accept.focus();
  });

  // Compatibilidade transitória para blocos legados ainda não extraídos.
  // O fluxo deixa de abrir caixas nativas bloqueantes e nunca mostra detalhes técnicos.
  window.alert = message => {
    const text = safeMessage(message);
    if (/sucesso|salvo|exclu[ií]do|atualizado/i.test(text)) toast.success(text);
    else if (/revise|obrigat|selecione|confirma/i.test(text)) toast.warning(text);
    else toast.error(text);
  };
  window.confirm = () => false;
  window.prompt = () => null;
  window.gportUi = Object.freeze({ toast, safeMessage, confirmAction });
})();
