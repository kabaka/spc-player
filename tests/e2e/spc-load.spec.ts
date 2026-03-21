import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/**
 * Console error messages that are benign in the test environment.
 * The CSP frame-ancestors directive is always ignored in <meta> tags;
 * browsers log a console error but it has no runtime effect.
 */
const IGNORED_CONSOLE_ERRORS = [
  "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via",
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');
const MINIMAL_SPC = path.join(FIXTURES_DIR, 'minimal-valid.spc');
const CORRUPT_SPC = path.join(FIXTURES_DIR, 'corrupt-header.spc');

test.describe('SPC file loading', () => {
  test('loading a valid SPC file shows metadata and enables controls', async ({
    page,
  }) => {
    await page.goto('/');

    // Pre-condition: no track loaded
    await expect(
      page.locator('#player-controls').getByText('No track loaded'),
    ).toBeVisible();

    // Load fixture via the hidden file input
    const fileInput = page.locator('input[type="file"][accept=".spc"]');
    await fileInput.setInputFiles(MINIMAL_SPC);

    // "No track loaded" should disappear
    await expect(
      page.locator('#player-controls').getByText('No track loaded'),
    ).not.toBeVisible();

    // Metadata should be visible in the TransportBar's track info area
    // The minimal fixture has title "Test Song"
    const trackTitle = page.locator('#player-controls').getByText('Test Song');
    await expect(trackTitle).toBeVisible();
  });

  test('transport buttons become enabled after loading a track', async ({
    page,
  }) => {
    await page.goto('/');
    const fileInput = page.locator('input[type="file"][accept=".spc"]');
    await fileInput.setInputFiles(MINIMAL_SPC);

    // Wait for "No track loaded" to disappear (signals load complete)
    await expect(
      page.locator('#player-controls').getByText('No track loaded'),
    ).not.toBeVisible();

    const playBtn = page.getByRole('button', { name: 'Play' });
    const previousBtn = page.getByRole('button', { name: 'Previous track' });
    const nextBtn = page.getByRole('button', { name: 'Next track' });

    await expect(playBtn).toBeEnabled();
    await expect(previousBtn).toBeEnabled();
    await expect(nextBtn).toBeEnabled();
  });

  test('seek bar becomes enabled after loading a track', async ({ page }) => {
    await page.goto('/');
    const fileInput = page.locator('input[type="file"][accept=".spc"]');

    // Pre-condition: seek bar is disabled
    const seekBar = page.getByRole('slider', { name: 'Seek' });
    await expect(seekBar).toBeDisabled();

    await fileInput.setInputFiles(MINIMAL_SPC);
    await expect(
      page.locator('#player-controls').getByText('No track loaded'),
    ).not.toBeVisible();

    await expect(seekBar).toBeEnabled();
  });

  test('loading a corrupt file shows an error message', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('input[type="file"][accept=".spc"]');
    await fileInput.setInputFiles(CORRUPT_SPC);

    // Use .first() because both the inline error and the toast notification
    // render with role="alert", causing a strict mode violation.
    const errorMessage = page
      .getByRole('alert')
      .filter({ hasText: /.+/ })
      .first();
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).not.toBeEmpty();

    // Track should NOT be loaded — "No track loaded" should remain
    await expect(
      page.locator('#player-controls').getByText('No track loaded'),
    ).toBeVisible();
  });

  test('play button is clickable after loading a track', async ({ page }) => {
    await page.goto('/');
    const fileInput = page.locator('input[type="file"][accept=".spc"]');
    await fileInput.setInputFiles(MINIMAL_SPC);

    await expect(
      page.locator('#player-controls').getByText('No track loaded'),
    ).not.toBeVisible();

    const playBtn = page.getByRole('button', { name: 'Play' });
    await expect(playBtn).toBeEnabled();
    await playBtn.click();

    // After clicking play, the button should change to Pause
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('metadata is displayed after file load', async ({ page }) => {
    await page.goto('/');
    const fileInput = page.locator('input[type="file"][accept=".spc"]');
    await fileInput.setInputFiles(MINIMAL_SPC);

    await expect(
      page.locator('#player-controls').getByText('No track loaded'),
    ).not.toBeVisible();

    // Metadata should be visible — TransportBar shows track title
    const trackTitle = page.locator('#player-controls').getByText('Test Song');
    await expect(trackTitle).toBeVisible();
  });

  test('no console errors during SPC load and playback', async ({ page }) => {
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
    const fileInput = page.locator('input[type="file"][accept=".spc"]');
    await fileInput.setInputFiles(MINIMAL_SPC);

    await expect(
      page.locator('#player-controls').getByText('No track loaded'),
    ).not.toBeVisible();

    const playBtn = page.getByRole('button', { name: 'Play' });
    await expect(playBtn).toBeEnabled();
    await playBtn.click();

    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // Allow a brief settle for deferred console messages
    await page.waitForTimeout(500);

    expect(consoleErrors).toEqual([]);
  });

  test('playback position advances after clicking Play', async ({ page }) => {
    await page.goto('/');
    const fileInput = page.locator('input[type="file"][accept=".spc"]');
    await fileInput.setInputFiles(MINIMAL_SPC);
    await expect(
      page.locator('#player-controls').getByText('No track loaded'),
    ).not.toBeVisible();

    const playBtn = page.getByRole('button', { name: 'Play' });
    await expect(playBtn).toBeEnabled();
    await playBtn.click();

    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // Wait for the elapsed time to advance past 0:00
    // The time display has aria-label="Playback position" and contains
    // the elapsed time in M:SS format in its first <span>
    const timeDisplay = page.getByLabel('Playback position');
    await expect(timeDisplay).toBeVisible();

    // Wait for the first span (elapsed time) to show something other than "0:00"
    const elapsedSpan = timeDisplay.locator('span').first();
    await expect(elapsedSpan).not.toHaveText('0:00', { timeout: 5000 });
  });
});
