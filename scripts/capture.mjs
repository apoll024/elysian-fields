import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});
await page.goto('http://127.0.0.1:5173');
await page.evaluate(() => document.fonts.ready);
await mkdir('test-results/previews', { recursive: true });
await page.screenshot({ path: 'test-results/previews/desktop.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await expect
  .poll(async () => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
  .toBeLessThanOrEqual(0);
await page.screenshot({ path: 'test-results/previews/mobile.png', fullPage: true });
await page.setViewportSize({ width: 1440, height: 1050 });
await page.getByRole('button', { name: 'Customize', exact: true }).click();
await page.getByRole('button', { name: 'Marble day', exact: true }).click();
await page.keyboard.press('Escape');
await page.screenshot({ path: 'test-results/previews/light.png', fullPage: true });
await browser.close();
