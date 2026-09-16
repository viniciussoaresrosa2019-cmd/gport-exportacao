(() => {
  'use strict';

  const region = document.getElementById('toastRegion');
  const safeMessage = (message, fallback = 'Não foi possível concluir a ação. Tente novamente.') => {
    const text = String(message || '').trim();
    if (!text || /(sql|postgres|database|stack|trace|token|password|senha|\bat\s+\w+\s*\(|cannot\s+(?:read|set)\s+propert(?:y|ies)|\bundefined\b|\bnull\b|failed\s+to\s+fetch|networkerror|typeerror|referenceerror|syntaxerror)/i.test(text)) return fallback;
    return text.slice(0, 240);
  };

  const definitions = {
    success: { icon: '✓', duration: 4000, title: 'Concluído', durationClass: 'toast--duration-short' },
    error: { icon: '!', duration: 10000, title: 'Não foi possível concluir a ação', durationClass: 'toast--duration-long' },
    warning: { icon: '!', duration: 5000, title: 'Atenção', durationClass: 'toast--duration-medium' },
    info: { icon: 'i', duration: 4000, title: 'Informação', durationClass: 'toast--duration-short' }
  };

  // Diálogos nativos entram na "top layer" do navegador e ignoram qualquer
  // z-index comum. Ao promover a região também para essa camada no momento em
  // que a notificação é criada, a mensagem continua visível mesmo sobre modais
  // de lançamento, prévia e confirmação.
  const bringToastRegionToFront = () => {
    if (!region || typeof region.showPopover !== 'function') return;
    try {
      region.setAttribute('popover', 'manual');
      if (region.matches(':popover-open')) region.hidePopover();
      region.showPopover();
    } catch {
      // Navegadores sem suporte completo a Popover continuam usando o z-index
      // elevado definido no CSS.
    }
  };

  const createToast = (type, message, options = {}) => {
    if (!region) return;
    const definition = definitions[type] || definitions.info;
    const item = document.createElement('div');
    item.className = `toast toast--${type} ${definition.durationClass}`;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');
    item.innerHTML = '<span class="toast__icon" aria-hidden="true"></span><span class="toast__content"><strong class="toast__title"></strong><span class="toast__message"></span></span><button class="toast__close" type="button" aria-label="Fechar notificação">×</button><span class="toast__progress" aria-hidden="true"></span>';
    item.querySelector('.toast__icon').textContent = definition.icon;
    item.querySelector('.toast__title').textContent = definition.title;
    item.querySelector('.toast__message').textContent = safeMessage(message);
    const dismiss = () => {
      if (!item.isConnected) return;
      item.classList.add('is-leaving');
      window.setTimeout(() => item.remove(), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
    };
    item.querySelector('.toast__close').addEventListener('click', dismiss);
    region.append(item);
    bringToastRegionToFront();
    const timeout = options.duration === undefined ? definition.duration : options.duration;
    if (timeout > 0) window.setTimeout(dismiss, timeout);
    else item.querySelector('.toast__progress').hidden = true;
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
