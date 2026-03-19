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
    await page.waitForTimeout(500);

    expect(consoleErrors).toEqual([]);
  });
});
