import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');
const MINIMAL_SPC = path.join(FIXTURES_DIR, 'minimal-valid.spc');
const BINARY_ID666_SPC = path.join(FIXTURES_DIR, 'binary-id666.spc');

/** Navigate to the playlist view. */
async function goToPlaylist(page: Page) {
  await page.goto('/#/playlist');
  await expect(page.locator('#root')).not.toBeEmpty();
}

/** Load a fixture from the Player view and return to playlist. */
async function loadFixtureFromPlayer(page: Page) {
  await page.goto('/');
  const fileInput = page.locator('input[type="file"][accept=".spc"]');
  await fileInput.setInputFiles(MINIMAL_SPC);
  await expect(page.getByText('No track loaded')).not.toBeVisible();
}

test.describe('Playlist management', () => {
  test('playlist view is accessible via navigation', async ({ page }) => {
    await goToPlaylist(page);

    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const playlistLink = nav.getByRole('link', { name: 'Playlist' });
    await expect(playlistLink).toBeVisible();
  });

  test('loading a file adds it to the playlist', async ({ page }) => {
    await loadFixtureFromPlayer(page);

    // Navigate to playlist
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Playlist' }).click();
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
    await expect(page.getByText('No track loaded')).not.toBeVisible();

    await fileInput.setInputFiles(BINARY_ID666_SPC);

    // Navigate to playlist
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Playlist' }).click();

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    const options = listbox.getByRole('option');
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('playlist shows track title for loaded files', async ({ page }) => {
    await loadFixtureFromPlayer(page);

    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Playlist' }).click();
    const listbox = page.getByRole('listbox');
    const firstOption = listbox.getByRole('option').first();
    await expect(firstOption).not.toBeEmpty();
  });

  test('add files button is present in playlist view', async ({ page }) => {
    await goToPlaylist(page);

    const addBtn = page.getByRole('button', { name: 'Add Files' });
    await expect(addBtn).toBeVisible();
  });

  test('playlist state persists after navigating away and back', async ({
    page,
  }) => {
    await loadFixtureFromPlayer(page);

    // Go to playlist, verify track is there
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Playlist' }).click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const countBefore = await listbox.getByRole('option').count();
    expect(countBefore).toBeGreaterThanOrEqual(1);

    // Navigate to Settings and back
    await nav.getByRole('link', { name: 'Settings' }).click();
    await nav.getByRole('link', { name: 'Playlist' }).click();

    // Track count should be the same
    const countAfter = await listbox.getByRole('option').count();
    expect(countAfter).toBe(countBefore);
  });

  test('empty playlist shows appropriate state', async ({ page }) => {
    await goToPlaylist(page);

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
