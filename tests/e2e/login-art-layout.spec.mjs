import { expect, test } from '@playwright/test';
import { pathToFileURL, fileURLToPath } from 'node:url';

const loginUrl = pathToFileURL(fileURLToPath(new URL('../../public/index.html', import.meta.url))).href;

test('painéis, texto, cartão e cenário seguem a composição em desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  for (const viewport of [{ width: 999, height: 572 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto(loginUrl);
    await expect(page.locator('#gportLoginStage')).toHaveClass(/ready/);

    const layout = await page.evaluate(() => {
      const box = selector => {
        const { left, top, right, bottom, width, height } = document.querySelector(selector).getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      const title = document.querySelector('#loginHeroTitle');
      return {
        screen: box('.login-screen'), stage: box('.login-stage'), access: box('.login-access'),
        card: box('.login-card'), title: box('#loginHeroTitle'), areas: box('.login-areas'),
        ship: box('.login-ship'), terminal: box('.login-terminal'),
        titleLineHeight: parseFloat(getComputedStyle(title).lineHeight),
        width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth
      };
    });

    expect(layout.screen.left).toBeCloseTo(0, 0);
    expect(layout.screen.top).toBeCloseTo(0, 0);
    expect(layout.screen.right).toBeCloseTo(layout.width, 0);
    expect(layout.screen.bottom).toBeCloseTo(layout.height, 0);
    expect(layout.stage.width / layout.width).toBeCloseTo(.58, 2);
    expect(layout.access.width / layout.width).toBeCloseTo(.42, 2);
    expect(layout.card.left).toBeGreaterThan(layout.stage.right);
    expect(layout.card.right).toBeLessThan(layout.width);
    expect(layout.card.top).toBeGreaterThanOrEqual(0);
    expect(layout.card.bottom).toBeLessThanOrEqual(layout.height);
    expect(layout.title.height / layout.titleLineHeight).toBeCloseTo(2, 0);
    expect(layout.areas.bottom).toBeLessThanOrEqual(layout.ship.top + layout.ship.height * 29 / 165 + 2);
    expect(layout.terminal.right).toBeLessThanOrEqual(layout.stage.right + 2);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.width + 1);

    if (viewport.width === 999) {
      expect(layout.card.width).toBeGreaterThanOrEqual(320);
      expect(layout.card.width).toBeLessThanOrEqual(330);
      expect(layout.card.height).toBeGreaterThanOrEqual(365);
      expect(layout.card.height).toBeLessThanOrEqual(380);
    }
  }
});

test('navio, ondas e carga usam animações distintas sem romper os cabos', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.goto(loginUrl);
  const first = await page.locator('#loginSuspendedCargo').getAttribute('transform');
  const firstCable = await page.locator('#loginCargoCables').getAttribute('d');
  await page.waitForTimeout(250);
  const next = await page.locator('#loginSuspendedCargo').getAttribute('transform');
  const nextCable = await page.locator('#loginCargoCables').getAttribute('d');
  expect(next).not.toBe(first);
  expect(nextCable).not.toBe(firstCable);
  const animations = await page.evaluate(() => ({
    ship: getComputedStyle(document.querySelector('.login-ship-moving')).animationName,
    waves: [...document.querySelectorAll('.login-wave-track')].map(element => getComputedStyle(element).animationDuration)
  }));
  expect(animations.ship).toBe('login-ship-bob');
  expect(animations.waves).toEqual(['24s', '18s', '13s']);
});

test('preferência de texto ampliado não corta o login nem causa rolagem lateral', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto(loginUrl);
    await page.evaluate(() => document.body.classList.add('accessibility-xlarge'));
    const fit = await page.evaluate(() => {
      const stage = document.querySelector('.login-stage').getBoundingClientRect();
      const access = document.querySelector('.login-access').getBoundingClientRect();
      const card = document.querySelector('.login-card').getBoundingClientRect();
      const widget = document.querySelector('#turnstileWidget').getBoundingClientRect();
      return { stageRight: stage.right, accessRight: access.right, cardLeft: card.left, cardRight: card.right, widgetRight: widget.right, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
    });
    expect(fit.stageRight / fit.viewport).toBeCloseTo(.58, 2);
    expect(fit.accessRight).toBeLessThanOrEqual(fit.viewport + 1);
    expect(fit.cardLeft).toBeGreaterThan(fit.stageRight);
    expect(fit.cardRight).toBeLessThan(fit.viewport);
    expect(fit.widgetRight).toBeLessThanOrEqual(fit.cardRight);
    expect(fit.scrollWidth).toBeLessThanOrEqual(fit.viewport + 1);
  }
});

test('movimento reduzido desliga a animação decorativa', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(loginUrl);
  const state = await page.evaluate(() => ({
    ship: getComputedStyle(document.querySelector('.login-ship-moving')).animationName,
    wave: getComputedStyle(document.querySelector('.login-wave-track')).animationName,
    travellerOpacity: getComputedStyle(document.querySelector('#loginJourneyTraveller')).opacity
  }));
  expect(state.ship).toBe('none');
  expect(state.wave).toBe('none');
  expect(state.travellerOpacity).toBe('0');
});

test('campos e botão continuam acessíveis no celular sem rolagem lateral', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome');
  await page.goto(loginUrl);
  await expect(page.locator('#loginForm')).toBeVisible();
  await page.locator('.login-submit').scrollIntoViewIfNeeded();
  await expect(page.locator('.login-submit')).toBeInViewport();
  const fit = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(fit.width).toBeLessThanOrEqual(fit.viewport + 1);
});

test('verificador mantém o cartão inteiro dentro da janela', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.setViewportSize({ width: 999, height: 572 });
  await page.goto(loginUrl);
  await page.locator('#turnstileWidget').evaluate(element => { element.hidden = false; });
  const fit = await page.evaluate(() => {
    const card = document.querySelector('.login-card').getBoundingClientRect();
    const widget = document.querySelector('#turnstileWidget').getBoundingClientRect();
    return { top: card.top, bottom: card.bottom, widgetBottom: widget.bottom, height: innerHeight };
  });
  expect(fit.top).toBeGreaterThanOrEqual(0);
  expect(fit.bottom).toBeLessThanOrEqual(fit.height);
  expect(fit.widgetBottom).toBeLessThanOrEqual(fit.bottom);
});

test('validação, alternância de senha e envio por Enter funcionam no formulário real', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.goto(loginUrl);
  const form = page.locator('#loginForm');
  const username = page.locator('#loginUsername');
  const password = page.locator('#loginPassword');
  await form.locator('button[type="submit"]').click();
  expect(await form.evaluate(element => element.checkValidity())).toBe(false);
  await username.fill('teste.qa');
  await password.fill('senha-de-teste');
  await page.locator('#loginPasswordToggle').click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.locator('#loginPasswordToggle').click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.evaluate(() => {
    window.__loginSubmittedByEnter = false;
    document.querySelector('#loginForm').addEventListener('submit', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.__loginSubmittedByEnter = true;
    }, true);
  });
  await password.press('Enter');
  expect(await page.evaluate(() => window.__loginSubmittedByEnter)).toBe(true);
});
