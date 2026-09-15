import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('navegação compartilhada cobre todas as páginas e não contém autorização', async () => {
  const navigation = await readFile(new URL('../public/assets/page-navigation.js', import.meta.url), 'utf8');
  const runtime = await readFile(new URL('../public/assets/app-runtime.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const page of ['processes','braspine','vgm','vgmReport','release','postShipment','followup','reports']) assert.match(navigation, new RegExp(`${page}:`));
  assert.match(runtime, /gportPageNavigation\.activate\('processes'\)/);
  assert.match(runtime, /gportPageNavigation\.activate\('reports'\)/);
  assert.match(html, /page-navigation\.js[^>]+defer/);
  assert.doesNotMatch(navigation, /role|permission|authenticate|fetch\(/i);
});
