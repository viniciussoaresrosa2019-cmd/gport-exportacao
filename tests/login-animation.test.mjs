import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readText = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('login novo usa dois painéis e cenário vetorial próprio sem imagens antigas', async () => {
  const [view, css, index] = await Promise.all([
    readText('public/assets/login-view.js'),
    readText('public/assets/login-animation.css'),
    readText('public/index.html')
  ]);
  assert.match(view, /class="login-screen"/);
  assert.match(view, /class="login-stage"/);
  assert.match(view, /class="login-access"/);
  assert.match(view, /class="login-ship" viewBox="0 0 240 135"/);
  assert.match(view, /class="login-terminal" viewBox="0 0 300 255"/);
  assert.match(view, /class="login-sea" viewBox="0 0 580 100"/);
  assert.match(view, /class="login-logo" src="logo-gport\.png"/);
  assert.doesNotMatch(view, /ship\.png|cargo\.png|crane-detail|background\.png|login-reference\.png/);
  assert.doesNotMatch(index, /login-route-data\.js|login-motion\.js/);
  assert.match(css, /grid-template-columns: minmax\(0, 58fr\) minmax\(0, 42fr\)/);
  assert.match(css, /background: #020b15/);
  assert.match(css, /background: #f8f6f3/);
  assert.doesNotMatch(css, /login-harbor-art|terminal-lines|login-animation-controls/);
});

test('formulário preserva validação, integração Turnstile e contratos da autenticação', async () => {
  const [view, css, controls, runtime, server] = await Promise.all([
    readText('public/assets/login-view.js'),
    readText('public/assets/login-animation.css'),
    readText('public/assets/login-controls.js'),
    readText('public/assets/app-runtime.js'),
    readText('src/server.js')
  ]);
  assert.equal((view.match(/id="loginForm"/g) || []).length, 1);
  assert.match(view, /name="username"[^>]*autocomplete="username"[^>]*required[^>]*minlength="3"[^>]*maxlength="80"/);
  assert.match(view, /name="password"[^>]*type="password"[^>]*autocomplete="current-password"[^>]*required[^>]*maxlength="200"/);
  assert.ok(view.indexOf('id="loginSecurityText"') < view.indexOf('id="turnstileWidget"'));
  assert.match(view, /meta\[name="gport-turnstile-site-key"\]/);
  assert.match(css, /#loginDialog #turnstileWidget \{[^}]*transform: scale\(var\(--login-turnstile-scale, 1\)\)/);
  assert.match(controls, /password\.type = visible \? 'password' : 'text'/);
  assert.match(controls, /style\.paddingLeft/);
  assert.match(runtime, /loginForm\.checkValidity\(\)/);
  assert.match(runtime, /loginForm\.reportValidity\(\)/);
  assert.match(runtime, /loginForm\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(server, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
});

test('animações discretas mantêm cabos conectados e respeitam movimento reduzido', async () => {
  const [view, css, animation] = await Promise.all([
    readText('public/assets/login-view.js'),
    readText('public/assets/login-animation.css'),
    readText('public/assets/login-animation.js')
  ]);
  assert.match(view, /id="loginSuspendedCargo"/);
  assert.match(view, /id="loginCargoCables"/);
  assert.match(view, /id="loginJourneyTraveller"/);
  assert.match(css, /login-ship-bob 8s/);
  assert.match(css, /login-wave-back \{ animation-duration: 24s/);
  assert.match(css, /login-wave-mid \{ animation-duration: 18s/);
  assert.match(css, /login-wave-front \{ animation-duration: 12s/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(animation, /cargoAnchor\(153, 154/);
  assert.match(animation, /cargoAnchor\(183, 154/);
  assert.match(animation, /cables\.setAttribute\('d'/);
  assert.match(animation, /reducedMotion\.matches/);
  assert.doesNotMatch(animation, /GportMotion|GPORT_ROUTE|login-harbor-art/);
});

test('layout não depende de canvas fixo e empilha painéis no celular', async () => {
  const css = await readText('public/assets/login-animation.css');
  assert.match(css, /width: 100vw/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /\.login-screen \{ display: block; height: auto; min-height: 100dvh; \}/);
  assert.doesNotMatch(css, /width: 999px|height: 572px/);
});
