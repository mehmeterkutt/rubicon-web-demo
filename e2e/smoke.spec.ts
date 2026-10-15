// The smoke suite of step 9.2: every page and every tab of the demo opens in each engine and at least
// one of its events reaches the fake backend. The scenario suite is step 9.3's.
import { appUrl, arrival, deviceIdOf, expect, HOST_B, named, test } from './fixtures';
import type { WireEvent } from './fixtures';

const pageViewOf = (path: string) => (e: WireEvent) =>
  e.event === 'Page Viewed' && (e.context?.page?.url ?? '').endsWith(path);

test.describe('the main page', () => {
  for (const tab of ['events', 'identity', 'capture', 'server', 'logs', 'settings']) {
    test(`the ${tab} tab opens and its screen arrives`, async ({ page }) => {
      await page.goto(appUrl(`/#${tab}`));
      await expect(page.getByTestId(`body-${tab}`)).toBeVisible();
      const deviceId = await deviceIdOf(page);
      await arrival(deviceId, named(`tab_${tab}`), `screen tab_${tab}`);
    });
  }

  test('a tracked event and the page view arrive', async ({ page }) => {
    await page.goto(appUrl('/#events'));
    const deviceId = await deviceIdOf(page);
    await page.getByTestId('track').click();
    await arrival(deviceId, named('Button Clicked'), 'Button Clicked');
    await arrival(deviceId, pageViewOf(`:4173/`), 'Page Viewed of /');
  });

  test('the server tab reaches the fake backend', async ({ page }) => {
    await page.goto(appUrl('/#server'));
    await expect(page.getByTestId('backend-state')).toHaveText('reachable');
  });
});

test.describe('the pages', () => {
  for (const path of ['/pages/one.html', '/pages/two.html', '/pages/bfcache.html', '/pages/other-host.html']) {
    test(`${path} sends its Page Viewed and a tracked event`, async ({ page }) => {
      await page.goto(appUrl(path));
      const deviceId = await deviceIdOf(page);
      await arrival(deviceId, pageViewOf(path), `Page Viewed of ${path}`);
      await page.getByTestId('track').click();
      await arrival(deviceId, named('Button Clicked'), 'Button Clicked');
    });
  }

  test('a campaign link sends the utm_* of its address', async ({ page }) => {
    await page.goto(appUrl('/pages/one.html?utm_source=newsletter&utm_campaign=fall&token=secret#top'));
    const deviceId = await deviceIdOf(page);
    const view = await arrival(deviceId, pageViewOf('/pages/one.html'), 'Page Viewed with utm_*');
    expect(view.properties).toEqual({ utm_source: 'newsletter', utm_campaign: 'fall' });
  });

  test('the second subdomain shares the deviceId of the first', async ({ page }) => {
    await page.goto(appUrl('/pages/one.html'));
    const deviceId = await deviceIdOf(page);
    await arrival(deviceId, pageViewOf('/pages/one.html'), 'Page Viewed on host a');
    await page.goto(appUrl('/pages/other-host.html', HOST_B));
    expect(await deviceIdOf(page)).toBe(deviceId);
    await arrival(
      deviceId,
      (e) => pageViewOf('/pages/other-host.html')(e) && (e.context?.page?.url ?? '').includes(HOST_B),
      'Page Viewed on host b',
    );
  });

  test('the script build page sends through window.Rubicon', async ({ page }) => {
    await page.goto(appUrl('/pages/script.html'));
    const deviceId = await deviceIdOf(page);
    await arrival(deviceId, pageViewOf('/pages/script.html'), 'Page Viewed of the script build page');
    await page.getByTestId('track').click();
    await arrival(deviceId, named('Script Button Clicked'), 'Script Button Clicked');
  });

  test('the snippet page runs under its policy and replays the queued call', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content.Security.Policy|Refused to/i.test(message.text())) violations.push(message.text());
    });
    await page.goto(appUrl('/pages/snippet.html'));
    const deviceId = await deviceIdOf(page);
    await arrival(deviceId, named('Snippet Page Opened'), 'Snippet Page Opened');
    await arrival(deviceId, pageViewOf('/pages/snippet.html'), 'Page Viewed of the snippet page');
    await page.getByTestId('track').click();
    await arrival(deviceId, named('Snippet Button Clicked'), 'Snippet Button Clicked');
    expect(violations).toEqual([]);
  });

  test('the page whose policy leaves the host out logs CSP_BLOCKED', async ({ page }) => {
    await page.goto(appUrl('/pages/csp-blocked.html'));
    await deviceIdOf(page);
    await page.getByRole('button', { name: 'SDK log' }).click();
    await expect(page.getByTestId('log-lines')).toContainText('CSP_BLOCKED', { timeout: 15_000 });
  });

  test('the sandboxed iframe runs from memory and its events arrive', async ({ page }) => {
    await page.goto(appUrl('/pages/sandboxed.html'));
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#device')).toHaveText(/^[0-9a-f-]{36}$/);
    const deviceId = (await frame.locator('#device').textContent()) ?? '';
    await expect(frame.locator('#out')).toContainText('STORAGE_UNAVAILABLE');
    await frame.locator('#track').click();
    await arrival(deviceId, named('Sandboxed Button Clicked'), 'Sandboxed Button Clicked');
  });
});

test.describe('the single-page area', () => {
  test('a load and a client-side navigation each send a Page Viewed', async ({ page }) => {
    await page.goto(appUrl('/spa/'));
    const deviceId = await deviceIdOf(page);
    await arrival(deviceId, pageViewOf('/spa/'), 'Page Viewed of /spa/');
    await page.getByTestId('spa-orders').click();
    await expect(page.getByTestId('spa-path')).toHaveText('/orders');
    await arrival(deviceId, pageViewOf('/spa/orders'), 'Page Viewed of /spa/orders');
  });

  test('a deep address loads the area, and a redirect while rendering gives the final view', async ({ page }) => {
    await page.goto(appUrl('/spa/login-required'));
    await expect(page.getByTestId('spa-path')).toHaveText('/login');
    const deviceId = await deviceIdOf(page);
    await arrival(deviceId, pageViewOf('/spa/login'), 'Page Viewed of /spa/login');
  });
});
