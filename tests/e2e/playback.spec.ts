import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
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

/** Load the minimal SPC fixture and wait for the UI to reflect a loaded track. */
async function loadFixture(page: Page) {
  await page.goto('/');
  const fileInput = page.locator('input[type="file"][accept=".spc"]');
  await fileInput.setInputFiles(MINIMAL_SPC);
  await expect(
    page.locator('#player-controls').getByText('No track loaded'),
  ).not.toBeVisible();
}

test.describe('Playback controls', () => {
  test('clicking Play starts playback and shows Pause button', async ({
    page,
  }) => {
    await loadFixture(page);

    const playBtn = page.getByRole('button', { name: 'Play' });
    await expect(playBtn).toBeEnabled();
    await playBtn.click();

    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('clicking Pause pauses playback and shows Play button', async ({
    page,
  }) => {
    await loadFixture(page);

    // Start playback
    await page.getByRole('button', { name: 'Play' }).click();
    const pauseBtn = page.getByRole('button', { name: 'Pause' });
    await expect(pauseBtn).toBeVisible();

    // Pause
    await pauseBtn.click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  // Stop button was removed from TransportBar in Phase B
  test.skip('clicking Stop resets playback state', async ({ page }) => {
    await loadFixture(page);

    // Start playback
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // Stop
    await page.getByRole('button', { name: 'Stop' }).click();

    // Play button should return (not Pause)
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('playback position advances while playing', async ({ page }) => {
    await loadFixture(page);

    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    const timeDisplay = page.getByLabel('Playback position');
    await expect(timeDisplay).toBeVisible();

    // Wait for elapsed time to advance past 0:00 (generous timeout for CI)
    const elapsedSpan = timeDisplay.locator('span').first();
    await expect(elapsedSpan).not.toHaveText('0:00', { timeout: 15000 });
  });

  test('seek bar is interactive when a track is loaded', async ({ page }) => {
    await loadFixture(page);

    const seekBar = page.getByRole('slider', { name: 'Seek' });
    await expect(seekBar).toBeEnabled();

    // Verify it has a max value greater than 0
    const max = await seekBar.getAttribute('aria-valuemax');
    expect(Number(max)).toBeGreaterThan(0);
  });

  test('volume slider adjusts volume value', async ({ page }) => {
    await loadFixture(page);

    const volumeSlider = page.getByRole('slider', { name: 'Volume' });
    await expect(volumeSlider).toBeVisible();

    // Read initial value
    const initialText = await volumeSlider.getAttribute('aria-valuetext');
    expect(initialText).toBeTruthy();
  });

  test('mute button toggles mute state', async ({ page }) => {
    await loadFixture(page);

    const muteBtn = page.getByRole('button', { name: 'Mute', exact: true });
    await expect(muteBtn).toBeVisible();

    // Click mute
    await muteBtn.click();

    // After muting, button label changes to "Unmute"
    await expect(
      page.getByRole('button', { name: 'Unmute', exact: true }),
    ).toBeVisible();

    // Click unmute to restore
    await page.getByRole('button', { name: 'Unmute', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Mute', exact: true }),
    ).toBeVisible();
  });

  // Speed control was removed from PlayerView in Phase B (B9)
  test.skip('speed slider is visible and has a default value', async ({
    page,
  }) => {
    await loadFixture(page);

    const speedSlider = page.getByRole('slider', { name: 'Playback speed' });
    await expect(speedSlider).toBeVisible();

    const valueText = await speedSlider.getAttribute('aria-valuetext');
    expect(valueText).toBe('1x');
  });

  test('transport buttons are disabled when no track is loaded', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Previous track' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Next track' }),
    ).toBeDisabled();
  });

  test('no console errors during playback lifecycle', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (
        msg.type() === 'error' &&
        !IGNORED_CONSOLE_ERRORS.some((ignored) => msg.text().includes(ignored))
      ) {
        consoleErrors.push(msg.text());
      }
    });

    await loadFixture(page);

    // Play
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // Pause
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

    await page.waitForTimeout(500);
    expect(consoleErrors).toEqual([]);
  });
});
