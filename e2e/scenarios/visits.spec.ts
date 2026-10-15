// Checklist rows 1, 2, 16 (simulated hiding), 17 and 19: a first visit and a return, sessions, a
// hidden page, leaving, closing and reopening, and page views, driven through the demo's pages.
import {
  arrival,
  arrivals,
  chunksStored,
  expect,
  named,
  openTab,
  pageViewOf,
  press,
  sessionOf,
  setVisibility,
  showTab,
  shownDeviceId,
  storedEvents,
  test,
} from '../scenario';
import type { WireEvent } from '../scenario';

/** Uploads only when the test asks: no count before 100 events, no interval before 10 minutes. */
const HOLD = { flushAt: 100, flushIntervalMs: 600_000 };

const clicked = (page: string) => (e: WireEvent) => named('Button Clicked')(e) && e.properties?.['page'] === page;

test.describe('row 1: a first visit and a return', () => {
  test('the first visit starts a session and stores the identity; a return keeps device and session', async ({
    context,
    backend,
  }) => {
    const first = await openTab(context, '/#identity');
    const deviceId = await shownDeviceId(first.page);
    const started = await arrival(backend, deviceId, named('Session Started'), 'Session Started');
    const view = await arrival(backend, deviceId, pageViewOf(':4173/'), 'Page Viewed of /');
    const screen = await arrival(backend, deviceId, named('tab_identity'), 'screen tab_identity');
    for (const event of [started, view, screen]) {
      expect(event.user_id).toBeNull();
      expect(sessionOf(event)).toBe(sessionOf(started));
    }
    // What the SDK stores, as the Identity tab lists it (docs/storage-declaration.md of the SDK).
    await press(first.page, 'Read again');
    const stored = first.page.getByTestId('sdk-storage');
    await expect(stored).toContainText(/cookie\s+rubicon_[0-9a-f]{16} /);
    await expect(stored).toContainText(/cookie\s+rubicon_[0-9a-f]{16}_s /);
    await expect(stored).toContainText(/localStorage\s+rubicon\.[0-9a-f]{16}\.device /);

    // The return: the tab is closed and the site opened again in a new one.
    await first.page.close();
    const again = await openTab(context, '/pages/one.html');
    await shownDeviceId(again.page, deviceId);
    const returned = await arrival(backend, deviceId, pageViewOf('/pages/one.html'), 'Page Viewed of the return');
    expect(sessionOf(returned)).toBe(sessionOf(started));
    expect((await backend.eventsOf(deviceId)).filter(named('Session Started'))).toHaveLength(1);
  });
});

test.describe('row 2: sessions', () => {
  test('after the inactivity timeout the next event ends the session, backdated, and starts a new one', async ({
    context,
    backend,
    demo,
  }) => {
    await demo.settings({ sessionTimeoutMs: 60_000 });
    await context.clock.install();
    const tab = await openTab(context, '/#events');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'Track');
    const before = await arrival(backend, deviceId, named('Button Clicked'), 'the first Button Clicked');

    await tab.page.clock.fastForward('02:00');
    await press(tab.page, 'Track');
    const clicks = await arrivals(backend, deviceId, named('Button Clicked'), 'the second Button Clicked', 2);
    const after = clicks[1] as WireEvent;
    const ended = await arrival(backend, deviceId, named('Session Ended'), 'Session Ended');
    const starts = await arrivals(backend, deviceId, named('Session Started'), 'the second Session Started', 2);

    expect(sessionOf(ended)).toBe(sessionOf(before));
    expect(sessionOf(after)).toBe(sessionOf(starts[1] as WireEvent));
    expect(sessionOf(after)).not.toBe(sessionOf(before));
    // Backdated to the last activity, before the gap.
    expect(ended['timestamp']).toBeLessThanOrEqual((after['timestamp'] as number) - 60_000);
    expect(typeof ended.properties?.['duration_ms']).toBe('number');
  });

  test('a session ends after 12 hours however active it is', async ({ context, backend, demo }) => {
    await demo.settings({ sessionTimeoutMs: 3_600_000 });
    await context.clock.install();
    const tab = await openTab(context, '/#events');
    const deviceId = await shownDeviceId(tab.page);
    const first = await arrival(backend, deviceId, named('Session Started'), 'Session Started');
    for (let hour = 1; hour <= 13; hour++) {
      await tab.page.clock.fastForward('55:00');
      await press(tab.page, 'Track');
      await arrivals(backend, deviceId, named('Button Clicked'), `Button Clicked ${hour}`, hour);
    }
    const ended = await arrival(backend, deviceId, named('Session Ended'), 'Session Ended');
    expect(sessionOf(ended)).toBe(sessionOf(first));
    const events = await backend.eventsOf(deviceId);
    const inFirst = events.filter((e) => sessionOf(e) === sessionOf(first));
    const span = Math.max(...inFirst.map((e) => e['timestamp'] as number)) - (first['timestamp'] as number);
    expect(span).toBeLessThanOrEqual(12 * 3_600_000);
    expect(events.filter(named('Session Started')).length).toBeGreaterThanOrEqual(2);
  });
});

test.describe('row 16: a hidden page (simulated)', () => {
  test('hiding sends what waits at once, uncompressed; an event while hidden joins the open session', async ({
    context,
    backend,
    demo,
  }) => {
    await demo.settings(HOLD);
    const tab = await openTab(context, '/#events');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'Track');
    await press(tab.page, 'Track');
    await chunksStored(tab.page);
    expect(await backend.eventsOf(deviceId)).toEqual([]);

    await setVisibility(tab.page, 'hidden');
    const clicks = await arrivals(backend, deviceId, named('Button Clicked'), 'the hiding upload', 2);
    const batches = (await backend.requests()).filter((r) => r.method === 'POST' && r.path === '/v1/batch');
    expect(batches.at(-1)?.gzip).toBe(false);

    await press(tab.page, 'Screen');
    await press(tab.page, 'Flush');
    const hidden = await arrival(backend, deviceId, named('checkout'), 'the screen of the hidden page');
    expect(sessionOf(hidden)).toBe(sessionOf(clicks[0] as WireEvent));
  });
});

test.describe('row 17: leaving, closing and reopening', () => {
  test('leaving by a link sends what waits from pagehide', async ({ context, backend, demo }) => {
    await demo.settings(HOLD);
    const tab = await openTab(context, '/pages/one.html');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'Track');
    await press(tab.page, 'Track');
    await chunksStored(tab.page);
    await tab.page.getByRole('link', { name: 'To page two (same site)' }).click();
    // Page two waits 10 minutes before it sends anything itself, so these came from the leaving page.
    await arrivals(backend, deviceId, clicked('one'), 'the clicks of page one', 2);
    await arrival(backend, deviceId, pageViewOf('/pages/one.html'), 'the Page Viewed of page one');
  });

  test('a closed tab whose upload failed leaves its events stored; the next page sends them once', async ({
    context,
    backend,
    demo,
  }) => {
    await demo.settings(HOLD);
    await context.clock.install();
    const tab = await openTab(context, '/pages/one.html');
    const deviceId = await shownDeviceId(tab.page);
    for (let i = 0; i < 5; i++) await press(tab.page, 'Track');
    await expect.poll(() => storedEvents(tab.page)).toBeGreaterThanOrEqual(5);
    // Offline while the tab closes, so its pagehide upload (where the engine runs one) cannot go.
    await context.setOffline(true);
    await tab.page.close();
    await context.setOffline(false);

    const next = await openTab(context, '/pages/two.html');
    await shownDeviceId(next.page, deviceId);
    // An hour and a minute later, so the chunks are another page's released or aged ones (Web Queue
    // 2): Playwright's Firefox closes a tab without its pagehide (SDK plan section 15, step 1.4).
    await next.page.clock.fastForward('01:01:00');
    await press(next.page, 'Flush');
    await arrivals(backend, deviceId, clicked('one'), 'the five clicks of the closed tab', 5);
    await press(next.page, 'Track');
    await press(next.page, 'Flush');
    await arrival(backend, deviceId, clicked('two'), 'a click on the next page');
    const ids = (await backend.eventsOf(deviceId)).filter(clicked('one')).map((e) => e['message_id']);
    expect(new Set(ids).size).toBe(5);
  });

  test('300 events and leaving at once: every event arrives or is counted as page_closed', async ({
    context,
    backend,
    demo,
  }) => {
    await demo.settings(HOLD);
    const tab = await openTab(context, '/#capture');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, '300 events, then leave');
    await tab.page.waitForURL('**/pages/one.html');
    await shownDeviceId(tab.page, deviceId);
    const counts = tab.page.locator('.subtitle', { hasText: 'queued' });
    const dropped = async () => Number(/dropped (\d+)/.exec((await counts.textContent()) ?? '')?.[1] ?? 'NaN');
    await expect(counts).toContainText('dropped');
    let indexes = new Set<unknown>();
    await expect
      .poll(
        async () => {
          await press(tab.page, 'Flush');
          const left = (await backend.eventsOf(deviceId)).filter(named('Left While Writing'));
          indexes = new Set(left.map((e) => e.properties?.['index']));
          return indexes.size + (await dropped());
        },
        { message: 'arrived and page_closed events add up to 300', timeout: 30_000 },
      )
      .toBe(300);
    // What was written is the oldest part, in call order; what the closing page could not write is
    // the end of it.
    expect([...indexes].every((i) => typeof i === 'number' && i < indexes.size)).toBe(true);
    if ((await dropped()) > 0) await expect(tab.page.getByText('reason: page_closed').first()).toBeAttached();
  });
});

test.describe('row 19: page views', () => {
  test('a campaign link sends its utm_* and ref only; empty utm values are left out', async ({ context, backend }) => {
    const tab = await openTab(context, '/#capture');
    const deviceId = await shownDeviceId(tab.page);
    await tab.page.getByRole('link', { name: 'Campaign link' }).click();
    const view = await arrival(backend, deviceId, pageViewOf('/pages/one.html'), 'Page Viewed of the campaign link');
    expect(view.properties).toEqual({
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'fall',
      utm_term: 'shoes',
      utm_content: 'banner',
    });
    const page = view.context?.page as Record<string, unknown>;
    expect(page['query']).toEqual({ ref: 'demo' });
    expect(page['url']).toBe('http://a.rubicon.test:4173/pages/one.html');
    expect(page['referrer']).toBe('http://a.rubicon.test:4173/');
    await press(tab.page, 'Track');
    const later = await arrival(backend, deviceId, clicked('one'), 'a later event');
    expect(later.properties).toEqual({ page: 'one' });

    await tab.page.goto(tab.page.url().replace(/\/pages\/one.*$/, '/#capture'));
    await tab.page.getByRole('link', { name: 'Empty utm values' }).click();
    const empty = await arrival(backend, deviceId, pageViewOf('/pages/two.html'), 'Page Viewed with empty utm');
    expect(empty.properties).toEqual({ utm_source: 'partner' });
  });

  test('the single-page area: pushes, replaces in and out of the window, query changes and Back', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/spa/');
    const deviceId = await shownDeviceId(tab.page);
    await arrival(backend, deviceId, pageViewOf('/spa/'), 'Page Viewed of /spa/');
    // React Router's link to the area's root is `/spa`, the address of the load `/spa/`: one path.
    const pathOf = (e: WireEvent) => (e.context?.page?.url ?? '').replace(/^http:\/\/[^/]+/, '').replace(/\/$/, '');
    const views = async (path: string) =>
      (await backend.eventsOf(deviceId)).filter((e) => named('Page Viewed')(e) && pathOf(e) === path.replace(/\/$/, ''))
        .length;

    await press(tab.page, 'Two pushes in a row');
    await expect(tab.page.getByTestId('spa-path')).toHaveText('/orders/1002');
    await expect.poll(() => views('/spa/orders/:id')).toBe(2);

    // Back twice: a view for each popstate.
    await tab.page.goBack();
    await expect(tab.page.getByTestId('spa-path')).toHaveText('/orders/1001');
    await tab.page.goBack();
    await expect(tab.page.getByTestId('spa-path')).toHaveText('/');
    await expect.poll(() => views('/spa/')).toBe(2);
    expect(await views('/spa/orders/:id')).toBe(3);

    // A replace inside the 500 ms window moves the view: one, of the final path.
    await press(tab.page, 'Replace after 100 ms');
    await expect(tab.page.getByTestId('spa-path')).toHaveText('/orders/1004');
    await expect.poll(() => views('/spa/orders/:id')).toBe(4);
    expect(await views('/spa/orders')).toBe(0);

    // A change of the query or the fragment alone sends none.
    await tab.page.getByRole('link', { name: 'All orders' }).click();
    await tab.page.getByRole('link', { name: 'Sort (query only)' }).click();
    await tab.page.getByRole('link', { name: 'Summary (fragment only)' }).click();
    await tab.page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(tab.page.getByTestId('spa-path')).toHaveText('/');
    await expect.poll(() => views('/spa/')).toBe(3);
    expect(await views('/spa/orders')).toBe(1);

    // A replace outside the window is a view of its own.
    await press(tab.page, 'Replace after 1 s');
    await expect(tab.page.getByTestId('spa-path')).toHaveText('/orders/1003');
    await expect.poll(() => views('/spa/orders/:id')).toBe(5);
    expect(await views('/spa/orders')).toBe(2);
  });

  test('a redirect while rendering at load gives one view, of the final path', async ({ context, backend }) => {
    const tab = await openTab(context, '/#capture');
    const deviceId = await shownDeviceId(tab.page);
    await tab.page.getByRole('link', { name: 'Redirect at load' }).click();
    await expect(tab.page.getByTestId('spa-path')).toHaveText('/login');
    await arrival(backend, deviceId, pageViewOf('/spa/login'), 'Page Viewed of /spa/login');
    await press(tab.page, 'Log in as user-42');
    await arrival(backend, deviceId, pageViewOf('/spa/orders'), 'Page Viewed of /spa/orders after it');
    const paths = (await backend.eventsOf(deviceId))
      .filter(named('Page Viewed'))
      .map((e) => e.context?.page?.url?.replace('http://a.rubicon.test:4173', ''));
    expect(paths).toEqual(['/', '/spa/login', '/spa/orders']);
  });

  test('a query change or a hash change on the main page sends no view', async ({ context, backend }) => {
    const tab = await openTab(context, '/#capture');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'pushState, query only');
    await press(tab.page, 'Change the hash');
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    await arrival(backend, deviceId, named('Button Clicked'), 'a later click');
    await tab.page.getByRole('link', { name: 'Page one' }).click();
    await arrival(backend, deviceId, pageViewOf('/pages/one.html'), 'the next page');
    expect((await backend.eventsOf(deviceId)).filter(named('Page Viewed'))).toHaveLength(2);
  });
});
