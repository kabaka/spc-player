import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

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
    await expect(page.getByText('No track loaded')).toBeVisible();

    // Load fixture via the hidden file input
    const fileInput = page.locator('input[type="file"][accept=".spc"]');
    await fileInput.setInputFiles(MINIMAL_SPC);

    // "No track loaded" should disappear
    await expect(page.getByText('No track loaded')).not.toBeVisible();

    // Metadata section should show a track title (or "Untitled" for minimal fixture)
    const nowPlaying = page.getByLabel('Now playing');
    await expect(nowPlaying).toBeVisible();
    await expect(
      nowPlaying.getByRole('heading').or(nowPlaying.getByText('Untitled')),
    ).toBeVisible();
  });

  test('transport buttons become enabled after loading a track', async ({
    page,
  }) => {
    await page.goto('/');
    const fileInput = page.locator('input[type="file"][accept=".spc"]');
    await fileInput.setInputFiles(MINIMAL_SPC);

    // Wait for "No track loaded" to disappear (signals load complete)
    await expect(page.getByText('No track loaded')).not.toBeVisible();

    const playBtn = page.getByRole('button', { name: 'Play' });
    const stopBtn = page.getByRole('button', { name: 'Stop' });
    const previousBtn = page.getByRole('button', { name: 'Previous track' });
    const nextBtn = page.getByRole('button', { name: 'Next track' });

    await expect(playBtn).toBeEnabled();
    await expect(stopBtn).toBeEnabled();
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
    await expect(page.getByText('No track loaded')).not.toBeVisible();

    await expect(seekBar).toBeEnabled();
  });

  test('loading a corrupt file shows an error message', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('input[type="file"][accept=".spc"]');
    await fileInput.setInputFiles(CORRUPT_SPC);

    const errorMessage = page.getByRole('alert');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).not.toBeEmpty();

    // Track should NOT be loaded — "No track loaded" should remain
    await expect(page.getByText('No track loaded')).toBeVisible();
  });
});
