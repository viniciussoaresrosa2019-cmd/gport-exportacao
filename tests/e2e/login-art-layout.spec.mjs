import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const loginUrl = `${pathToFileURL(fileURLToPath(new URL('../../public/index.html', import.meta.url))).href}?frame=0`;

test('login preserva proporção da arte e ocupa a janela inteira em resoluções desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 931 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(viewport);
    await page.goto(loginUrl);
    await expect(page.locator('#gportLoginStage')).toHaveClass(/ready/);

    const layout = await page.evaluate(() => {
      const box = selector => {
        const { left, top, right, bottom, width, height } = document.querySelector(selector).getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      const matrix = document.querySelector('.login-harbor-art').getScreenCTM();
      return {
        root: box('.animated-login-root'),
        stage: box('#gportLoginStage'),
        card: box('.login-card'),
        ship: box('#ship image'),
        cargo: box('#cargo image'),
        matrix: { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d },
        width: window.innerWidth,
        height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth
      };
    });

    expect(layout.root.left).toBeCloseTo(0, 0);
    expect(layout.root.top).toBeCloseTo(0, 0);
    expect(layout.root.right).toBeCloseTo(layout.width, 0);
    expect(layout.root.bottom).toBeCloseTo(layout.height, 0);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.card.left).toBeGreaterThanOrEqual(layout.stage.right);
    expect(layout.card.right).toBeLessThanOrEqual(layout.width);
    expect(Math.abs(layout.matrix.a - layout.matrix.d)).toBeLessThan(.01);
    expect(Math.abs(layout.matrix.b)).toBeLessThan(.01);
    expect(Math.abs(layout.matrix.c)).toBeLessThan(.01);
    expect(layout.ship.width / layout.ship.height).toBeCloseTo(386 / 209, 2);
    expect(layout.cargo.width / layout.cargo.height).toBeCloseTo(132 / 121, 2);
  }
});

test('login móvel conserva os campos acessíveis ao rolar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome');
  await page.goto(loginUrl);
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.locator('#loginUsername')).toBeVisible();
  await page.locator('.login-submit').scrollIntoViewIfNeeded();
  await expect(page.locator('.login-submit')).toBeInViewport();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
});

test('verificador abaixo do formulário não corta o cartão no desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(loginUrl);
  await page.locator('#turnstileWidget').evaluate(element => { element.hidden = false; });
  const layout = await page.evaluate(() => {
    const card = document.querySelector('.login-card').getBoundingClientRect();
    const widget = document.querySelector('#turnstileWidget').getBoundingClientRect();
    return { cardTop: card.top, cardBottom: card.bottom, widgetBottom: widget.bottom, viewportHeight: window.innerHeight };
  });
  expect(layout.cardTop).toBeGreaterThanOrEqual(0);
  expect(layout.cardBottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.widgetBottom).toBeLessThanOrEqual(layout.cardBottom);
});
