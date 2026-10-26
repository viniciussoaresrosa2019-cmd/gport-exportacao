import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('toast espera o usuário terminar uma seleção antes de alterar o DOM', async () => {
  const listeners = new Map();
  const timers = new Map();
  let timerId = 0;

  class HTMLElement {
    constructor() {
      this.isConnected = false;
      this.textContent = '';
      this.listeners = new Map();
      this.className = '';
      this.classList = {
        values:new Set(),
        add:value => this.classList.values.add(value),
        contains:value => this.classList.values.has(value),
        toggle:() => {}
      };
    }
    setAttribute() {}
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    querySelector() { return new HTMLElement(); }
    remove() { this.isConnected = false; }
  }

  class HTMLSelectElement extends HTMLElement {}
  const appended = [];
  const region = new HTMLElement();
  region.isConnected = true;
  region.append = item => { item.isConnected = true; appended.push(item); };
  const document = {
    activeElement:null,
    getElementById:id => id === 'toastRegion' ? region : null,
    createElement:() => new HTMLElement(),
    addEventListener:(type, handler) => listeners.set(type, handler)
  };
  const window = {
    setTimeout:(handler, delay) => { const id = ++timerId; timers.set(id, { handler, delay }); return id; },
    clearTimeout:id => timers.delete(id),
    matchMedia:() => ({ matches:true })
  };
  const source = await readFile('public/assets/ui-feedback.js', 'utf8');
  vm.runInNewContext(source, { document, window, HTMLElement, HTMLSelectElement, Object, String });

  const select = new HTMLSelectElement();
  select.isConnected = true;
  select.disabled = false;
  document.activeElement = select;
  listeners.get('pointerdown')({ target:{ closest:() => select } });
  window.gportUi.toast.info('Alteração concluída.');
  assert.equal(appended.length, 0, 'o toast não deve alterar o DOM enquanto o seletor estiver aberto');

  listeners.get('change')({ target:select });
  const finishTimer = [...timers.values()].find(timer => timer.delay === 80);
  assert.ok(finishTimer, 'o toast deve aguardar o fechamento nativo do seletor');
  finishTimer.handler();
  assert.equal(appended.length, 1, 'o toast deve aparecer depois que a seleção terminar');
});
