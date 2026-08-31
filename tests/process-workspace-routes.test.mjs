import test from 'node:test';
import assert from 'node:assert/strict';
import { registerProcessWorkspaceRoutes } from '../src/routes/process-workspace.js';

const passthrough = handler => handler;
const middleware = (_req, _res, next) => next?.();

test('módulo de workspace registra rotas protegidas sem efeitos colaterais no carregamento', () => {
  const registered = [];
  const app = {};
  for (const method of ['get', 'post', 'patch', 'delete']) {
    app[method] = (route, ...handlers) => registered.push({ method, route, handlers });
  }

  registerProcessWorkspaceRoutes({
    app,
    authenticate:middleware,
    processEditorOnly:middleware,
    asyncRoute:passthrough,
    query:async () => ({ rows:[], rowCount:0 }),
    audit:async () => {},
    validId:value => /^\d+$/.test(String(value)),
    upperText:value => value,
    cleanText:value => value,
    validateAttachmentInput:value => value,
    attachmentScanMode:'basic'
  });

  assert.equal(registered.length, 11);
  assert.ok(registered.every(route => route.route.startsWith('/api/processes/:id/')));
  assert.ok(registered.every(route => route.handlers[0] === middleware));
  assert.ok(registered.some(route => route.method === 'get' && route.route.endsWith('/download')));
  assert.ok(registered.some(route => route.method === 'delete' && route.route.endsWith('/:attachmentId')));
});
