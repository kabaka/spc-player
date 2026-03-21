import { test, expect } from '@playwright/test';

test.describe('Theme toggle', () => {
  test('HTML element has a dark or light class on initial load', async ({
    page,
  }) => {
    await page.goto('/');

    const html = page.locator('html');
    const classes = await html.getAttribute('class');
    const hasDark = classes?.includes('dark') ?? false;
    const hasLight = classes?.includes('light') ?? false;

    // One of them should be set (system default resolves to dark or light)
    expect(hasDark || hasLight).toBe(true);
  });

  test('selecting a theme radio changes the theme class', async ({ page }) => {
    await page.goto('/#/settings');

    const html = page.locator('html');

    // Select Light theme via radio button
    const lightRadio = page.getByRole('radio', { name: /Light/ });
    await expect(lightRadio).toBeVisible();
    await lightRadio.check();

    await expect(html).toHaveClass(/light/);

    // Switch to Dark
    const darkRadio = page.getByRole('radio', { name: /Dark/ });
    await darkRadio.check();

    await expect(html).toHaveClass(/dark/);
  });

  test('theme persists across route navigation', async ({ page }) => {
    await page.goto('/#/settings');

    const html = page.locator('html');

    // Select Light theme
    const lightRadio = page.getByRole('radio', { name: /Light/ });
    await lightRadio.check();
    await expect(html).toHaveClass(/light/);

    // Navigate to different routes — theme should persist
    const nav = page.getByRole('navigation', { name: 'Main navigation' });

    await nav.getByRole('link', { name: 'Instrument' }).click();
    await expect(html).toHaveClass(/light/);

    await nav.getByRole('link', { name: 'Analysis' }).click();
    await expect(html).toHaveClass(/light/);

    await nav.getByRole('link', { name: 'Player' }).click();
    await expect(html).toHaveClass(/light/);
  });

  test('theme persists across page reload', async ({ page }) => {
    await page.goto('/#/settings');

    const html = page.locator('html');

    // Select Light theme
    const lightRadio = page.getByRole('radio', { name: /Light/ });
    await lightRadio.check();
    await expect(html).toHaveClass(/light/);

    // Reload and verify theme is restored from persistence
    await page.reload();
    await expect(page.locator('#root')).not.toBeEmpty();

    // Theme should still be light after rehydration
    await expect(html).toHaveClass(/light/, { timeout: 5000 });
  });

  test('theme radio buttons reflect current selection', async ({ page }) => {
    await page.goto('/#/settings');

    // Default theme is 'system' — System radio should be checked
    const systemRadio = page.getByRole('radio', { name: /System/ });
    await expect(systemRadio).toBeChecked();

    // Select Dark
    const darkRadio = page.getByRole('radio', { name: /Dark/ });
    await darkRadio.check();
    await expect(darkRadio).toBeChecked();
    await expect(systemRadio).not.toBeChecked();

    // Select Light
    const lightRadio = page.getByRole('radio', { name: /Light/ });
    await lightRadio.check();
    await expect(lightRadio).toBeChecked();
    await expect(darkRadio).not.toBeChecked();
  });
});
