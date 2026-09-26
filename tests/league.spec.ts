import { test, expect, type Page } from '@playwright/test';

const roster = [
  { playerId: 'a', name: 'Jaxson Dart', position: 'QB', nflTeam: 'NYG', slot: 'QB' },
  { playerId: 'b', name: 'Trevor Lawrence', position: 'QB', nflTeam: 'JAX', slot: 'BN' },
];

async function mockLeague(page: Page, role: 'member' | 'commissioner', failFirstTeamLoad = false) {
  const account = {
    id: role === 'member' ? '7' : '1',
    name: role === 'member' ? 'Joel' : 'Ryan',
    teamName: role === 'member' ? 'Str8UpLazy' : 'balls deep',
    role,
    version: 1,
  };
  let currentRoster = roster;
  let version = 1;
  let signedIn = false;
  let teamLoadFailed = false;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const respond = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (path === '/api/session')
      return respond(signedIn ? 200 : 401, signedIn ? { account } : { error: 'Sign in required' });
    if (path === '/api/login') {
      const body = request.postDataJSON();
      if (body.password !== '123' || body.username !== account.name)
        return respond(401, { error: 'Incorrect account or password' });
      signedIn = true;
      return respond(200, { account });
    }
    if (path === '/api/league')
      return respond(200, {
        settings: {
          name: 'Bros b4 Hoes',
          scoring: 'Full PPR',
          waivers: 'Rolling priority',
          tradeDeadline: 'TBD',
          lineupLock: 'At game time',
        },
        teams: [
          { ...account, waiverPriority: 1 },
          {
            id: '9',
            name: 'Marko',
            teamName: '1.21 Gigawatts',
            role: 'member',
            version: 1,
            waiverPriority: 2,
          },
        ],
      });
    if (path === '/api/teams/' + account.id && request.method() === 'GET') {
      if (failFirstTeamLoad && !teamLoadFailed) {
        teamLoadFailed = true;
        return respond(401, { error: 'Sign in required' });
      }
      return respond(200, { team: { ...account, version }, roster: currentRoster });
    }
    if (path === '/api/teams/' + account.id && request.method() === 'PUT') {
      const body = request.postDataJSON();
      currentRoster = body.roster;
      version += 1;
      return respond(200, { team: { ...account, version }, roster: currentRoster });
    }
    return respond(404, { error: 'Not found' });
  });
}

test('roster changes remain visible without a refresh', async ({ page }) => {
  await mockLeague(page, 'member');
  await page.goto('/');
  await page.getByLabel('ACCOUNT').selectOption('Joel');
  await page.getByLabel('PASSWORD').fill('123');
  await page.getByRole('button', { name: 'Enter the fields' }).click();
  await expect(page.getByRole('heading', { name: 'Str8UpLazy' })).toBeVisible();
  await expect(page.getByLabel('Your roster')).toContainText('Jaxson Dart');
  await expect(page.getByLabel('TEAM NAME')).toHaveCount(0);
  await expect(page.getByText('Roster from the supplied Yahoo starting lineup.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose Jaxson Dart, QB' }).click();
  await page.getByRole('button', { name: 'Swap with Trevor Lawrence, BN' }).click();
  await expect(page.getByRole('button', { name: 'Choose Trevor Lawrence, QB' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Str8UpLazy' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commissioner' })).toHaveCount(0);
});

test('a failed roster request explains the problem and can be retried', async ({ page }) => {
  await mockLeague(page, 'member', true);
  await page.goto('/');
  await page.getByLabel('ACCOUNT').selectOption('Joel');
  await page.getByLabel('PASSWORD').fill('123');
  await page.getByRole('button', { name: 'Enter the fields' }).click();
  await expect(page.getByRole('heading', { name: 'Str8UpLazy' })).toBeVisible();
  await expect(page.getByText('Couldn’t load this roster: Sign in required')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByLabel('Your roster')).toContainText('Jaxson Dart');
});

test('only the commissioner account displays league controls', async ({ page }) => {
  await mockLeague(page, 'commissioner');
  await page.goto('/');
  await page.getByLabel('ACCOUNT').selectOption('Ryan');
  await page.getByLabel('PASSWORD').fill('123');
  await page.getByRole('button', { name: 'Enter the fields' }).click();
  await page.getByRole('button', { name: 'Commissioner' }).click();
  await expect(page.getByRole('heading', { name: 'League settings.' })).toBeVisible();
});

test('appearance choices change the league and persist for the account', async ({ page }) => {
  await mockLeague(page, 'member');
  await page.goto('/');
  await page.getByLabel('ACCOUNT').selectOption('Joel');
  await page.getByLabel('PASSWORD').fill('123');
  await page.getByRole('button', { name: 'Enter the fields' }).click();
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('button', { name: 'Oracle dusk' }).click();
  await page.getByRole('button', { name: 'Oracle', exact: true }).click();
  await page.getByRole('button', { name: 'Compact rows' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dusk');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'lavender');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.locator('.league-app')).toHaveCSS('background-color', 'rgb(21, 21, 29)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dusk');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'lavender');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
});

test('demo projections and matchup schedule are visible', async ({ page }) => {
  await mockLeague(page, 'member');
  await page.goto('/');
  await page.getByLabel('ACCOUNT').selectOption('Joel');
  await page.getByLabel('PASSWORD').fill('123');
  await page.getByRole('button', { name: 'Enter the fields' }).click();
  await expect(page.getByLabel('Your roster')).toContainText('proj');
  await expect(page.getByText('Demo projections for layout preview.')).toBeVisible();
  await page.getByRole('button', { name: 'Matchups' }).click();
  await expect(page.getByLabel('Demo matchups')).toContainText('Str8UpLazy');
  await expect(page.getByLabel('Demo matchups')).toContainText('1.21 Gigawatts');
  await page.getByLabel('Week').selectOption('3');
  await expect(page.getByRole('heading', { name: 'Week 3 pairings' })).toBeVisible();
});
