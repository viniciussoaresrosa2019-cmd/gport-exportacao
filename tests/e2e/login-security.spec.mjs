import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test('mudança de tamanho preserva o desafio e falhas reais de envio devolvem o controle', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.setViewportSize({ width: 1366, height: 768 });
  // Provider/API doubles are isolated here. No successful authentication is
  // simulated and no credentials or mutations are sent to an external system.
  await page.addInitScript(() => {
    const state = window.loginSecurityQa = { renders: 0, removals: 0, resets: 0, posts: 0, mode: 'unauthorized' };
    window.turnstile = {
      render(mount, options) {
        state.renders++;
        state.options = options;
        const frame = document.createElement('iframe');
        frame.title = 'Widget de segurança — teste de contrato';
        frame.width = options.size === 'compact' ? '150' : '300';
        frame.height = options.size === 'compact' ? '140' : '65';
        frame.style.border = '0';
        mount.append(frame);
        return 'isolated-test-widget';
      },
      remove() { state.removals++; document.querySelector('#turnstileWidget').replaceChildren(); },
      reset() { state.resets++; }
    };
    window.fetch = async url => {
      if (String(url).includes('/api/auth/login')) {
        state.posts++;
        await new Promise(resolve => setTimeout(resolve, 350));
        if (state.mode === 'network') throw new TypeError('Failed to fetch');
        return new Response(JSON.stringify({ error: 'Usuário ou senha inválidos.' }), { status: 401 });
      }
      return new Response('{}', { status: 401 });
    };
  });
  await page.goto(pathToFileURL(resolve(process.env.LOGIN_PREVIEW_FILE || 'public/index.html')).href);
  await expect(page.locator('#loginDialog')).toBeVisible();
  await page.waitForFunction(() => document.querySelector('#turnstileWidget').dataset.size === 'normal');
  await page.evaluate(() => window.initializeTurnstile());
  await expect(page.locator('#turnstileWidget iframe')).toHaveAttribute('width', '300');
  await page.setViewportSize({ width: 999, height: 572 });
  await expect(page.locator('#turnstileWidget iframe')).toHaveAttribute('width', '150');
  expect(await page.evaluate(() => window.loginSecurityQa.removals)).toBe(1);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.loginSecurityQa.renders)).toBe(2);
  await page.locator('#loginUsername').fill('qa.isolado');
  await page.locator('#loginPassword').fill('test-only-not-a-real-password');
  await page.locator('#loginPassword').press('Enter');
  await expect(page.locator('#loginError')).toContainText('verificação de segurança');
  expect(await page.evaluate(() => window.loginSecurityQa.posts)).toBe(0);

  for (const mode of ['unauthorized', 'network']) {
    await page.evaluate(mode => {
      window.loginSecurityQa.mode = mode;
      window.loginSecurityQa.options.callback('test-only-provider-token');
    }, mode);
    await page.locator('#loginPassword').press('Enter');
    await expect(page.locator('.login-submit')).toBeDisabled();
    await expect(page.locator('#loginForm')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.login-submit')).toBeEnabled();
    await expect(page.locator('#loginError')).toBeVisible();
    await expect(page.locator('#loginDialog')).toBeVisible();
    expect(await page.locator('#loginError').textContent()).not.toMatch(/stack|TypeError/);
  }
  expect(await page.evaluate(() => window.loginSecurityQa.posts)).toBe(2);
  await page.locator('#loginPassword').press('Enter');
  await expect(page.locator('#loginError')).toContainText('verificação de segurança');
  expect(await page.evaluate(() => window.loginSecurityQa.posts)).toBe(2);
});
