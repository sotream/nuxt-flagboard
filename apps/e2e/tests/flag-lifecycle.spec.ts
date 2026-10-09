import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? '';

/** The seed shows its keys only once, so the test mints its own server key and revokes it at the end. */
async function createServerKey(request: APIRequestContext, origin: string) {
  const login = await request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: adminEmail, password: adminPassword },
  });
  expect(login.ok()).toBe(true);
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const created = await request.post('/api/v1/projects/demo/keys', {
    headers,
    data: { environment: 'dev', kind: 'server', name: 'e2e browser test' },
  });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as { id: string; key: string };
  return {
    key: body.key,
    revoke: () => request.delete(`/api/v1/projects/demo/keys/${body.id}`, { headers }),
    // Archived flags drop out of the default list, so repeated local runs do not leave "E2E ..." flags behind.
    archiveFlag: (flagKey: string) =>
      request.patch(`/api/v1/projects/demo/flags/${flagKey}`, {
        headers,
        data: { archived: true },
      }),
  };
}

test('sign in, create a flag, switch it on, and the public API follows', async ({
  page,
  request,
  baseURL,
}) => {
  test.skip(adminPassword === '', 'SEED_ADMIN_PASSWORD is not set (see .env.example)');
  const flagKey = `e2e-${Date.now()}`;
  const serverKey = await createServerKey(request, baseURL ?? 'http://localhost:3010');
  const evaluate = async (): Promise<{ value: unknown; reason: string }> => {
    const response = await request.post('/v1/evaluate', {
      headers: { Authorization: `Bearer ${serverKey.key}` },
      data: { flags: [flagKey] },
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      flags: Record<string, { value: unknown; reason: string }>;
    };
    return body.flags[flagKey] ?? { value: undefined, reason: 'MISSING' };
  };

  try {
    // Sign in
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password').fill(adminPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Create a flag in the demo project
    await page.getByRole('link', { name: /demo/i }).first().click();
    await page.getByRole('button', { name: 'New flag' }).first().click();
    await page.getByLabel('Name', { exact: true }).fill(`E2E ${flagKey}`);
    await page.getByLabel('Key', { exact: true }).fill(flagKey);
    await page.getByRole('button', { name: 'Create flag' }).click();
    // Creating a flag opens its page
    await expect(page.getByRole('heading', { name: `E2E ${flagKey}` })).toBeVisible();

    // A new flag is off, so the public API says so
    expect(await evaluate()).toMatchObject({ value: false, reason: 'DISABLED' });

    // The accessibility scan runs on the finished page, with the switch in view
    const results = await new AxeBuilder({ page }).analyze();
    // Reduced to rule and elements so a failure is readable
    expect(
      results.violations.map((v) => ({
        rule: v.id,
        targets: v.nodes.map((n) => n.target.join(' ')),
      })),
    ).toEqual([]);

    // Switch it on (saved at once). A new flag rolls out to 0 %, so it is still false for everyone...
    const toggle = page.getByRole('switch', { name: /Enabled in/ });
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(page.getByText(/revision 2/)).toBeVisible();
    expect(await evaluate()).toMatchObject({ value: false });

    // ...until the rollout reaches everyone. Then the public API follows.
    await page.getByRole('textbox', { name: 'Rollout percentage' }).fill('100');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(evaluate).toMatchObject({ value: true });
  } finally {
    await serverKey.revoke();
    await serverKey.archiveFlag(flagKey);
  }
});
