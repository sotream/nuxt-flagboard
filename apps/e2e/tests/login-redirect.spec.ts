import { expect, test } from '@playwright/test';

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? '';

test.describe('opening the sign-in page with a trailing slash', () => {
  test.skip(adminPassword === '', 'SEED_ADMIN_PASSWORD is not set (see .env.example)');

  test('stays on the sign-in page without a redirect target, and signing in leads home', async ({
    page,
  }) => {
    await page.goto('/login/');
    await expect(page.getByRole('heading', { name: 'Sign in to Flagboard' })).toBeVisible();
    // The sign-in page must not name itself as the place to go after signing in.
    await expect.poll(() => new URL(page.url()).search).toBe('');
    expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe('/login');

    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password').fill(adminPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('sends a signed-in user from /login/ to the home page', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password').fill(adminPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

    await page.goto('/login/');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });
});
