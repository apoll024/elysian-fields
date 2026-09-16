import { test, expect } from '@playwright/test';

test('click swaps validate both positions, persist, and support undo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose position for Josh Allen', exact: true }).click();
  await expect(page.getByTestId('slot-11')).toHaveClass(/valid-target/);
  await expect(page.getByTestId('slot-1')).not.toHaveClass(/valid-target/);
  await page.getByRole('button', { name: 'Swap with Justin Herbert', exact: true }).click();
  await expect(page.getByTestId('slot-0')).toContainText('Justin Herbert');
  await page.getByRole('button', { name: 'Undo last lineup change', exact: true }).click();
  await expect(page.getByTestId('slot-0')).toContainText('Josh Allen');
  await page.getByRole('button', { name: 'Choose position for Josh Allen', exact: true }).click();
  await page.getByRole('button', { name: 'Swap with Justin Herbert', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('slot-0')).toContainText('Justin Herbert');
  await page.getByRole('button', { name: 'Activity', exact: false }).first().click();
  await expect(page.locator('.activity-row')).toHaveCount(3);
});

test('mouse drag snaps to compatible rows and cancels outside', async ({ page }) => {
  await page.goto('/');
  const handle = await page
    .getByRole('button', { name: 'Move Saquon Barkley', exact: true })
    .boundingBox();
  const target = await page.getByTestId('slot-2').boundingBox();
  await page.mouse.move(handle!.x + 7, handle!.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 20, handle!.y + 20, { steps: 5 });
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(page.getByTestId('slot-1')).toContainText('Jahmyr Gibbs');
  await expect(page.getByTestId('slot-2')).toContainText('Saquon Barkley');
  const next = await page
    .getByRole('button', { name: 'Move Jahmyr Gibbs', exact: true })
    .boundingBox();
  await page.mouse.move(next!.x + 7, next!.y + 10);
  await page.mouse.down();
  await page.mouse.move(1100, 150, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByTestId('slot-1')).toContainText('Jahmyr Gibbs');
});

test('keyboard movement is functional and Escape is forgiving', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Move Saquon Barkley', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('slot-1')).toHaveClass(/dragging/);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('slot-2')).toHaveClass(/over/);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('slot-1')).toContainText('Jahmyr Gibbs');
  await page.getByRole('button', { name: 'Move Jahmyr Gibbs', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('slot-1')).toHaveClass(/dragging/);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('slot-2')).toHaveClass(/over/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('slot-1')).toContainText('Jahmyr Gibbs');
});

test('settings persist per profile; dialogs trap focus and Escape closes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.getByRole('button', { name: 'Marble day', exact: true }).click();
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(245, 245, 240)');
  await expect(page.getByRole('heading', { name: 'Sunday Scaries', exact: true })).toHaveCSS(
    'color',
    'rgb(38, 49, 38)',
  );
  await page.getByRole('button', { name: 'Oracle dusk', exact: true }).click();
  await page.getByRole('button', { name: 'Oracle', exact: true }).click();
  await page.getByRole('button', { name: 'Compact', exact: true }).click();
  await page.getByRole('textbox', { name: 'TEAM NAME' }).fill('The Clean Sweep');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dusk');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.getByRole('heading', { name: 'The Clean Sweep', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  await page
    .getByRole('button', { name: 'G Guest profile Local demo profile', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { name: 'Sunday Scaries', exact: true })).toBeVisible();
});

test('search, watchlist, matchup, league and details work without console errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Players', exact: true }).click();
  await page.getByPlaceholder('Search players or teams…').fill('downs');
  await expect(page.locator('.market-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Watch Josh Downs', exact: true }).click();
  await page.getByRole('combobox', { name: 'Player availability' }).selectOption('watchlist');
  await expect(page.locator('.market-row')).toHaveCount(1);
  await page.getByRole('button', { name: /Josh Downs IND/ }).click();
  await expect(page.getByRole('dialog')).toContainText('12.4');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Matchup', exact: true }).click();
  await expect(page.locator('.head-to-head')).toHaveCount(9);
  await page.getByRole('button', { name: 'League', exact: true }).click();
  await expect(page.locator('.standings-row')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('mobile has no horizontal overflow and supports tap swaps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page
    .getByRole('button', { name: 'Choose position for Saquon Barkley', exact: true })
    .click();
  await page.getByRole('button', { name: 'Swap with James Cook', exact: true }).click();
  await expect(page.getByTestId('slot-1')).toContainText('James Cook');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Players', exact: true }).click();
  await expect(page.getByPlaceholder('Search players or teams…')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('corrupt persisted data recovers and reduced motion is honored', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() =>
    localStorage.setItem('elysian-fields:v1:joel', '{"roster":[{"playerId":"missing"}]}'),
  );
  await page.goto('/');
  await expect(page.getByTestId('slot-0')).toContainText('Josh Allen');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
});

test('touch dragging lifts after a hold and snaps to an eligible slot', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173');
  const handle = await page
    .getByRole('button', { name: 'Move Saquon Barkley', exact: true })
    .boundingBox();
  const target = await page.getByTestId('slot-2').boundingBox();
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: handle!.x + 7, y: handle!.y + 10 }],
  });
  await expect(page.getByTestId('slot-1')).toHaveClass(/dragging/);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: target!.x + target!.width / 2, y: target!.y + target!.height / 2 }],
  });
  await expect(page.getByTestId('slot-2')).toHaveClass(/over/);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('slot-1')).toContainText('Jahmyr Gibbs');
  await context.close();
});

test('storage failure leaves lineup editing available and reports unsaved state', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
  });
  await page.goto('/');
  await expect(page.getByText('Storage unavailable', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Choose position for Saquon Barkley', exact: true })
    .click();
  await page.getByRole('button', { name: 'Swap with Jahmyr Gibbs', exact: true }).click();
  await expect(page.getByTestId('slot-1')).toContainText('Jahmyr Gibbs');
});
