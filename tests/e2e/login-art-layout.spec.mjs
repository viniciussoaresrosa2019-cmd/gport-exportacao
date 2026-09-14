import { expect, test } from '@playwright/test';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const loginUrl = pathToFileURL(process.env.LOGIN_PREVIEW_FILE ? resolve(process.env.LOGIN_PREVIEW_FILE) : fileURLToPath(new URL('../../public/index.html', import.meta.url))).href;

test('dois painéis e cartão permanecem inteiros em três larguras de desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  for (const viewport of [{ width: 999, height: 572 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto(loginUrl);
    await expect(page.locator('#loginTerminalArt')).toBeVisible();
    await page.locator('.login-card').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    const layout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      return {
        stage: rect('.login-stage').toJSON(), access: rect('.login-access').toJSON(),
        card: rect('.login-card').toJSON(), areas: rect('.login-areas li:last-child').toJSON(),
        scene: rect('#loginTerminalScene').toJSON(),
        viewport: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth
      };
    });
    expect(layout.stage.width / layout.viewport).toBeCloseTo(.58, 2);
    expect(layout.access.width / layout.viewport).toBeCloseTo(.42, 2);
    expect(layout.access.right).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.card.left).toBeGreaterThan(layout.stage.right);
    expect(layout.card.right).toBeLessThan(layout.viewport);
    expect(layout.card.bottom).toBeLessThanOrEqual(layout.height);
    expect(layout.scene.left).toBeLessThan(layout.stage.right);
    expect(layout.scene.top).toBeLessThan(layout.stage.bottom);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport + 1);
    await page.screenshot({ path: testInfo.outputPath(`desktop-${viewport.width}.png`) });
  }
});

test('fonte ampliada não corta o login nem causa rolagem lateral', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(loginUrl);
  await page.evaluate(() => document.body.classList.add('accessibility-xlarge'));
  const fit = await page.evaluate(() => ({
    card: document.querySelector('.login-card').getBoundingClientRect().toJSON(),
    access: document.querySelector('.login-access').getBoundingClientRect().toJSON(),
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(fit.access.right).toBeLessThanOrEqual(fit.viewport + 1);
  expect(fit.card.right).toBeLessThan(fit.viewport);
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.viewport + 1);
});

test('verificação de segurança permanece dentro do cartão', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.setViewportSize({ width: 999, height: 572 });
  await page.goto(loginUrl);
  await page.waitForFunction(() => document.querySelector('#turnstileWidget').dataset.size === 'compact');
  // A provider-sized iframe tests intrinsic sizing, not just an empty div.
  await page.locator('#turnstileWidget').evaluate(element => {
    element.hidden = false;
    const frame = document.createElement('iframe');
    frame.width = '150'; frame.height = '140'; frame.title = 'Dimensões de teste do widget';
    element.append(frame);
  });
  await page.locator('.login-card').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  const fit = await page.evaluate(() => ({
    card: document.querySelector('.login-card').getBoundingClientRect().toJSON(),
    widget: document.querySelector('#turnstileWidget').getBoundingClientRect().toJSON(),
    viewport: innerWidth, height: innerHeight
  }));
  expect(fit.card.right).toBeLessThan(fit.viewport);
  expect(fit.card.bottom).toBeLessThanOrEqual(fit.height);
  expect(fit.widget.left).toBeGreaterThanOrEqual(fit.card.left);
  expect(fit.widget.right).toBeLessThanOrEqual(fit.card.right);
  expect(await page.locator('#turnstileWidget').evaluate(node => getComputedStyle(node).transform)).toBe('none');
  await page.screenshot({ path: testInfo.outputPath('security-compact.png') });
});

test('terminal completa um ciclo de içamento sem romper cabos', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(40000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(loginUrl);
  await expect(page.locator('#loginTerminalArt')).toBeVisible();
  const samples = [];
  for (let second = 0; second <= 16; second += 2) {
    if (second > 0) await page.waitForTimeout(2000);
    samples.push(await page.evaluate(() => {
      const matrix = id => document.querySelector(id).transform.baseVal.consolidate().matrix;
      const trolley = matrix('#loginTerminalTrolley');
      const cargo = matrix('#loginTerminalLoad');
      const cable = document.querySelector('#loginTerminalCables .login-terminal-cable-line').getAttribute('d');
      const numbers = cable.match(/-?\d+(?:\.\d+)?/g).map(Number);
      return {
        trolleyX: trolley.e, trolleyY: trolley.f, cargoX: cargo.e, cargoY: cargo.f,
        cableStart: [numbers[0], numbers[1]], cableEnd: [numbers[2], numbers[3]], cable
      };
    }));
    if ([0, 4, 8, 12, 16].includes(second)) await page.screenshot({ path: testInfo.outputPath(`cycle-${second}.png`) });
  }
  const range = key => Math.max(...samples.map(sample => sample[key])) - Math.min(...samples.map(sample => sample[key]));
  expect(range('trolleyX')).toBeGreaterThan(10);
  expect(range('cargoY')).toBeGreaterThan(15);
  expect(samples.every(sample => Math.abs(sample.trolleyX - sample.cargoX) < .01)).toBe(true);
  expect(samples.every(sample => Math.abs(sample.cableEnd[0] - (566 + sample.cargoX)) < .02 && Math.abs(sample.cableEnd[1] - (445 + sample.cargoY)) < .02)).toBe(true);
  await testInfo.attach('motion-samples', { body: JSON.stringify(samples), contentType: 'application/json' });
});

test('ondas deslizam e o navio acompanha o balanço sem navegar lateralmente', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(loginUrl);
  const sample = () => page.evaluate(() => {
    const transform = selector => getComputedStyle(document.querySelector(selector)).transform;
    const translateX = transformValue => new DOMMatrixReadOnly(transformValue).e;
    return {
      sea: transform('.login-sea-motion img'),
      ship: transform('.login-ship-motion'),
      shipTranslateX: translateX(transform('.login-ship-motion')),
      waveFrame: document.querySelector('.login-wave-overlay').toDataURL(),
      waveMotion: document.querySelector('.login-wave-overlay').dataset.waveMotion
    };
  });
  const first = await sample();
  await page.waitForTimeout(2600);
  const later = await sample();
  expect(later.sea).toBe(first.sea);
  expect(later.ship).not.toBe(first.ship);
  expect(first.waveMotion).toBe('running');
  expect(later.waveFrame).not.toBe(first.waveFrame);
  expect(Math.abs(first.shipTranslateX)).toBeLessThan(.1);
  expect(Math.abs(later.shipTranslateX)).toBeLessThan(.1);
  await page.screenshot({ path: testInfo.outputPath('ship-and-sea-motion.png') });
});

test('movimento reduzido mantém cenário estático e completo', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(loginUrl);
  const firstTrolley = await page.locator('#loginTerminalTrolley').getAttribute('transform');
  const firstLoad = await page.locator('#loginTerminalLoad').getAttribute('transform');
  await page.waitForTimeout(600);
  expect(await page.locator('#loginTerminalTrolley').getAttribute('transform')).toBe(firstTrolley);
  expect(await page.locator('#loginTerminalLoad').getAttribute('transform')).toBe(firstLoad);
  await expect(page.locator('#loginTerminalArt')).toBeVisible();
  await expect(page.locator('.login-sea-motion img')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.login-ship-motion')).toHaveCSS('animation-name', 'none');
});

test('celular mantém formulário e cena acessíveis sem rolagem horizontal', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome');
  await page.goto(loginUrl);
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.locator('#loginTerminalScene')).toBeHidden();
  await page.locator('.login-card').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  await page.locator('#loginDialog').evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('mobile-top.png') });
  await page.locator('.login-submit').scrollIntoViewIfNeeded();
  await expect(page.locator('.login-submit')).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('mobile-form.png') });
  const fit = await page.evaluate(() => ({
    dialogWidth: document.querySelector('#loginDialog').scrollWidth,
    viewport: innerWidth,
    card: document.querySelector('.login-card').getBoundingClientRect().toJSON()
  }));
  expect(fit.dialogWidth).toBeLessThanOrEqual(fit.viewport + 1);
  expect(fit.card.left).toBeGreaterThanOrEqual(0);
  expect(fit.card.right).toBeLessThanOrEqual(fit.viewport);
});

test('validação e alternância da senha permanecem funcionais', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.goto(loginUrl);
  const form = page.locator('#loginForm');
  await form.locator('button[type="submit"]').click();
  expect(await form.evaluate(element => element.checkValidity())).toBe(false);
  await page.locator('#loginUsername').fill('teste.qa');
  await page.locator('#loginPassword').fill('senha-de-teste');
  await page.locator('#loginPasswordToggle').click();
  await expect(page.locator('#loginPassword')).toHaveAttribute('type', 'text');
  await page.locator('#loginPasswordToggle').click();
  await expect(page.locator('#loginPassword')).toHaveAttribute('type', 'password');
  await page.locator('#loginPassword').press('Enter');
  await expect(page.locator('#loginError')).toContainText('verificação de segurança');
  await expect(page.locator('#loginDialog')).toBeVisible();
  await expect(page.locator('.login-submit')).toBeEnabled();
});

test('telas baixas e estreitas permitem alcançar todos os controles', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  for (const viewport of [{ width: 1366, height: 480 }, { width: 820, height: 600 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await page.goto(loginUrl);
    await page.locator('#turnstileWidget').evaluate(node => { node.hidden = false; });
    await page.locator('#turnstileWidget').scrollIntoViewIfNeeded();
    await expect(page.locator('#turnstileWidget')).toBeInViewport();
    const fit = await page.locator('#loginDialog').evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }));
    expect(fit.scroll).toBeLessThanOrEqual(fit.width + 1);
  }
});
