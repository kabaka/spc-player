import { expect, test } from '@playwright/test';

/**
 * Console error messages that are benign in the test environment.
 * The CSP frame-ancestors directive is always ignored in <meta> tags;
 * browsers log a console error but it has no runtime effect.
 */
const IGNORED_CONSOLE_ERRORS = [
  "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via",
];

test.describe('Smoke tests', () => {
  test('app loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();

    expect(errors).toEqual([]);
  });

  test('page title is "SPC Player"', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('SPC Player');
  });

  test('sidebar Add Files button is visible and accessible', async ({
    page,
  }) => {
    await page.goto('/');

    const addFilesBtn = page.getByRole('button', { name: /add files/i });
    await expect(addFilesBtn).toBeVisible();
  });

  test('transport buttons exist but are disabled when no track is loaded', async ({
    page,
  }) => {
    await page.goto('/');

    const toolbar = page.getByRole('toolbar', { name: 'Playback controls' });
    await expect(toolbar).toBeVisible();

    const previousBtn = page.getByRole('button', { name: 'Previous track' });
    const playBtn = page.getByRole('button', { name: 'Play' });
    const nextBtn = page.getByRole('button', { name: 'Next track' });

    await expect(previousBtn).toBeDisabled();
    await expect(playBtn).toBeDisabled();
    await expect(nextBtn).toBeDisabled();
  });

  test('"No track loaded" text is visible when no track is loaded', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(
      page.locator('#player-controls').getByText('No track loaded'),
    ).toBeVisible();
  });

  test('no console errors during initial load', async ({ page }) => {
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
    await expect(page.locator('#root')).not.toBeEmpty();

    // Allow a brief settle for any async console messages
    await page.waitForLoadState('networkidle');

    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Route navigation', () => {
  const routes = [
    { path: '/#/', name: 'Player' },
    { path: '/#/instrument', name: 'Instrument' },
    { path: '/#/analysis', name: 'Analysis' },
    { path: '/#/settings', name: 'Settings' },
    // Playlist route still exists but has no nav link — sidebar is always visible on desktop
    { path: '/#/playlist', name: 'Playlist' },
  ];

  for (const route of routes) {
    test(`navigates to ${route.name} (${route.path})`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.locator('#root')).not.toBeEmpty();
    });
  }

  test('no console errors across all route navigations', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (
        msg.type() === 'error' &&
        !IGNORED_CONSOLE_ERRORS.some((ignored) => msg.text().includes(ignored))
      ) {
        consoleErrors.push(msg.text());
      }
    });

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.locator('#root')).not.toBeEmpty();
    }

    // Settle for async messages after final navigation
    await page.waitForTimeout(500);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Navigation bar', () => {
  test('navigation bar is visible with correct links', async ({ page }) => {
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).toBeVisible();

    await expect(nav.getByRole('link', { name: 'Player' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Instrument' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Analysis' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
    // No "Playlist" nav link — playlist is always visible in the sidebar on desktop
  });
});

test.describe('Theme toggle', () => {
  test('theme setting is present and functional on Settings page', async ({
    page,
  }) => {
    await page.goto('/#/settings');

    // Theme is now controlled via radio buttons on the Settings page
    const htmlLocator = page.locator('html');

    // Select the Light radio option
    const lightRadio = page.getByRole('radio', { name: /Light/ });
    await expect(lightRadio).toBeVisible();
    await lightRadio.check();

    await expect(htmlLocator).toHaveClass(/light/);

    // Switch to Dark
    const darkRadio = page.getByRole('radio', { name: /Dark/ });
    await darkRadio.check();

    await expect(htmlLocator).toHaveClass(/dark/);
  });
});
