import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

// Execute o manipulador real com uma interface mínima. Verifica chamadas de
// rede e confirmação de gravação, sem depender da representação do formulário.
const runtime = await readFile(new URL('../public/assets/app-runtime.js', import.meta.url), 'utf8');
const handler = runtime.slice(runtime.indexOf('const persistProcessForm ='), runtime.indexOf('const scheduleProcessAutoSave ='));
function harness() {
  let calls = 0, closed = 0, cleared = 0;
  const state = { invoice:'INV-1', fail:false };
  const button = { textContent:'Salvar processo', disabled:false };
  const context = {
    processSaveBusy:false, processSavePending:false, processAutoSaveTimer:1,
    processFormHasPersistedDetails:true, editingProcessId:'process-1', editingProcessUpdatedAt:'v1',
    lastSavedProcessSnapshot:null, newProcessIdempotencyKey:null,
    processIdFromForm:() => 'process-1', syncContainerDetails() {},
    form:{ querySelector:() => button, querySelectorAll:() => [], checkValidity:() => true, elements:{ id:{ value:'process-1' } }, dataset:{} },
    FormData:class { [Symbol.iterator]() { return [['id','process-1'], ['invoice',state.invoice]][Symbol.iterator](); } },
    window:{ clearTimeout:() => { cleared++; }, setTimeout:() => 2 },
    data:[{ id:'process-1', updatedAt:'v1' }],
    clients:[{ id:'client-1', nome:'TESTE' }], availableAssignees:[], currentUser:{ username:'TESTE' },
    processPagination:{ limit:50, total:1 }, localProcessMutationQuietUntil:new Map(),
    toApiProcess:values => ({ clientId:'client-1', invoice:values.invoice }),
    request:async (_path, options) => {
      calls++;
      if (state.fail) throw new Error('offline');
      return { id:'process-1', invoice:JSON.parse(options.body).invoice, updated_at:`v${calls+1}` };
    },
    toViewProcess:value => value, el:() => ({ setAttribute() {} }),
    invalidatePersistedProcess() {},
    cachePersistedProcess:value => value,
    dialog:{ close:() => { closed++; } }, render() {},
    toast:{ success() {}, error() {} }, showProcessSaveState() {},
    processSaveFailureMessage:error => error.message,
    scheduleProcessAutoSave() {}
  };
  vm.createContext(context);
  vm.runInContext(`${handler}\nthis.save = persistProcessForm;`, context);
  return { state, context, save:context.save, counts:() => ({ calls, closed, cleared }) };
}

test('Salvar após autosave confirmado fecha o formulário sem segunda gravação', async () => {
  const h = harness();
  assert.equal(await h.save({ quiet:true }), true);
  assert.equal(await h.save({ closeAfter:true }), true);
  assert.deepEqual(h.counts(), { calls:1, closed:1, cleared:2 });
});

test('alteração posterior ao autosave é persistida', async () => {
  const h = harness();
  await h.save({ quiet:true });
  h.state.invoice = 'INV-2';
  await h.save({ closeAfter:true });
  assert.equal(h.counts().calls, 2);
  assert.equal(h.context.data[0].invoice, 'INV-2');
});

test('falha não confirma dados: próxima tentativa continua gravando', async () => {
  const h = harness();
  h.state.fail = true;
  assert.equal(await h.save({ quiet:true }), false);
  assert.equal(h.context.lastSavedProcessSnapshot, null);
  h.state.fail = false;
  assert.equal(await h.save({ closeAfter:true }), true);
  assert.equal(h.counts().calls, 2);
  assert.equal(h.counts().closed, 1);
});
