import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readText = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const readBinary = file => readFile(new URL(`../${file}`, import.meta.url));

test('a tela animada usa ativos independentes e não depende de uma captura da tela', async () => {
  const expectedHashes = {
    'public/login-animation/ship.png': '2c55d272341fe7f3e9ce64e97ce6238073b2f6cc331221b1e7238cc6e9d63ee7',
    'public/login-animation/cargo.png': '3f4195b7f215a496750e9c6171d140cf2df8e231fa1c3c5861223a1d62e6605f'
  };

  for (const [file, expected] of Object.entries(expectedHashes)) {
    const hash = createHash('sha256').update(await readBinary(file)).digest('hex');
    assert.equal(hash, expected, `${file} foi alterado e perdeu qualidade`);
  }

  const html = await readText('public/assets/login-view.js');
  assert.doesNotMatch(html, /login-reference\.png|background\.png/);
  assert.match(html, /class="login-brand"/);
  assert.match(html, /class="login-hero-copy"/);
  assert.match(html, /class="login-card"/);
  assert.match(html, /class="terminal-lines"/);
});

test('movimento original de 14 segundos e rota permanecem ligados à tela de login', async () => {
  const [html, motion, animation] = await Promise.all([
    readText('public/assets/login-view.js'),
    readText('public/assets/login-motion.js'),
    readText('public/assets/login-animation.js')
  ]);

  assert.match(html, /id="gportLoginStage"/);
  assert.match(html, /id="ship"/);
  assert.match(html, /id="cargo"/);
  assert.match(html, /id="traveller"/);
  assert.match(motion, /DURATION\s*=\s*14/);
  assert.match(animation, /document\.getElementById\('gportLoginStage'\)/);
  assert.match(animation, /dialog\.open/);
  assert.match(animation, /GportMotion\.at\(seconds\)/);
  assert.match(animation, /GPORT_ROUTE/);
});

test('login visual usa campos reais validados e Turnstile abaixo da proteção', async () => {
  const [index, html, css, runtime, server] = await Promise.all([
    readText('public/index.html'),
    readText('public/assets/login-view.js'),
    readText('public/assets/login-animation.css'),
    readText('public/assets/app-runtime.js'),
    readText('src/server.js')
  ]);

  assert.equal((html.match(/id="loginForm"/g) || []).length, 1);
  assert.match(html, /name="username"[^>]*autocomplete="username"[^>]*required[^>]*minlength="3"[^>]*maxlength="80"/);
  assert.match(html, /name="password"[^>]*type="password"[^>]*autocomplete="current-password"[^>]*required[^>]*maxlength="200"/);
  assert.ok(html.indexOf('id="loginSecurityText"') < html.indexOf('id="turnstileWidget"'));
  assert.match(index, /name="gport-turnstile-site-key" content="__TURNSTILE_SITE_KEY__"/);
  assert.match(html, /meta\[name="gport-turnstile-site-key"\]/);
  assert.doesNotMatch(html, /__TURNSTILE_SITE_KEY__/);
  assert.match(index, /assets\/login-animation\.css/);
  assert.match(index, /assets\/login-animation\.js/);
  assert.match(index, /assets\/login-view\.js/);
  assert.match(html, /class="login-turnstile-frame"/);
  assert.match(css, /#loginDialog #turnstileWidget[\s\S]*transform: scale\(var\(--login-turnstile-scale, 1\)\)/);
  assert.match(runtime, /loginForm\.checkValidity\(\)/);
  assert.match(runtime, /loginForm\.reportValidity\(\)/);
  assert.match(runtime, /loginForm\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(runtime, /theme: 'light', language:'pt-BR', appearance:'always'/);
  assert.match(server, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(server, /turnstileToken/);
});

test('a composição responsiva mantém elementos reais no desktop e no celular', async () => {
  const [html, css, controls] = await Promise.all([
    readText('public/assets/login-view.js'),
    readText('public/assets/login-animation.css'),
    readText('public/assets/login-controls.js')
  ]);

  assert.match(html, /viewBox="0 0 955 941"/);
  assert.match(html, />Gestão interna que mantém<br>a operação em movimento\.<\/h1>/);
  assert.match(html, /<label for="loginUsername">Usuário<\/label>/);
  assert.match(html, /<button class="login-submit" type="submit">Entrar<\/button>/);
  assert.match(css, /grid-template-columns: minmax\(0, 57\.12fr\) minmax\(0, 42\.88fr\)/);
  assert.match(css, /width: 100vw/);
  assert.match(css, /height: 100dvh/);
  assert.doesNotMatch(css, /1672px|aspect-ratio: 1672/);
  assert.match(css, /body:has\(#loginDialog\[open\]\) \{ overflow: hidden; \}/);
  assert.match(css, /@media \(max-width: 760px\) and \(orientation: portrait\)/);
  assert.match(controls, /ResizeObserver/);
  assert.match(controls, /--login-turnstile-scale/);
  assert.match(controls, /password\.type = visible \? 'password' : 'text'/);
});
