import { test, expect } from '@playwright/test';

test.describe('PWA and Service Worker', () => {
  test('service worker registers successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();

    // Wait for page to fully stabilize (SW registration is async)
    await page.waitForLoadState('networkidle');

    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;

      // Check for an existing registration
      const registration =
        await navigator.serviceWorker.getRegistration('/spc-player/');
      return registration !== undefined;
    });

    expect(swRegistered).toBe(true);
  });

  test('manifest is linked in the document head', async ({ page }) => {
    await page.goto('/');

    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', /manifest\.json/);
  });

  test('manifest returns valid JSON with required fields', async ({ page }) => {
    await page.goto('/');

    const manifestData = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>(
        'link[rel="manifest"]',
      );
      if (!link) return null;

      const response = await fetch(link.href);
      return response.json();
    });

    expect(manifestData).not.toBeNull();
    expect(manifestData.name).toBe('SPC Player');
    expect(manifestData.start_url).toBeTruthy();
    expect(manifestData.display).toBeTruthy();
    expect(manifestData.icons).toBeDefined();
    expect(Array.isArray(manifestData.icons)).toBe(true);
    expect(manifestData.icons.length).toBeGreaterThan(0);
  });

  test('app loads the root route without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page).toHaveTitle('SPC Player');

    expect(errors).toEqual([]);
  });

  test('offline indicator is not shown when online', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();

    // The OfflineIndicator uses role="status" and aria-label="Network status"
    // It should not be visible when online
    const offlineIndicator = page.getByRole('status', {
      name: 'Network status',
    });
    await expect(offlineIndicator).not.toBeVisible();
  });

  test('offline indicator appears when network goes offline', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();

    // Simulate going offline
    await context.setOffline(true);

    // Trigger the browser's offline event
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });

    // The OfflineIndicator should become visible
    const offlineIndicator = page.getByRole('status', {
      name: 'Network status',
    });
    await expect(offlineIndicator).toBeVisible();
    await expect(offlineIndicator).toContainText('Offline');

    // Restore online state
    await context.setOffline(false);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });

    await expect(offlineIndicator).not.toBeVisible();
  });

  test('app scope matches manifest scope', async ({ page }) => {
    await page.goto('/');

    const scope = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>(
        'link[rel="manifest"]',
      );
      if (!link) return null;

      const response = await fetch(link.href);
      const manifest = await response.json();
      return manifest.scope;
    });

    expect(scope).toBe('/spc-player/');
  });
});
