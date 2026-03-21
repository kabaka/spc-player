import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';

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

// ── Sidebar collapse / expand (tablet viewport) ──────────────────────

test.describe('Sidebar collapse and expand', () => {
  // The collapse toggle is only visible at tablet breakpoints (768–1023px)
  test.use({ viewport: { width: 960, height: 768 } });

  test('collapse toggle is visible at tablet viewport', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', {
      name: 'Toggle playlist sidebar',
    });
    await expect(toggle).toBeVisible();
  });

  test('sidebar content is visible by default', async ({ page }) => {
    await page.goto('/');

    const sidebar = page.locator('#playlist-sidebar');
    await expect(sidebar).toBeVisible();
  });

  test('clicking collapse toggle hides sidebar content', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', {
      name: 'Toggle playlist sidebar',
    });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#playlist-sidebar')).toBeVisible();

    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#playlist-sidebar')).not.toBeVisible();
  });

  test('clicking toggle again restores sidebar content', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', {
      name: 'Toggle playlist sidebar',
    });

    // Collapse
    await toggle.click();
    await expect(page.locator('#playlist-sidebar')).not.toBeVisible();

    // Expand
    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#playlist-sidebar')).toBeVisible();
  });

  test('aria-expanded toggles correctly across collapse/expand cycle', async ({
    page,
  }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', {
      name: 'Toggle playlist sidebar',
    });

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

// ── Transport bar ────────────────────────────────────────────────────

test.describe('Transport bar', () => {
  test('transport bar is visible', async ({ page }) => {
    await page.goto('/');

    const transportBar = page.locator('#player-controls');
    await expect(transportBar).toBeVisible();
  });

  test('play button exists and is accessible', async ({ page }) => {
    await page.goto('/');

    const playBtn = page.getByRole('button', { name: 'Play' });
    await expect(playBtn).toBeVisible();
    await expect(playBtn).toBeDisabled();
  });

  test('previous and next buttons exist', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('button', { name: 'Previous track' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Next track' }),
    ).toBeVisible();
  });

  test('volume slider exists and is visible', async ({ page }) => {
    await page.goto('/');

    const volumeSlider = page.getByRole('slider', { name: 'Volume' });
    await expect(volumeSlider).toBeVisible();
  });

  test('seek bar is enabled after loading a track', async ({ page }) => {
    await loadFixture(page);

    const seekBar = page.getByRole('slider', { name: 'Seek' });
    await expect(seekBar).toBeEnabled();

    const max = await seekBar.getAttribute('aria-valuemax');
    expect(Number(max)).toBeGreaterThan(0);
  });

  test('keyboard seek: ArrowRight advances position', async ({ page }) => {
    await loadFixture(page);

    const seekBar = page.getByRole('slider', { name: 'Seek' });
    await expect(seekBar).toBeEnabled();

    const initialValue = Number(await seekBar.getAttribute('aria-valuenow'));

    await seekBar.focus();
    await page.keyboard.press('ArrowRight');

    const afterValue = Number(await seekBar.getAttribute('aria-valuenow'));
    expect(afterValue).toBeGreaterThan(initialValue);
  });
});

// ── Drag-drop file loading ───────────────────────────────────────────

test.describe('Drag-drop file loading', () => {
  test('drag-enter shows the drag-drop overlay', async ({ page }) => {
    await page.goto('/');

    const overlay = page
      .locator('[data-state]')
      .filter({ hasText: 'Drop SPC files to play' });
    await expect(overlay).toHaveAttribute('data-state', 'hidden');

    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File([''], 'test.spc'));
      window.dispatchEvent(
        new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
    });

    await expect(overlay).toHaveAttribute('data-state', 'visible');
  });

  test('drag-leave hides the drag-drop overlay', async ({ page }) => {
    await page.goto('/');

    const overlay = page
      .locator('[data-state]')
      .filter({ hasText: 'Drop SPC files to play' });

    // Wait for component mount before dispatching events
    await expect(overlay).toHaveAttribute('data-state', 'hidden');

    // Show overlay via dragenter (use real DragEvent + DataTransfer so the
    // component's hasFiles() check works reliably across all browsers).
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File([''], 'test.spc'));
      window.dispatchEvent(
        new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
    });
    await expect(overlay).toHaveAttribute('data-state', 'visible');

    // Hide overlay via dragleave.
    // Chromium and WebKit may fire extra internal dragenter events when the
    // overlay DOM mutates during an active drag, inflating the enter-count.
    // Retry dispatching dragleave until the count reaches 0 and the 50ms
    // debounce hides the overlay. Extra dragleave events are safe — the
    // component clamps the count at 0.
    await expect(async () => {
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File([''], 'test.spc'));
        window.dispatchEvent(
          new DragEvent('dragleave', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
      });
      await expect(overlay).toHaveAttribute('data-state', 'hidden', {
        timeout: 200,
      });
    }).toPass({ timeout: 2000 });
  });

  test('dropping an SPC file loads it into the playlist', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();

    // Read the fixture file in Node and pass as base64 to the browser
    const fixtureBytes = fs.readFileSync(MINIMAL_SPC);
    const base64 = fixtureBytes.toString('base64');

    await page.evaluate((b64: string) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'minimal-valid.spc'));
      window.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
    }, base64);

    // Track should appear in the playlist
    const listbox = page.getByRole('listbox');
    await expect(listbox.getByRole('option')).toHaveCount(1, {
      timeout: 10000,
    });
  });
});
