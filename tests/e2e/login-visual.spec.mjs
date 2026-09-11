import { expect, test } from '@playwright/test';

test('login aprovado mantém a arte, animação e campos funcionais', async ({ page }) => {
  await page.goto('/');

  const dialog = page.locator('#loginDialog');
  const stage = page.locator('#gportLoginStage');
  const form = page.locator('form#loginForm');
  const username = form.locator('[name="username"]');
  const password = form.locator('[name="password"]');

  await expect(dialog).toBeVisible();
  await expect(stage).toHaveClass(/ready/);
  await expect(page.locator('img.original')).toHaveAttribute('src', /login-animation\/login-reference\.png/);
  await expect(form).toHaveCount(1);
  await expect(username).toHaveAttribute('required', '');
  await expect(username).toHaveAttribute('minlength', '3');
  await expect(username).toHaveAttribute('maxlength', '80');
  await expect(password).toHaveAttribute('required', '');
  await expect(password).toHaveAttribute('maxlength', '200');

  await form.locator('button[type="submit"]').click();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('loginUsername');
  expect(await form.evaluate(element => element.checkValidity())).toBe(false);

  await password.fill('test-only-password');
  await page.locator('#loginPasswordToggle').click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.locator('#loginPasswordToggle').click();
  await expect(password).toHaveAttribute('type', 'password');

  const routeBefore = await page.locator('#traveller').getAttribute('transform');
  await page.waitForTimeout(250);
  const routeAfter = await page.locator('#traveller').getAttribute('transform');
  expect(routeAfter).not.toBe(routeBefore);

  const horizontalFit = await dialog.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    viewportWidth:window.innerWidth
  }));
  expect(horizontalFit.scrollWidth).toBeLessThanOrEqual(horizontalFit.clientWidth + 1);
  if (horizontalFit.viewportWidth > 640) {
    expect(horizontalFit.scrollHeight).toBeLessThanOrEqual(horizontalFit.clientHeight + 1);
    const rootFit = await page.locator('.animated-login-root').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { bottom:rect.bottom, height:rect.height, viewportHeight:window.innerHeight };
    });
    expect(rootFit.bottom).toBeLessThanOrEqual(rootFit.viewportHeight + 1);
    expect(rootFit.height).toBeLessThanOrEqual(rootFit.viewportHeight + 1);
  }
});

test('Turnstile usa a configuração pública injetada pelo servidor', async ({ page }) => {
  await page.goto('/');
  const state = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="gport-turnstile-site-key"]');
    const widget = document.querySelector('#turnstileWidget');
    return {
      meta: meta?.content || '',
      widget: widget?.dataset.sitekey || '',
      hasScript: Boolean(document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/"]'))
    };
  });

  expect(state.widget).toBe(state.meta);
  expect(state.widget).not.toBe('__TURNSTILE_SITE_KEY__');
  expect(state.hasScript).toBe(Boolean(state.meta));
});

test('login cabe integralmente na área útil de uma tela 1920×1080', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.setViewportSize({ width:1920, height:931 });
  await page.goto('/');
  await expect(page.locator('#gportLoginStage')).toHaveClass(/ready/);

  const fit = await page.locator('.animated-login-root').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      top:rect.top,
      right:rect.right,
      bottom:rect.bottom,
      left:rect.left,
      viewportWidth:window.innerWidth,
      viewportHeight:window.innerHeight
    };
  });
  expect(fit.top).toBeGreaterThanOrEqual(-1);
  expect(fit.left).toBeGreaterThanOrEqual(-1);
  expect(fit.right).toBeLessThanOrEqual(fit.viewportWidth + 1);
  expect(fit.bottom).toBeLessThanOrEqual(fit.viewportHeight + 1);
});
