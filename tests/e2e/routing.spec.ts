import { expect, test } from '@playwright/test';

/**
 * Console error messages that are benign in the test environment.
 * The CSP frame-ancestors directive is always ignored in <meta> tags;
 * browsers log a console error but it has no runtime effect.
 */
const IGNORED_CONSOLE_ERRORS = [
  "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via",
];

const ROUTES = [
  { path: '/#/', name: 'Player', linkName: 'Player' },
  { path: '/#/instrument', name: 'Instrument', linkName: 'Instrument' },
  { path: '/#/analysis', name: 'Analysis', linkName: 'Analysis' },
  { path: '/#/settings', name: 'Settings', linkName: 'Settings' },
];

// Playlist route still exists but has no nav link — sidebar is always visible on desktop
const DIRECT_ONLY_ROUTES = [{ path: '/#/playlist', name: 'Playlist' }];

test.describe('Routing and deep links', () => {
  test('clicking each nav link navigates to the correct route', async ({
    page,
  }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });

    for (const route of ROUTES) {
      const link = nav.getByRole('link', { name: route.linkName });
      await link.click();

      // URL should contain the route's hash
      await expect(page).toHaveURL(new RegExp(route.path.replace('/', '\\/')));
      await expect(page.locator('#root')).not.toBeEmpty();
    }
  });

  test('direct navigation to each route URL works', async ({ page }) => {
    for (const route of [...ROUTES, ...DIRECT_ONLY_ROUTES]) {
      await page.goto(route.path);
      await expect(page.locator('#root')).not.toBeEmpty();
    }
  });

  test('active nav link shows current page indicator', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });

    for (const route of ROUTES) {
      await nav.getByRole('link', { name: route.linkName }).click();

      const activeLink = nav.getByRole('link', { name: route.linkName });

      // The active link should have aria-current="page"
      await expect(activeLink).toHaveAttribute('aria-current', 'page');
    }
  });

  test('browser back/forward navigation works', async ({ page }) => {
    await page.goto('/#/');

    // Navigate to Instrument
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Instrument' })
      .click();
    await expect(page).toHaveURL(/\/#\/instrument/);

    // Navigate to Settings
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Settings' })
      .click();
    await expect(page).toHaveURL(/\/#\/settings/);

    // Go back → should be Instrument
    await page.goBack();
    await expect(page).toHaveURL(/\/#\/instrument/);

    // Go back → should be Player (root)
    await page.goBack();
    await expect(page).toHaveURL(/\/#\//);

    // Go forward → should be Instrument
    await page.goForward();
    await expect(page).toHaveURL(/\/#\/instrument/);
  });

  test('invalid route shows not-found page', async ({ page }) => {
    await page.goto('/#/nonexistent-route');

    // The catch-all route renders "Page Not Found" in the main content area
    const main = page.locator('#main-content');
    await expect(
      main.getByRole('heading', { name: 'Page Not Found' }),
    ).toBeAttached();
    await expect(main.getByText('does not exist')).toBeAttached();
  });

  test('not-found page has a link back to Player', async ({ page }) => {
    await page.goto('/#/nonexistent-route');

    const main = page.locator('#main-content');
    const backLink = main.getByRole('link', { name: /return to player/i });
    await expect(backLink).toBeAttached();

    await backLink.click({ force: true });
    await expect(page).toHaveURL(/\/#\//);
  });

  test('no console errors during route transitions', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (
        msg.type() === 'error' &&
        !IGNORED_CONSOLE_ERRORS.some((ignored) => msg.text().includes(ignored))
      ) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });

    for (const route of ROUTES) {
      await nav.getByRole('link', { name: route.linkName }).click();
      await expect(page.locator('#root')).not.toBeEmpty();
    }

    await page.waitForTimeout(500);
    expect(consoleErrors).toEqual([]);
  });
});
