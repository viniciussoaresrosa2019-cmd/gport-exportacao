(() => {
  'use strict';

  let generatedId = 0;
  const uniqueId = base => {
    const clean = String(base || 'campo').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'campo';
    let candidate;
    do { candidate = `gport-${clean}-${++generatedId}`; } while (document.getElementById(candidate));
    return candidate;
  };

  const associateLabels = (root = document) => {
    root.querySelectorAll('label:not([for])').forEach(label => {
      const control = label.querySelector('input, select, textarea')
        || label.parentElement?.querySelector(':scope > input, :scope > select, :scope > textarea');
      if (!control) return;
      if (!control.id) control.id = uniqueId(control.name || control.getAttribute('aria-label'));
      label.htmlFor = control.id;
    });
  };

  const enablePasswordVisibility = (root = document) => {
    root.querySelectorAll('input[type="password"]:not([data-visibility-ready])').forEach(input => {
      input.dataset.visibilityReady = 'true';
      const wrapper = document.createElement('div');
      wrapper.className = 'password-field';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.append(input);
      input.classList.add('password-input');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'password-toggle';
      button.textContent = 'Ver';
      button.setAttribute('aria-label', 'Mostrar senha');
      button.addEventListener('click', () => {
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        button.textContent = visible ? 'Ver' : 'Ocultar';
        button.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
      });
      wrapper.append(button);
    });
  };

  const enhanceProcessRows = () => {
    const rows = document.getElementById('rows');
    if (!rows) return;
    rows.querySelectorAll('tr[data-id]').forEach(row => {
      const cells = row.querySelectorAll('td');
      const booking = cells[0]?.querySelector('.process')?.textContent?.trim() || cells[0]?.textContent?.trim() || 'sem booking';
      const exporter = cells[1]?.childNodes[0]?.textContent?.trim() || 'exportador não informado';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Abrir processo ${booking} de ${exporter}`);
      row.querySelectorAll('.indicator-cell').forEach(cell => {
        const indicator = cell.querySelector('.indicator');
        if (!indicator || cell.querySelector('.status-text')) return;
        indicator.setAttribute('aria-hidden', 'true');
        const status = document.createElement('span');
        status.className = 'status-text';
        status.textContent = indicator.getAttribute('title') || indicator.getAttribute('aria-label') || 'Status não informado';
        indicator.removeAttribute('aria-label');
        cell.append(status);
      });
      const pdf = row.querySelector('[data-pdf]');
      if (pdf) {
        pdf.type = 'button';
        pdf.setAttribute('aria-label', `Gerar capa PDF do processo ${booking}`);
      }
    });
    if (!rows.dataset.keyboardReady) {
      rows.dataset.keyboardReady = 'true';
      rows.addEventListener('keydown', event => {
        const row = event.target.closest('tr[data-id]');
        if (!row || event.target.closest('button, a, input, select, textarea')) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          row.click();
        }
      });
    }
  };

  const nameDynamicControls = () => {
    document.querySelectorAll('table').forEach(table => {
      const headings = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      table.querySelectorAll('tbody tr').forEach(row => {
        const processName = row.querySelector('td')?.textContent?.trim().split(/\s+/)[0] || 'selecionado';
        [...row.cells].forEach((cell, index) => cell.querySelectorAll('input, select, button').forEach(control => {
          if (control.hasAttribute('aria-label') || control.getAttribute('aria-labelledby')) return;
          const heading = headings[index] || control.name || control.textContent.trim() || 'Ação';
          control.setAttribute('aria-label', `${heading} do processo ${processName}`);
        }));
      });
    });
    document.querySelectorAll('button:not([aria-label])').forEach(button => {
      if (button.textContent.trim()) return;
      button.setAttribute('aria-label', button.title || 'Abrir menu');
    });
  };

  const prepare = root => {
    const scope = root?.nodeType === Node.ELEMENT_NODE ? root : document;
    associateLabels(scope);
    enablePasswordVisibility(scope);
    enhanceProcessRows();
    nameDynamicControls();
  };
  prepare(document);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => prepare(node))))
    .observe(document.body, { childList: true, subtree: true });
})();
