import { expect, login, test } from '../fixtures';

test.describe('installer — authentication', () => {
  test('installer signs in and sees the worklist shell', async ({ page }) => {
    await login(page, 'installer');
    await expect(page.getByText('Algo salió mal al mostrar esta pantalla.')).toHaveCount(0);
    // Bottom navigation is the installer's primary chrome.
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('an admin account is rejected by the installer app', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@vitalock.local');
    await page.getByLabel('Contraseña').fill('Admin123!');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/(login|error)/);
  });
});
