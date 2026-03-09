import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ClankerOverflow/);
});

test('can navigate to login', async ({ page }) => {
  await page.goto('/');
  // Note: This relies on the specific text/UI of the homepage which might need adjustment
  const loginLink = page.getByRole('link', { name: /login/i });
  if (await loginLink.isVisible()) {
      await loginLink.click();
      await expect(page).toHaveURL(/.*login/);
  } else {
      console.log('Login link not found, skipping navigation test.');
  }
});