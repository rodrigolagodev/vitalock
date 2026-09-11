import { expect, login, test } from '../fixtures';

test.describe('admin — authentication', () => {
  test('unauthenticated visit is redirected to /login', async ({ page }) => {
    await page.goto('/administraciones');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('admin signs in and lands on Administraciones', async ({ page }) => {
    await login(page, 'admin');
    await expect(page).toHaveURL(/\/administraciones$/);
    await expect(page.getByRole('heading', { name: 'Administraciones' })).toBeVisible();
  });

  test('an installer account is rejected by the admin app', async ({ page }) => {
    // P0-5: the only role gate used to be this client check. It must still hold
    // (server guards are proven in pgTAP test_131); the user must see why.
    await page.goto('/login');
    await page.getByLabel('Email').fill('installer@vitalock.local');
    await page.getByLabel('Contraseña').fill('Installer123!');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/(login|error)/);
    await expect(page.getByRole('heading', { name: 'Administraciones' })).toHaveCount(0);
  });
});
