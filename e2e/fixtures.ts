import { test as base, expect, type Page } from '@playwright/test';

/** Seeded by supabase/seed-users.sql on `supabase start` / `supabase db reset`. */
export const USERS = {
  admin: { email: 'admin@vitalock.local', password: 'Admin123!' },
  installer: { email: 'installer@vitalock.local', password: 'Installer123!' },
} as const;

export async function login(page: Page, user: keyof typeof USERS): Promise<void> {
  const { email, password } = USERS[user];
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

export const test = base;
export { expect };
