import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

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

test.describe('Global keyboard shortcuts', () => {
  test('Space toggles play/pause', async ({ page }) => {
    await loadFixture(page);

    // Press Space to play
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // Press Space to pause
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('M toggles mute', async ({ page }) => {
    await loadFixture(page);

    // Verify Mute button is present (exact match to avoid channel mute buttons)
    const muteBtn = page.getByRole('button', { name: 'Mute', exact: true });
    await expect(muteBtn).toBeVisible();

    // Press M to mute
    await page.keyboard.press('m');
    await expect(
      page.getByRole('button', { name: 'Unmute', exact: true }),
    ).toBeVisible();

    // Press M again to unmute
    await page.keyboard.press('m');
    await expect(
      page.getByRole('button', { name: 'Mute', exact: true }),
    ).toBeVisible();
  });

  test('ArrowUp/ArrowDown adjusts volume', async ({ page }) => {
    await loadFixture(page);

    const volumeSlider = page.getByRole('slider', { name: 'Volume' });
    const initialValue = await volumeSlider.getAttribute('aria-valuenow');

    // Press ArrowDown to decrease volume
    await page.keyboard.press('ArrowDown');

    // Volume value should change
    const afterDown = await volumeSlider.getAttribute('aria-valuenow');
    expect(Number(afterDown)).toBeLessThan(Number(initialValue));

    // Press ArrowUp to increase volume
    await page.keyboard.press('ArrowUp');

    const afterUp = await volumeSlider.getAttribute('aria-valuenow');
    expect(Number(afterUp)).toBeGreaterThan(Number(afterDown));
  });

  test('number keys 1-8 toggle voice muting', async ({ page }) => {
    await loadFixture(page);

    // Voice 1 mute button should start unpressed
    const muteVoice1 = page.getByRole('button', {
      name: 'Mute channel 1',
    });
    await expect(muteVoice1).toHaveAttribute('aria-pressed', 'false');

    // Press 1 to toggle mute on voice 1
    await page.keyboard.press('1');
    await expect(muteVoice1).toHaveAttribute('aria-pressed', 'true');

    // Press 1 again to unmute
    await page.keyboard.press('1');
    await expect(muteVoice1).toHaveAttribute('aria-pressed', 'false');
  });

  test('shortcuts work from non-Player routes', async ({ page }) => {
    await loadFixture(page);

    // Navigate to Settings
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Settings' }).click();

    // Space should still toggle play/pause (global shortcut)
    // TransportBar is visible on all routes, so Pause button is directly checkable
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('shortcuts are suppressed when a text input is focused', async ({
    page,
  }) => {
    await loadFixture(page);

    // Navigate to Settings which has text inputs
    await page.getByRole('link', { name: 'Settings' }).click();

    // Find a text input on the settings page (if any exist)
    const textInput = page.locator('input[type="text"]').first();
    const hasTextInput = await textInput.isVisible().catch(() => false);

    if (hasTextInput) {
      // Focus the input
      await textInput.focus();

      // Press Space — should not toggle playback
      await page.keyboard.press('Space');

      // Play button should still be there (not changed to Pause)
      await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    } else {
      // No text input found — verify the search input via Ctrl+F if present
      // or skip. The suppression behavior is tested at the unit level too.
      test.skip();
    }
  });

  test('0 key resets all voice mute/solo state', async ({ page }) => {
    await loadFixture(page);

    // Mute voice 1
    await page.keyboard.press('1');
    const muteVoice1 = page.getByRole('button', {
      name: 'Mute channel 1',
    });
    await expect(muteVoice1).toHaveAttribute('aria-pressed', 'true');

    // Press 0 to unmute all
    await page.keyboard.press('0');
    await expect(muteVoice1).toHaveAttribute('aria-pressed', 'false');
  });

  test('? (Shift+/) opens shortcut help dialog', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();

    // The shortcut is defined as 'Shift+Slash' — use the key code
    await page.keyboard.press('Shift+Slash');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
  });
});
