// Checklist rows 21 to 24, 28 and 29: the demo's special pages. The sandboxed frame, the page whose
// policy blocks the host, the snippet page (on the shared backend of 8080, the only host its policy
// allows), the snippet without its library (blocked as an ad blocker would), the script build, and
// an https page with an http host, which the demo does not serve (no certificate, the user's decision
// of 2026-10-15): Playwright answers https://shop.rubicon.test itself with the script build, and the
// test calls window.Rubicon, since there is no app control on such a page.
import { BACKEND, arrival as sharedArrival } from '../fixtures';
import {
  arrival,
  arrivals,
  chunksStored,
  expect,
  Lines,
  named,
  openTab,
  pageViewOf,
  press,
  shownDeviceId,
  test,
} from '../scenario';

test.describe('row 21: a sandboxed iframe', () => {
  // A sandboxed frame's URL has a real origin, so its events carry the frame's page.url; only a page
  // whose location.origin is "null" (about:blank, file:) sends none. The user's answer of 2026-10-16
  // to the step 9.3 report, correcting the SDK plan's step 7.5 reading (f) (docs/decisions.md).
  test("runs from memory with STORAGE_UNAVAILABLE; its events go from origin null with the frame's page.url", async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/pages/sandboxed.html');
    const frame = tab.page.frameLocator('iframe');
    await expect(frame.locator('#device')).toHaveText(/^[0-9a-f-]{36}$/);
    const deviceId = (await frame.locator('#device').textContent()) ?? '';
    await expect(frame.locator('#out')).toContainText('STORAGE_UNAVAILABLE');
    const from = await backend.mark();
    await frame.locator('#track').click();
    const event = await arrival(backend, deviceId, named('Sandboxed Button Clicked'), 'the frame click');
    expect(event.context?.page?.url).toBe('http://a.rubicon.test:4173/pages/sandboxed-frame.html');
    const batches = (await backend.requestsSince(from)).filter((r) => r.method === 'POST' && r.path === '/v1/batch');
    expect(batches.some((r) => r.origin === 'null')).toBe(true);

    // Memory only: the next load of the frame is another device.
    await tab.page.reload();
    await expect(frame.locator('#device')).toHaveText(/^[0-9a-f-]{36}$/);
    expect(await frame.locator('#device').textContent()).not.toBe(deviceId);
    // The page around the frame keeps its own storage and identity.
    await shownDeviceId(tab.page);
  });
});

test.describe('row 22: a policy that blocks the host', () => {
  test('CSP_BLOCKED once; the events stay stored and another page of the site sends them', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/pages/csp-blocked.html');
    const deviceId = await shownDeviceId(tab.page);
    const blocked = await tab.lines.waitFor(/^CSP_BLOCKED: /);
    expect(blocked.type).toBe('error');
    await press(tab.page, 'Track');
    await chunksStored(tab.page);
    expect(tab.lines.matching(/^CSP_BLOCKED: /).filter((l) => l.type === 'error')).toHaveLength(1);
    expect(await backend.eventsOf(deviceId)).toEqual([]);

    await tab.page.getByRole('link', { name: 'Page one' }).click();
    await shownDeviceId(tab.page, deviceId);
    await expect
      .poll(
        async () => {
          await press(tab.page, 'Flush');
          return (await backend.eventsOf(deviceId)).filter(pageViewOf('/pages/csp-blocked.html')).length;
        },
        { message: "the blocked page's events, sent by page one", timeout: 30_000 },
      )
      .toBe(1);
    await arrival(
      backend,
      deviceId,
      (e) => named('Button Clicked')(e) && e.properties?.['page'] === 'csp-blocked',
      'its click',
    );
  });
});

test.describe('row 23: an https page and an http host (routed page; the real one is manual)', () => {
  test('an http host other than the loopback is mixed content: CLEARTEXT_HOST ERROR, nothing sent', async ({
    context,
    backend,
  }) => {
    const script = await (await fetch('http://127.0.0.1:4173/sdk/rubicon.min.js')).text();
    await context.route('https://shop.rubicon.test/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/rubicon.min.js') await route.fulfill({ contentType: 'text/javascript', body: script });
      else
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Shop</title><script src="/rubicon.min.js"></script>',
        });
    });
    const page = await context.newPage();
    const lines = new Lines(page);
    await page.goto('https://shop.rubicon.test/');
    const from = await backend.mark();
    const port = new URL(backend.origin).port;
    await page.evaluate((host) => {
      const sdk = Reflect.get(window, 'Rubicon') as {
        createAnalytics: (c: unknown) => Record<string, (...a: unknown[]) => void>;
      };
      const analytics = sdk.createAnalytics({ apiKey: 'rk_demo', host, flush: { at: 1 }, logging: { level: 'debug' } });
      analytics['track']?.('Mixed Content');
      analytics['flush']?.();
    }, `http://a.rubicon.test:${port}`);
    const error = await lines.waitFor(/^CLEARTEXT_HOST: The host uses http:\/\/, which the browser blocks/);
    expect(error.type).toBe('error');
    await lines.waitFor(/^The host is blocked as mixed content; this page does not upload$/);
    await backend.mark();
    expect((await backend.requestsSince(from)).filter((r) => r.path.startsWith('/v1/'))).toEqual([]);
  });

  test('an http host on the loopback interface is no mixed content: the WARN only', async ({ context, backend }) => {
    const script = await (await fetch('http://127.0.0.1:4173/sdk/rubicon.min.js')).text();
    await context.route('https://shop.rubicon.test/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/rubicon.min.js') await route.fulfill({ contentType: 'text/javascript', body: script });
      else
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Shop</title><script src="/rubicon.min.js"></script>',
        });
    });
    const page = await context.newPage();
    const lines = new Lines(page);
    await page.goto('https://shop.rubicon.test/');
    await page.evaluate((host) => {
      const sdk = Reflect.get(window, 'Rubicon') as { createAnalytics: (c: unknown) => unknown };
      sdk.createAnalytics({ apiKey: 'rk_demo', host, logging: { level: 'debug' } });
    }, backend.origin);
    const warn = await lines.waitFor(/^CLEARTEXT_HOST: The host uses http:\/\/; events travel unencrypted\.$/);
    expect(warn.type).toBe('warning');
  });
});

test.describe('row 24: the snippet without its library (as an ad blocker blocks it)', () => {
  test('the page works and the calls stay queued in the stub', async ({ context, demo }) => {
    await demo.settings({ host: BACKEND });
    await context.route('**/sdk/rubicon.min.js', (route) => route.abort('blockedbyclient'));
    const tab = await openTab(context, '/pages/snippet.html');
    await expect(tab.page.getByTestId('sdk-state')).toHaveText('SDK not loaded yet');
    await press(tab.page, 'Track');
    await expect(tab.page.getByTestId('status')).toContainText('called on the stub');
    const queued = await tab.page.evaluate(() =>
      (Reflect.get(window, 'rubicon') as { _q: unknown[][] })._q.map((entry) => entry[0]),
    );
    expect(queued).toEqual(['pageViewed', 'init', 'track', 'track']);
  });
});

test.describe('row 28: the snippet page', () => {
  test('the queued calls are replayed in order under the strict policy; a second load changes nothing', async ({
    context,
    demo,
  }) => {
    await demo.settings({ host: BACKEND });
    const violations: string[] = [];
    const tab = await openTab(context, '/pages/snippet.html');
    tab.page.on('console', (message) => {
      if (/Content.Security.Policy|Refused to/i.test(message.text())) violations.push(message.text());
    });
    const deviceId = await shownDeviceId(tab.page);
    const opened = await sharedArrival(deviceId, named('Snippet Page Opened'), 'the replayed call');
    expect(opened.properties).toEqual({ queued_before_load: true });
    const view = await sharedArrival(deviceId, pageViewOf('/pages/snippet.html'), 'the Page Viewed of the stub');
    expect(view['timestamp']).toBeLessThanOrEqual(opened['timestamp'] as number);

    await press(tab.page, 'Load the library again');
    const second = await tab.lines.waitFor(/^SECOND_INSTANCE: /);
    expect(second.type).toBe('error');
    await shownDeviceId(tab.page, deviceId);
    await press(tab.page, 'Track');
    await expect(tab.page.getByTestId('status')).toContainText('called on the instance');
    await sharedArrival(deviceId, named('Snippet Button Clicked'), 'a click after the second load');
    expect(violations).toEqual([]);
  });
});

test.describe('row 29: the script build page', () => {
  test('window.Rubicon sends; a second load and a second copy change nothing and log SECOND_INSTANCE', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/pages/script.html');
    const deviceId = await shownDeviceId(tab.page);
    await expect(tab.page.getByText('createAnalytics, createNoOpAnalytics, createTrackedFetch')).toBeVisible();
    await press(tab.page, 'Track');
    await arrival(backend, deviceId, named('Script Button Clicked'), 'the click through window.Rubicon');

    await press(tab.page, 'Load the file again');
    await tab.lines.waitFor(/^SECOND_INSTANCE: /);
    const before = tab.lines.matching(/^SECOND_INSTANCE: /).length;
    await press(tab.page, 'Two copies');
    await expect.poll(() => tab.lines.matching(/^SECOND_INSTANCE: /).length).toBeGreaterThan(before);
    await tab.page.getByRole('button', { name: 'SDK log' }).click();
    await expect(tab.page.getByTestId('log-lines')).toContainText('The npm copy returned the script build’s instance');
    await shownDeviceId(tab.page, deviceId);

    await press(tab.page, 'Track');
    await arrivals(backend, deviceId, named('Script Button Clicked'), 'a click after both', 2);
    expect((await backend.eventsOf(deviceId)).filter(named('Network Request'))).toEqual([]);
  });
});
