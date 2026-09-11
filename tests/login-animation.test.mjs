import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readText = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const readBinary = file => readFile(new URL(`../${file}`, import.meta.url));

test('a tela animada preserva exatamente os arquivos visuais aprovados', async () => {
  const expectedHashes = {
    'public/login-animation/login-reference.png': 'e983911eeb014254552348f4498bb177a89fa71c94d29cdd6fae471413224cd9',
    'public/login-animation/background.png': '0adc71a6bfd088d8174a24ad6fe71a4c2b7969d4fd95235aede4e0493aad13e5',
    'public/login-animation/ship.png': '2c55d272341fe7f3e9ce64e97ce6238073b2f6cc331221b1e7238cc6e9d63ee7',
    'public/login-animation/cargo.png': '3f4195b7f215a496750e9c6171d140cf2df8e231fa1c3c5861223a1d62e6605f'
  };

  for (const [file, expected] of Object.entries(expectedHashes)) {
    const hash = createHash('sha256').update(await readBinary(file)).digest('hex');
    assert.equal(hash, expected, `${file} foi alterado e perdeu fidelidade ao material aprovado`);
  }
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
  assert.match(animation, /dialog\?\.open/);
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
  assert.match(css, /#loginDialog #turnstileWidget[\s\S]*top: 75\.45%/);
  assert.match(runtime, /loginForm\.checkValidity\(\)/);
  assert.match(runtime, /loginForm\.reportValidity\(\)/);
  assert.match(runtime, /loginForm\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(runtime, /theme: 'light', language:'pt-BR', appearance:'always'/);
  assert.match(server, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(server, /turnstileToken/);
});

test('a composição responsiva mantém a arte exata no desktop e no celular', async () => {
  const [html, css, controls] = await Promise.all([
    readText('public/assets/login-view.js'),
    readText('public/assets/login-animation.css'),
    readText('public/assets/login-controls.js')
  ]);

  assert.match(html, /viewBox="0 0 1672 941"/);
  assert.match(html, /viewBox="1020 145 580 650"/);
  assert.match(css, /aspect-ratio: 1672 \/ 941/);
  assert.match(css, /width: min\(100vw, 1672px\)/);
  assert.match(css, /max-width: 177\.6833156vh/);
  assert.doesNotMatch(css, /100svh\s*\*/);
  assert.match(css, /body:has\(#loginDialog\[open\]\) \{ overflow: hidden; \}/);
  assert.match(css, /@media \(max-width: 640px\) and \(orientation: portrait\)/);
  assert.match(controls, /ResizeObserver/);
  assert.match(controls, /--login-turnstile-scale/);
  assert.match(controls, /password\.type = visible \? 'password' : 'text'/);
});
