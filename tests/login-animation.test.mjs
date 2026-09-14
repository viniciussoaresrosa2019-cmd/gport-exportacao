import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readText = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('login mantém os painéis e carrega o terminal animado como camadas independentes', async () => {
  const [view, animation, waterMotion, css, index] = await Promise.all([
    readText('public/assets/login-view.js'),
    readText('public/assets/login-terminal-animation.js'),
    readText('public/assets/login-water-motion.js'),
    readText('public/assets/login-animation.css'),
    readText('public/index.html')
  ]);
  assert.match(view, /class="login-screen"/);
  assert.match(view, /class="login-stage"/);
  assert.match(view, /class="login-access"/);
  assert.match(view, /class="login-ship-sea-scene"/);
  assert.match(view, /login-sea\.png/);
  assert.match(view, /login-ship\.png/);
  assert.match(view, /login-wave-overlay/);
  assert.match(view, /id="loginTerminalScene"/);
  assert.match(view, /id="loginTerminalTrolley"/);
  assert.match(view, /id="loginTerminalCables"/);
  assert.match(view, /id="loginTerminalLoad"/);
  assert.match(view, /login-terminal-base-alpha\.png/);
  assert.match(view, /login-terminal-source-alpha\.png/);
  assert.match(index, /assets\/login-terminal-animation\.js/);
  assert.match(index, /assets\/login-water-motion\.js/);
  assert.match(css, /grid-template-columns: minmax\(0, 58fr\) minmax\(0, 42fr\)/);
  assert.match(css, /background: #000f20/);
  assert.match(css, /\.login-terminal-scene/);
  assert.match(css, /\.login-ship-sea-scene/);
  assert.match(css, /@keyframes login-ship-swell/);
  assert.match(css, /\.login-wave-overlay/);
  assert.match(css, /overflow: clip/);
  assert.match(animation, /const keyframes = \[/);
  assert.match(animation, /trolley\.setAttribute\('transform'/);
  assert.match(animation, /load\.setAttribute\('transform'/);
  assert.match(animation, /cables\.forEach/);
  assert.match(waterMotion, /requestAnimationFrame\(draw\)/);
  assert.match(waterMotion, /const wavelets = Array\.from/);
  assert.match(waterMotion, /const life = Math\.pow/);
  assert.match(waterMotion, /reducedMotion\.matches/);
});

test('formulário preserva validação, Turnstile e contratos da autenticação', async () => {
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
  assert.doesNotMatch(css, /--login-turnstile-scale|transform: scale/);
  assert.match(runtime, /size: turnstileWidget\.dataset\.size \|\| 'compact'/);
  assert.match(controls, /password\.type = visible \? 'password' : 'text'/);
  assert.match(runtime, /loginForm\.checkValidity\(\)/);
  assert.match(runtime, /loginForm\.reportValidity\(\)/);
  assert.match(runtime, /loginForm\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(server, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
});

test('terminal preserva a operação de içamento aprovada sem mover a estrutura inteira', async () => {
  const animation = await readText('public/assets/login-terminal-animation.js');
  assert.match(animation, /\[0, 0, 0\].*\[16, 0, 0\]/s);
  assert.match(animation, /trolley\.setAttribute\('transform'/);
  assert.match(animation, /cables\.forEach\(cable => cable\.setAttribute\('d'/);
  assert.match(animation, /reducedMotion\.matches/);
});

test('layout empilha em celular, sem canvas fixo nem zoom para encolher o login', async () => {
  const css = await readText('public/assets/login-animation.css');
  assert.match(css, /width: 100%/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /\.login-screen \{ display: block; min-height: 100dvh; \}/);
  assert.doesNotMatch(css, /width: 999px|height: 572px|transform: scale\(\.\d+\)/);
});
