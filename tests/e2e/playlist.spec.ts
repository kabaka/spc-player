import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');
const MINIMAL_SPC = path.join(FIXTURES_DIR, 'minimal-valid.spc');
const BINARY_ID666_SPC = path.join(FIXTURES_DIR, 'binary-id666.spc');

/**
 * Load a fixture via the sidebar file input and wait for the UI to
 * reflect a loaded track. On desktop the playlist sidebar is always
 * visible, so no navigation is needed.
 */
async function loadFixture(page: Page) {
  await page.goto('/');
  const fileInput = page.locator('input[type="file"][accept=".spc"]');
  await fileInput.setInputFiles(MINIMAL_SPC);
  await expect(
    page.locator('#player-controls').getByText('No track loaded'),
  ).not.toBeVisible();
}

test.describe('Playlist management', () => {
  test('playlist sidebar is visible on desktop', async ({ page }) => {
    await page.goto('/');

    // Playlist sidebar is always visible on desktop — no nav link needed
    const sidebar = page.getByRole('complementary', { name: 'Playlist' });
    await expect(sidebar).toBeVisible();
  });

  test('loading a file adds it to the playlist', async ({ page }) => {
    await loadFixture(page);

    // Sidebar is always visible on desktop
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    const options = listbox.getByRole('option');
    await expect(options).toHaveCount(1);
  });

  test('loading multiple files adds them all to the playlist', async ({
    page,
  }) => {
    await page.goto('/');
    const fileInput = page.locator('input[type="file"][accept=".spc"]');

    // Load two different fixtures — the app deduplicates by content hash,
    // so loading the same file twice would only produce one playlist entry.
    await fileInput.setInputFiles(MINIMAL_SPC);
    await expect(
      page.locator('#player-controls').getByText('No track loaded'),
    ).not.toBeVisible();

    await fileInput.setInputFiles(BINARY_ID666_SPC);

    // Wait for the second track to appear in the playlist
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    const options = listbox.getByRole('option');
    await expect(options).toHaveCount(2, { timeout: 10000 });
  });

  test('playlist shows track title for loaded files', async ({ page }) => {
    await loadFixture(page);

    const listbox = page.getByRole('listbox');
    const firstOption = listbox.getByRole('option').first();
    await expect(firstOption).not.toBeEmpty();
  });

  test('add files button is present in sidebar', async ({ page }) => {
    await page.goto('/');

    const addBtn = page.getByRole('button', { name: /add files/i });
    await expect(addBtn).toBeVisible();
  });

  test('playlist state persists after navigating away and back', async ({
    page,
  }) => {
    await loadFixture(page);

    // Verify track is in the sidebar playlist
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const countBefore = await listbox.getByRole('option').count();
    expect(countBefore).toBeGreaterThanOrEqual(1);

    // Navigate to Settings and back to Player
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Settings' }).click();
    await nav.getByRole('link', { name: 'Player' }).click();

    // Track count should be the same — sidebar persists across routes
    const countAfter = await listbox.getByRole('option').count();
    expect(countAfter).toBe(countBefore);
  });

  test('empty playlist shows appropriate state', async ({ page }) => {
    await page.goto('/');

    // With no tracks loaded, either the listbox is empty or there's an empty message
    const listbox = page.getByRole('listbox');

    // If the listbox exists, it should have 0 options
    if (await listbox.isVisible()) {
      const options = listbox.getByRole('option');
      await expect(options).toHaveCount(0);
    }
    // Otherwise an empty state message may be shown — either is acceptable
  });
});
