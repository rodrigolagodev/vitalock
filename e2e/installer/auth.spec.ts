import { expect, login, test } from '../fixtures';

test.describe('installer — authentication', () => {
  test('installer signs in and sees the worklist shell', async ({ page }) => {
    await login(page, 'installer');
    await expect(page.getByText('Algo salió mal al mostrar esta pantalla.')).toHaveCount(0);
    // The shell navigates through a bottom tab bar at every width.
    await expect(
      page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Tareas' }),
    ).toBeVisible();
  });

  test('an admin account is rejected by the installer app', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@vitalock.local');
    await page.getByLabel('Contraseña', { exact: true }).fill('Admin12345!');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/(login|error)/);
  });
});
