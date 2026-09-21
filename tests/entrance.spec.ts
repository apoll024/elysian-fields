import { test, expect } from '@playwright/test';

test('the gates open a selected local profile and allow returning without losing preferences', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Elysian Fields' })).toBeVisible();
  await expect(page.locator('.entrance-art')).toHaveJSProperty('complete', true);
  expect(
    await page.locator('.entrance-art').evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
  await page.getByLabel('CHOOSE YOUR PROFILE').selectOption('guest');
  await page.getByRole('button', { name: 'Enter the fields' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'amber');
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.getByRole('button', { name: 'Elysian night', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  await page.getByRole('button', { name: 'Return to the gates' }).click();
  await expect(page.getByRole('heading', { name: 'Elysian Fields' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.entrance-panel')).toBeVisible();
  await page.getByLabel('CHOOSE YOUR PROFILE').selectOption('guest');
  await page.getByRole('button', { name: 'Enter the fields' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByTestId('slot-0')).toBeVisible();
});

test('names follow actual positions in starters, bench, FLEX, matchups, pool, and details', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the fields' }).click();
  await expect(page.getByTestId('slot-0').locator('.player-name')).toHaveCSS(
    'color',
    'rgb(176, 47, 109)',
  );
  await expect(page.getByTestId('slot-1').locator('.player-name')).toHaveCSS(
    'color',
    'rgb(33, 115, 72)',
  );
  const flexName = page.getByTestId('slot-6').locator('.player-name');
  await expect(flexName).toHaveAttribute('data-position', 'WR');
  await expect(flexName).toHaveCSS('color', 'rgb(52, 102, 162)');
  await expect(page.getByTestId('slot-11').locator('.player-name')).toHaveCSS(
    'color',
    'rgb(176, 47, 109)',
  );
  await page.getByTestId('slot-0').locator('.player-identity').click();
  await expect(page.getByRole('dialog').locator('.player-name')).toHaveCSS(
    'color',
    'rgb(176, 47, 109)',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Matchup', exact: true }).click();
  await expect(page.locator('.head-to-head .player-name')).toHaveCount(18);
  await expect(
    page.locator('.opposing-player').filter({ hasText: 'Drake London' }).locator('.player-name'),
  ).toHaveAttribute('data-position', 'WR');
  await page.getByRole('button', { name: 'Players', exact: true }).click();
  await expect(page.locator('.market-row .player-name').first()).toBeVisible();
  await page.getByRole('button', { name: 'My team', exact: true }).click();
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  for (const theme of ['Elysian night', 'Oracle dusk']) {
    await page.getByRole('button', { name: theme, exact: true }).click();
    await expect(page.getByTestId('slot-0').locator('.player-name')).toHaveCSS(
      'color',
      'rgb(242, 162, 200)',
    );
    await expect(page.getByTestId('slot-1').locator('.player-name')).toHaveCSS(
      'color',
      'rgb(145, 215, 173)',
    );
  }
});

test('the entrance remains usable on narrow screens and with blocked storage', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
  });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByLabel('CHOOSE YOUR PROFILE').selectOption('guest');
  await page.getByRole('button', { name: 'Enter the fields' }).click();
  await expect(page.getByText('Storage unavailable', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
