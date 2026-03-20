import { test, expect } from '@playwright/test';

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
  { path: '/#/playlist', name: 'Playlist', linkName: 'Playlist' },
  { path: '/#/instrument', name: 'Instrument', linkName: 'Instrument' },
  { path: '/#/analysis', name: 'Analysis', linkName: 'Analysis' },
  { path: '/#/settings', name: 'Settings', linkName: 'Settings' },
];

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
    for (const route of ROUTES) {
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

    // Navigate to Playlist
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Playlist' })
      .click();
    await expect(page).toHaveURL(/\/#\/playlist/);

    // Navigate to Settings
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Settings' })
      .click();
    await expect(page).toHaveURL(/\/#\/settings/);

    // Go back → should be Playlist
    await page.goBack();
    await expect(page).toHaveURL(/\/#\/playlist/);

    // Go back → should be Player (root)
    await page.goBack();
    await expect(page).toHaveURL(/\/#\//);

    // Go forward → should be Playlist
    await page.goForward();
    await expect(page).toHaveURL(/\/#\/playlist/);
  });

  test('invalid route shows not-found page', async ({ page }) => {
    await page.goto('/#/nonexistent-route');

    // The catch-all route renders "Page Not Found" with role="alert"
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Page Not Found')).toBeVisible();
  });

  test('not-found page has a link back to Player', async ({ page }) => {
    await page.goto('/#/nonexistent-route');

    const backLink = page.getByRole('link', { name: /return to player/i });
    await expect(backLink).toBeVisible();

    await backLink.click();
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
