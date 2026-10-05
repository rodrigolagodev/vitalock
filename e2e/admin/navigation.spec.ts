import { expect, login, test } from '../fixtures';
import { ROUTES } from './routes';

/**
 * Every lazy route chunk renders its page heading inside the shell. Catches a
 * broken dynamic import or a route-level boundary firing on first paint —
 * neither is visible to the component tests, which never load main.tsx.
 */
test.describe('admin — every route renders', () => {
  test.beforeEach(async ({ page }) => login(page, 'admin'));

  for (const [path, heading] of ROUTES) {
    test(`${path} renders its page`, async ({ page }) => {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { level: 1, name: heading, exact: true }),
      ).toBeVisible();
      // The route boundary's fallback must not be what rendered.
      await expect(page.getByText('Algo salió mal al mostrar esta pantalla.')).toHaveCount(0);
    });
  }
});
