import { test, expect } from '@playwright/test';

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

  test('drop zone is visible and accessible', async ({ page }) => {
    await page.goto('/');

    const dropZone = page.getByRole('button', {
      name: 'Drop SPC file here or click to browse',
    });

    await expect(dropZone).toBeVisible();
    await expect(dropZone).toHaveAttribute('tabindex', '0');
  });

  test('transport buttons exist but are disabled when no track is loaded', async ({
    page,
  }) => {
    await page.goto('/');

    const toolbar = page.getByRole('toolbar', { name: 'Playback controls' });
    await expect(toolbar).toBeVisible();

    const previousBtn = page.getByRole('button', { name: 'Previous track' });
    const playBtn = page.getByRole('button', { name: 'Play' });
    const stopBtn = page.getByRole('button', { name: 'Stop' });
    const nextBtn = page.getByRole('button', { name: 'Next track' });

    await expect(previousBtn).toBeDisabled();
    await expect(playBtn).toBeDisabled();
    await expect(stopBtn).toBeDisabled();
    await expect(nextBtn).toBeDisabled();
  });

  test('"No track loaded" text is visible when no track is loaded', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByText('No track loaded')).toBeVisible();
  });

  test('no console errors during initial load', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
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
    { path: '/#/playlist', name: 'Playlist' },
    { path: '/#/instrument', name: 'Instrument' },
    { path: '/#/analysis', name: 'Analysis' },
    { path: '/#/settings', name: 'Settings' },
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
      if (msg.type() === 'error') {
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
    await expect(nav.getByRole('link', { name: 'Playlist' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Instrument' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Analysis' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
  });
});

test.describe('Theme toggle', () => {
  test('theme toggle is present and functional', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.getByRole('button', { name: /theme/i });
    await expect(themeToggle).toBeVisible();

    // Get initial theme state
    const initialTheme = await page.locator('html').getAttribute('data-theme');

    // Click to toggle
    await themeToggle.click();

    // Theme attribute should change
    const newTheme = await page.locator('html').getAttribute('data-theme');
    expect(newTheme).not.toEqual(initialTheme);
  });
});
