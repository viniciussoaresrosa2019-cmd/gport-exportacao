import { test, expect } from '@playwright/test';

const profiles = [
  { key: 'ADMIN', name: 'Administrador', visible: ['#processNav', '#reportsNav', '#usersNav'] },
  { key: 'ANALYST', name: 'Analista', visible: ['#processNav', '#vgmNav', '#releaseNav', '#followupNav'] },
  { key: 'VGM', name: 'VGM', visible: ['#processNav', '#vgmNav'] },
  { key: 'RELEASE', name: 'Liberação', visible: ['#processNav', '#releaseNav'] }
];

for (const profile of profiles) {
  test.describe(`${profile.name} — homologação autenticada`, () => {
    test.skip(!process.env[`E2E_${profile.key}_USER`] || !process.env[`E2E_${profile.key}_PASSWORD`], `Defina as credenciais E2E_${profile.key}_USER/PASSWORD fora do código.`);

    test('sessão, navegação autorizada e acessibilidade básica', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#loginDialog')).toBeVisible();
      await page.locator('#loginForm [name="username"]').fill(process.env[`E2E_${profile.key}_USER`]);
      await page.locator('#loginForm [name="password"]').fill(process.env[`E2E_${profile.key}_PASSWORD`]);
      const loginResponse = page.waitForResponse(response => response.url().includes('/api/auth/login'));
      await page.locator('#loginForm button[type="submit"]').click();
      expect((await loginResponse).status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Planilha de processos' })).toBeVisible();
      await expect(page.locator('#rows')).not.toHaveAttribute('aria-busy', 'true');

      if ((page.viewportSize()?.width || 1024) > 850) {
        for (const selector of profile.visible) await expect(page.locator(selector)).toBeVisible();
      } else {
        await expect(page.locator('.mobile-nav')).toBeVisible();
      }
      await expect(page.locator('label:not([for])')).toHaveCount(0);
      const namelessButtons = await page.locator('button').evaluateAll(buttons => buttons.filter(button => !button.textContent.trim() && !button.getAttribute('aria-label')).length);
      expect(namelessButtons).toBe(0);

      const processRow = page.locator('#rows tr[data-id]').first();
      if (await processRow.count()) {
        await expect(processRow).toHaveAttribute('tabindex', '0');
        await expect(processRow.locator('.indicator-cell .status-text')).toHaveCount(2);
        await processRow.focus();
      }

      if ((page.viewportSize()?.width || 1024) > 850) await page.locator('#settingsNav').click();
      else await page.locator('#mobileNav').getByRole('button', { name: /Configurações/ }).click();
      await expect(page.locator('#settingsDialog')).toBeVisible();
      await page.locator('#settingsLogoutBtn').click();
      await expect(page.locator('#loginDialog')).toBeVisible();
    });
  });
}
