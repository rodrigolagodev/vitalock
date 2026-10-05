import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { expect, login, test } from '../fixtures';
import { ROUTES } from './routes';

/**
 * Accessibility gate: every admin list route, plus the two order-creation forms
 * after a failed submit (so the FormField error wiring is audited), in both
 * colour schemes. Fails on `serious` or `critical` WCAG 2.0/2.1 A and AA
 * violations. Colour contrast is never disabled.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/** rule id -> why it is excluded. Every entry needs a written reason. */
const EXCLUDED_RULES: Record<string, string> = {};

const FORMS: ReadonlyArray<[path: string, submit: string]> = [
  ['/llaves/nueva', 'Crear y confirmar orden'],
  ['/servicio-tecnico/nueva', 'Crear y confirmar orden'],
];

async function audit(page: Page, testInfo: TestInfo, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(Object.keys(EXCLUDED_RULES))
    .analyze();
  await testInfo.attach(`axe-${label}.json`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  const blocking = results.violations.filter((v) => v.impact && BLOCKING_IMPACTS.has(v.impact));
  const message = blocking
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n` +
        v.nodes.map((n) => `    ${n.target.join(' ')}`).join('\n'),
    )
    .join('\n');
  expect(blocking.length, `axe violations on ${label}:\n${message}`).toBe(0);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`admin a11y (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test.beforeEach(async ({ page }) => login(page, 'admin'));

    for (const [path, heading] of ROUTES) {
      test(`${path} has no serious or critical violations`, async ({ page }, testInfo) => {
        await page.goto(path);
        await expect(
          page.getByRole('heading', { level: 1, name: heading, exact: true }),
        ).toBeVisible();
        await audit(page, testInfo, `${scheme}${path.replaceAll('/', '_')}`);
      });
    }

    for (const [path, submit] of FORMS) {
      test(`${path} after an invalid submit has no serious or critical violations`, async ({
        page,
      }, testInfo) => {
        await page.goto(path);
        await page.getByRole('button', { name: submit }).click();
        await expect(page.getByRole('alert').first()).toBeVisible();
        await audit(page, testInfo, `${scheme}${path.replaceAll('/', '_')}-invalid`);
      });
    }
  });
}
