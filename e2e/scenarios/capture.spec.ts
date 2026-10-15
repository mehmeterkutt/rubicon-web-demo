// Checklist rows 25 to 27: the remote configuration saved from the Server tab (the kill switch,
// automatic capture switched off) and network capture through the Capture tab's calls. Each test
// runs under an API key of its own, so a remote configuration never reaches another test.
import type { Page } from '@playwright/test';
import { API_CALLS } from '../../src/demo/api-calls';
import {
  arrival,
  arrivals,
  expect,
  named,
  openTab,
  pageViewOf,
  press,
  showTab,
  shownDeviceId,
  test,
} from '../scenario';

/** An API key of this test alone: its remote configuration file and its storage keys. */
function ownKey(): string {
  return `rk_e2e_${test.info().testId}`;
}

async function saveRemote(page: Page, chips: readonly string[]): Promise<void> {
  await showTab(page, 'server');
  for (const chip of chips) await press(page, chip);
  await press(page, 'Save');
  await expect(page.getByTestId('status')).toContainText('Saved on the server');
}

async function reloadFromServerTab(page: Page): Promise<void> {
  await showTab(page, 'server');
  await press(page, 'Reload the page');
  await expect(page.getByTestId('body-server')).toBeVisible();
}

const networkRequest = named('Network Request');

test.describe('row 25: the kill switch', () => {
  test('nothing is collected or sent once it is read; after Delete collection resumes', async ({
    context,
    backend,
    demo,
  }) => {
    await demo.settings({ apiKey: ownKey() });
    await context.clock.install();
    const tab = await openTab(context, '/#server');
    const deviceId = await shownDeviceId(tab.page);
    await arrival(backend, deviceId, named('tab_server'), 'the first events');
    await press(tab.page, 'Kill switch');
    await expect(tab.page.getByTestId('status')).toContainText('Kill switch saved');
    await reloadFromServerTab(tab.page);
    await tab.lines.waitFor(/^Remote configuration (has )?switched the SDK off/);
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    await press(tab.page, 'Flush');

    await showTab(tab.page, 'server');
    await press(tab.page, 'Delete');
    await expect(tab.page.getByTestId('status')).toContainText('Deleted');
    // The stored configuration is read again only when it is over five minutes old, and a page
    // runs with what it read at its start: the second load after that reads the 404.
    await tab.page.clock.fastForward('06:00');
    await reloadFromServerTab(tab.page);
    await tab.lines.waitFor(/^No remote configuration for this key \(404\)$/);
    await reloadFromServerTab(tab.page);
    await showTab(tab.page, 'events');
    await press(tab.page, 'Purchase');
    await arrival(backend, deviceId, named('Purchase Completed'), 'the purchase after collection resumed');
    expect((await backend.eventsOf(deviceId)).filter(named('Button Clicked'))).toEqual([]);
  });
});

test.describe('row 26: automatic capture switched off remotely', () => {
  test('page_views off applies from the next page load', async ({ context, backend, demo }) => {
    await demo.settings({ apiKey: ownKey() });
    const tab = await openTab(context, '/#server');
    const deviceId = await shownDeviceId(tab.page);
    await arrival(backend, deviceId, pageViewOf(':4173/'), 'the first Page Viewed');
    await saveRemote(tab.page, ['page_views']);
    await reloadFromServerTab(tab.page);
    await tab.lines.waitFor(/^Remote configuration saved/);
    await tab.page.getByRole('link', { name: 'Page one' }).click();
    await press(tab.page, 'Track');
    await arrival(backend, deviceId, named('Button Clicked'), 'a click on page one');
    expect((await backend.eventsOf(deviceId)).filter(pageViewOf('/pages/one.html'))).toEqual([]);
  });

  test('network_requests off applies at once; the call itself works', async ({ context, backend, demo }) => {
    await demo.settings({ apiKey: ownKey() });
    const tab = await openTab(context, '/#capture');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'GET with ids and a token');
    await arrival(backend, deviceId, networkRequest, 'a Network Request before the switch-off');
    await saveRemote(tab.page, ['network_requests']);
    await reloadFromServerTab(tab.page);
    await tab.lines.waitFor(/^Remote configuration switched off network request capture$/);
    await showTab(tab.page, 'capture');
    await press(tab.page, 'GET with ids and a token');
    await expect(tab.page.locator('.result').first()).toContainText('HTTP 200');
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    await arrival(backend, deviceId, named('Button Clicked'), 'a later click');
    expect((await backend.eventsOf(deviceId)).filter(networkRequest)).toHaveLength(1);
  });
});

test.describe('row 27: network capture', () => {
  test('every call of the Capture tab: masked, no query, short errors, other hosts untouched', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/#capture');
    const deviceId = await shownDeviceId(tab.page);
    const rejections = new Map<string, string | undefined>();
    for (const call of API_CALLS) {
      await tab.page.getByTestId(`api-${call.id}`).click();
      const result = tab.page.getByTestId(`api-${call.id}`).locator('xpath=..').locator('.result');
      await expect(result).not.toHaveText('running…', { timeout: 10_000 });
      rejections.set(call.id, /^Rejected with (\w+)/.exec((await result.textContent()) ?? '')?.[1]);
    }
    const captured = await arrivals(backend, deviceId, networkRequest, 'eleven Network Request events', 11);
    const port = new URL(backend.apiBase).port;
    const byPath = (path: string, method = 'GET') =>
      captured.find((e) => e.properties?.['path'] === path && e.properties['method'] === method)?.properties;

    expect(byPath('/api/users/:id/orders/:id')).toMatchObject({
      url: `http://localhost:${port}/api/users/:id/orders/:id`,
      host: 'localhost',
      status_code: 200,
    });
    const json = byPath('/api/cart', 'POST');
    const blob = captured.find((e) => e.properties?.['request_bytes'] === 25)?.properties;
    expect(json).toBeDefined();
    expect(captured.filter((e) => e.properties?.['path'] === '/api/cart')).toHaveLength(2);
    expect(blob).toMatchObject({ method: 'POST', path: '/api/cart' });
    expect(byPath('/api/profile', 'PUT')).toMatchObject({ status_code: 200 });
    // The status in the path is a number, so it is masked too.
    const statuses = captured.filter((e) => e.properties?.['path'] === '/api/status/:id');
    expect(statuses.map((e) => e.properties?.['status_code']).sort()).toEqual([404, 500]);
    // The error follows the rejection the app itself got: WebKit 26.6 rejects a fetch whose
    // AbortSignal.timeout fired with an AbortError, so there the timeout call is canceled too.
    const errorOf = (name: string | undefined) => (name === 'TimeoutError' ? 'timeout' : 'canceled');
    const slow = captured.filter((e) => e.properties?.['path'] === '/api/slow').map((e) => e.properties);
    expect(slow.map((p) => p?.['error']).sort()).toEqual(
      [errorOf(rejections.get('timeout')), errorOf(rejections.get('canceled'))].sort(),
    );
    expect(rejections.get('canceled')).toBe('AbortError');
    expect(slow.every((p) => p?.['status_code'] === undefined)).toBe(true);
    expect(captured.find((e) => e.properties?.['url'] === 'http://localhost:65535/api/ping')?.properties).toMatchObject(
      {
        error: 'network',
      },
    );
    // The "Mask reset tokens" hook (a default) rewrote the automatic event's values.
    expect(byPath('/api/reset-password/:token')).toBeDefined();
    expect(captured.find((e) => e.properties?.['host'] === 'a.rubicon.test')?.properties).toMatchObject({
      path: '/api/ping',
    });
    // Never a query, a fragment, a header or a body; never the unknown host or the SDK's own.
    for (const event of captured) {
      expect(String(event.properties?.['url'])).not.toMatch(/[?#]/);
      expect(
        Object.keys(event.properties ?? {}).every((k) =>
          [
            'method',
            'url',
            'path',
            'host',
            'status_code',
            'error',
            'duration_ms',
            'request_bytes',
            'response_bytes',
          ].includes(k),
        ),
      ).toBe(true);
    }
    expect(captured.filter((e) => /unknown-host|127\.0\.0\.1/.test(String(e.properties?.['url'])))).toEqual([]);
  });
});
