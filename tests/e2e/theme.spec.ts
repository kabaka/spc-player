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

  test('clicking theme toggle changes the theme class', async ({ page }) => {
    await page.goto('/');

    const html = page.locator('html');
    const themeToggle = page.getByRole('button', { name: /theme/i });
    await expect(themeToggle).toBeVisible();

    // Default store theme is 'system'. Cycle is: system → dark → light → system.
    // On headless Chrome, system resolves to 'dark' class.
    // First click: system → dark (class stays 'dark')
    // Second click: dark → light (class changes to 'light')
    await themeToggle.click();
    await themeToggle.click();

    await expect(html).toHaveClass(/light/);
  });

  test('theme persists across route navigation', async ({ page }) => {
    await page.goto('/');

    const html = page.locator('html');
    const themeToggle = page.getByRole('button', { name: /theme/i });

    // Toggle twice to get to 'light' (system → dark → light)
    await themeToggle.click();
    await themeToggle.click();
    await expect(html).toHaveClass(/light/);

    // Navigate to different routes — theme should persist
    const nav = page.getByRole('navigation', { name: 'Main navigation' });

    await nav.getByRole('link', { name: 'Playlist' }).click();
    await expect(html).toHaveClass(/light/);

    await nav.getByRole('link', { name: 'Settings' }).click();
    await expect(html).toHaveClass(/light/);

    await nav.getByRole('link', { name: 'Player' }).click();
    await expect(html).toHaveClass(/light/);
  });

  test('theme persists across page reload', async ({ page }) => {
    await page.goto('/');

    const html = page.locator('html');
    const themeToggle = page.getByRole('button', { name: /theme/i });

    // Toggle twice to reach 'light' (system → dark → light)
    await themeToggle.click();
    await themeToggle.click();
    await expect(html).toHaveClass(/light/);

    // Reload and verify theme is restored from persistence
    await page.reload();
    await expect(page.locator('#root')).not.toBeEmpty();

    // Theme should still be light after rehydration
    await expect(html).toHaveClass(/light/, { timeout: 5000 });
  });

  test('theme toggle button shows the current theme label', async ({
    page,
  }) => {
    await page.goto('/');

    // Default theme is 'system' — button label should reflect it
    const systemBtn = page.getByRole('button', { name: /theme: system/i });
    await expect(systemBtn).toBeVisible();

    // Cycle to dark
    await systemBtn.click();
    await expect(
      page.getByRole('button', { name: /theme: dark/i }),
    ).toBeVisible();

    // Cycle to light
    await page.getByRole('button', { name: /theme: dark/i }).click();
    await expect(
      page.getByRole('button', { name: /theme: light/i }),
    ).toBeVisible();
  });
});
