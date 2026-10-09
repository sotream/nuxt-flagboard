import { AxeBuilder } from '@axe-core/playwright';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import type { APIRequestContext, Browser, Page } from '@playwright/test';

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? '';

const stamp = Date.now();
const compoundKey = `identity-${stamp}`;
const wordKey = `identity-word-${stamp}`;
const KEY_NAME = `Identity test ${stamp}`;
// One project with a 120 character name, made once and kept (projects cannot be deleted); a second run gets a 409.
const LONG_PROJECT = { key: 'identity-long-name', name: 'W'.repeat(120) };
const COMPOUND_NAME = 'Zahlungsverfahren-Konfigurationsverwaltung-und-Berechtigungsverwaltung';
const WORD_NAME = 'W'.repeat(120); // one word without a space: the layout must not break around it

type Theme = 'light' | 'dark';
const THEMES: Theme[] = ['light', 'dark'];

const pages = [
  {
    name: 'flag list',
    path: '/projects/demo',
    ready: (p: Page) => p.getByText(COMPOUND_NAME).first(),
  },
  {
    name: 'flag page',
    path: `/projects/demo/flags/${compoundKey}`,
    ready: (p: Page) => p.getByRole('heading', { name: COMPOUND_NAME }),
  },
  {
    name: 'audit log',
    path: '/projects/demo/audit',
    ready: (p: Page) => p.getByText('Created the flag').first(),
  },
  {
    name: 'keys page',
    path: '/projects/demo/keys',
    ready: (p: Page) => p.getByRole('rowheader', { name: KEY_NAME }),
  },
  {
    name: 'projects page',
    path: '/',
    ready: (p: Page) => p.getByRole('link', { name: /Demo project/ }),
  },
];
const longProjectPage: (typeof pages)[number] = {
  name: 'project with a long name',
  path: `/projects/${LONG_PROJECT.key}`,
  ready: (p: Page) => p.getByRole('heading', { name: LONG_PROJECT.name }),
};

/** Creates the data the pages need through the API, and removes what it can at the end. */
async function seed(request: APIRequestContext, origin: string) {
  const login = await request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email: adminEmail, password: adminPassword },
  });
  expect(login.ok()).toBe(true);
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const post = async (path: string, data: unknown) => {
    const response = await request.post(path, { headers, data });
    expect(response.status(), path).toBe(201);
    return (await response.json()) as { id: string };
  };
  const project = await request.post('/api/v1/projects', { headers, data: LONG_PROJECT });
  expect([201, 409]).toContain(project.status());
  await post('/api/v1/projects/demo/flags', {
    key: compoundKey,
    name: COMPOUND_NAME,
    type: 'boolean',
  });
  await post('/api/v1/projects/demo/flags', { key: wordKey, name: WORD_NAME, type: 'boolean' });
  const key = await post('/api/v1/projects/demo/keys', {
    environment: 'dev',
    kind: 'client',
    name: KEY_NAME,
  });
  // Gives the audit log an environment change to show.
  const change = await request.patch(
    `/api/v1/projects/demo/flags/${compoundKey}/environments/dev`,
    {
      headers,
      data: { revision: 1, enabled: true, rolloutPercentage: 30 },
    },
  );
  expect(change.ok()).toBe(true);
  return async () => {
    await request.delete(`/api/v1/projects/demo/keys/${key.id}`, { headers });
    for (const flagKey of [compoundKey, wordKey]) {
      await request.patch(`/api/v1/projects/demo/flags/${flagKey}`, {
        headers,
        data: { archived: true },
      });
    }
  };
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Password').fill(adminPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
}

/** Enters a theme through the real toggle, which cycles system, light and dark. */
async function setTheme(page: Page, theme: Theme): Promise<void> {
  // The accessible name starts with the text on the button: "Auto theme, ...", "Light theme. ...", "Dark theme. ...".
  const toggle = page.getByRole('button', { name: /^(Auto|Light|Dark) theme/ });
  const wanted = `${theme === 'light' ? 'Light' : 'Dark'} theme`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const label = (await toggle.getAttribute('aria-label')) ?? '';
    if (label.startsWith(wanted)) {
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
      else await expect(page.locator('html')).not.toHaveClass(/dark/);
      return;
    }
    await toggle.click();
  }
  throw new Error(`could not switch to the ${theme} theme`);
}

async function visit(page: Page, target: (typeof pages)[number]): Promise<void> {
  await page.goto(target.path);
  await expect(target.ready(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

const overflow = (page: Page) =>
  page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));

async function newSignedInPage(browser: Browser, setup?: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await setup?.(page);
  await signIn(page);
  return { page, close: () => context.close() };
}

test.describe('visual identity', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(adminPassword === '', 'SEED_ADMIN_PASSWORD is not set (see .env.example)');

  let cleanup: () => Promise<void>;
  let api: APIRequestContext;
  let page: Page;
  let close: () => Promise<void>;
  const requested: string[] = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    // The `request` fixture of a test cannot be used again in afterAll, so this context is made and disposed here.
    api = await playwrightRequest.newContext({ baseURL });
    cleanup = await seed(api, baseURL ?? 'http://localhost:3010');
    const signedIn = await newSignedInPage(browser);
    page = signedIn.page;
    close = signedIn.close;
    page.on('request', (r) => requested.push(r.url()));
  });

  test.afterAll(async () => {
    await close?.();
    await cleanup?.();
    await api?.dispose();
  });

  for (const theme of THEMES) {
    for (const target of pages) {
      test(`axe finds nothing on the ${target.name} in the ${theme} theme`, async () => {
        await setTheme(page, theme);
        await visit(page, target);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.map((v) => ({
            rule: v.id,
            targets: v.nodes.map((n) => n.target.join(' ')),
          })),
        ).toEqual([]);
      });
    }
  }

  test('uses Geologica for text and Geist Mono for keys, loading only the files it needs', async ({
    baseURL,
  }) => {
    await visit(page, pages[0]!);
    const fonts = await page.evaluate(() => ({
      loaded: document.fonts.check('13px Geologica'),
      body: getComputedStyle(document.body).fontFamily,
      mono: getComputedStyle(document.querySelector('.font-mono') ?? document.body).fontFamily,
      files: performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((name) => name.includes('/fonts/')),
    }));
    expect(fonts.loaded).toBe(true);
    expect(fonts.body).toMatch(/^"?Geologica"?/);
    expect(fonts.mono).toMatch(/^"?Geist Mono"?/);
    expect(fonts.files.some((f) => f.endsWith('/fonts/geologica-latin.woff2'))).toBe(true);
    expect(fonts.files.some((f) => f.endsWith('/fonts/geist-mono-latin.woff2'))).toBe(true);
    expect(fonts.files.some((f) => f.includes('cyrillic'))).toBe(false); // English content needs no Cyrillic
    for (const file of fonts.files)
      expect(file.startsWith(baseURL ?? 'http://localhost:3010')).toBe(true);
  });

  test('makes no request to any other origin', async ({ baseURL }) => {
    await setTheme(page, 'dark');
    for (const target of pages) await visit(page, target);
    const origin = baseURL ?? 'http://localhost:3010';
    const foreign = requested.filter(
      (url) => !url.startsWith(origin) && !/^(data|blob):/.test(url),
    );
    expect(foreign).toEqual([]);
    expect(requested.length).toBeGreaterThan(10);
  });

  for (const target of [pages[4]!, pages[0]!, pages[1]!, pages[2]!, pages[3]!]) {
    test(`shows a visible, unclipped focus ring on every Tab stop of the ${target.name}`, async () => {
      await setTheme(page, 'light');
      await visit(page, target);
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      const stops: {
        tag: string;
        label: string;
        style: string;
        width: number;
        clippedBy?: string;
      }[] = [];
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
          const element = document.activeElement;
          if (!element || element === document.body) return undefined;
          const style = getComputedStyle(element);
          const width = Number.parseFloat(style.outlineWidth);
          // The ring is drawn outside (or, with a negative offset, inside) the element by offset + width.
          const grow = Number.parseFloat(style.outlineOffset) + width;
          const box = element.getBoundingClientRect();
          const ring = {
            left: box.left - grow,
            right: box.right + grow,
            top: box.top - grow,
            bottom: box.bottom + grow,
          };
          let clippedBy: string | undefined;
          for (
            let up = element.parentElement;
            up && up !== document.documentElement;
            up = up.parentElement
          ) {
            const overflow = getComputedStyle(up);
            if (overflow.overflowX === 'visible' && overflow.overflowY === 'visible') continue;
            const clip = up.getBoundingClientRect();
            const outside =
              ring.left < clip.left - 0.5 ||
              ring.right > clip.right + 0.5 ||
              ring.top < clip.top - 0.5 ||
              ring.bottom > clip.bottom + 0.5;
            if (outside) {
              clippedBy = `${up.tagName.toLowerCase()}.${String(up.className).split(' ').slice(0, 3).join('.')}`;
              break;
            }
          }
          return {
            tag: element.tagName.toLowerCase(),
            label: (element.getAttribute('aria-label') ?? element.textContent ?? '')
              .trim()
              .slice(0, 30),
            style: style.outlineStyle,
            width,
            clippedBy,
          };
        });
        if (!stop) break;
        stops.push(stop);
      }
      expect(stops.length).toBeGreaterThan(3);
      for (const stop of stops) {
        expect(stop.style, `${stop.tag} "${stop.label}" has an outline`).not.toBe('none');
        expect(stop.width, `${stop.tag} "${stop.label}" outline width`).toBeGreaterThanOrEqual(2);
        expect(
          stop.clippedBy,
          `${stop.tag} "${stop.label}" ring is cut off by an ancestor`,
        ).toBeUndefined();
      }
    });
  }

  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [320, 640], // the narrowest width WCAG asks content to reflow to without sideways scrolling
  ] as const) {
    test(`keeps long names inside the page at ${width} px`, async () => {
      await page.setViewportSize({ width, height });
      for (const target of [
        pages[0]!,
        pages[2]!,
        longProjectPage,
        {
          ...pages[1]!,
          path: `/projects/demo/flags/${wordKey}`,
          ready: (p: Page) => p.getByRole('heading', { name: WORD_NAME }),
        },
      ]) {
        await visit(page, target);
        const { scroll, client } = await overflow(page);
        expect(scroll, `${target.name} scrolls sideways`).toBeLessThanOrEqual(client);
      }
      await page.setViewportSize({ width: 1280, height: 800 });
    });
  }

  test('respects reduced motion: the switch does not animate', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await visit(page, pages[1]!);
    const duration = await page
      .getByRole('switch', { name: /Enabled in/ })
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(Number.parseFloat(duration)).toBe(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('stays readable and tidy when the font files fail to load', async ({ browser }) => {
    const fallback = await newSignedInPage(browser, async (p) => {
      await p.route('**/fonts/*.woff2', (route) => route.abort());
    });
    try {
      await fallback.page.setViewportSize({ width: 390, height: 844 });
      const flagPage = {
        ...pages[1]!,
        path: `/projects/demo/flags/${wordKey}`,
        ready: (p: Page) => p.getByRole('heading', { name: WORD_NAME }),
      };
      await visit(fallback.page, flagPage);
      const { scroll, client } = await overflow(fallback.page);
      expect(scroll).toBeLessThanOrEqual(client);
      const results = await new AxeBuilder({ page: fallback.page }).withTags(['wcag2aa']).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    } finally {
      await fallback.close();
    }
  });
});
