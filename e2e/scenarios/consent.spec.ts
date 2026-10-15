// Checklist rows 9 and 10: opting out and in, and pending consent, through the pages' buttons;
// the server's request log shows that nothing is sent and no remote configuration is asked for.
import type { Page } from '@playwright/test';
import {
  arrival,
  arrivals,
  storedEvents,
  storedKeys,
  expect,
  named,
  openTab,
  pageViewOf,
  press,
  sessionOf,
  showTab,
  shownDeviceId,
  test,
} from '../scenario';
import type { Backend } from '../backend';
import type { WireEvent } from '../scenario';

const HOLD = { flushAt: 100, flushIntervalMs: 600_000 };

async function expectSending(page: Page, sending: boolean): Promise<void> {
  await expect(page.getByTestId('sdk-state')).toHaveText(sending ? 'sending' : 'not sending');
}

/** The SDK's requests (`/v1/...`, preflights included) between two markers of the server's log. */
async function sdkRequestsBetween(backend: Backend, from: string, to: string): Promise<string[]> {
  const since = await backend.requestsSince(from);
  const end = since.findIndex((r) => r.path === to);
  return since
    .slice(0, end)
    .filter((r) => r.path.startsWith('/v1/'))
    .map((r) => `${r.method} ${r.path}`);
}

test.describe('row 9: opt-out and opt-in', () => {
  test('opted out nothing new is kept or sent; opting in resumes with a new session and no event', async ({
    context,
    backend,
    demo,
  }) => {
    await demo.settings(HOLD);
    const tab = await openTab(context, '/pages/one.html');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'Track');
    // Session Started, Page Viewed and the click, written before the opt-out.
    await expect.poll(() => storedEvents(tab.page)).toBe(3);

    await press(tab.page, 'Opt out');
    await expectSending(tab.page, false);
    const from = await backend.mark();
    await press(tab.page, 'Track');
    await press(tab.page, 'Flush');
    await press(tab.page, 'Identify user-42');
    await expect.poll(() => storedEvents(tab.page)).toBe(3);
    const to = await backend.mark();

    await press(tab.page, 'Opt in');
    await expectSending(tab.page, true);
    await press(tab.page, 'Track');
    await press(tab.page, 'Flush');
    const clicks = await arrivals(backend, deviceId, named('Button Clicked'), 'the stored click and the new one', 2);
    expect(await sdkRequestsBetween(backend, from, to)).toEqual([]);
    // The stored event waited for the opt-in; the click made while opted out never existed; the
    // identify made while opted out was replayed onto the identity at the opt-in, without an event.
    const events = await backend.eventsOf(deviceId);
    expect(events.filter(named('Button Clicked'))).toHaveLength(2);
    expect(events.filter((e) => e.type === 'identify')).toEqual([]);
    expect((clicks[1] as WireEvent).user_id).toBe('user-42');
    expect(events.filter(named('Session Ended'))).toEqual([]);
    expect(events.filter(named('Session Started'))).toHaveLength(2);
    expect(sessionOf(clicks[1] as WireEvent)).not.toBe(sessionOf(clicks[0] as WireEvent));
  });

  test('a page left while opted out keeps its events; a later page sends them after the age threshold', async ({
    context,
    backend,
    demo,
  }) => {
    await demo.settings(HOLD);
    await context.clock.install();
    const tab = await openTab(context, '/pages/one.html');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'Track');
    await expect.poll(() => storedEvents(tab.page)).toBe(3);
    await press(tab.page, 'Opt out');
    await expectSending(tab.page, false);
    // Leaving while opted out writes nothing but the decision, not even the released marker (Web
    // Queue 2), so the next page treats the chunks as another living page's until they are aged.
    await tab.page.getByRole('link', { name: 'To page two (same site)' }).click();
    await shownDeviceId(tab.page, deviceId);
    expect(await storedKeys(tab.page, '.q1r.')).toEqual([]);
    await press(tab.page, 'Opt in');
    await expectSending(tab.page, true);
    await press(tab.page, 'Flush');
    await arrival(backend, deviceId, pageViewOf('/pages/two.html'), 'the view of page two');
    expect((await backend.eventsOf(deviceId)).filter(named('Button Clicked'))).toEqual([]);
    await tab.page.clock.fastForward('01:01:00');
    await press(tab.page, 'Flush');
    await arrival(
      backend,
      deviceId,
      (e) => named('Button Clicked')(e) && e.properties?.['page'] === 'one',
      'the click of page one',
    );
  });
});

test.describe('row 10: pending consent', () => {
  test('pending: nothing stored or sent, no remote configuration; an opt-in sends everything waiting', async ({
    context,
    backend,
    demo,
  }) => {
    await demo.settings({ defaultConsent: 'pending' });
    const from = await backend.mark();
    const tab = await openTab(context, '/#events');
    await expectSending(tab.page, false);
    await press(tab.page, 'Track');
    await press(tab.page, 'Purchase');
    await showTab(tab.page, 'identity');
    await press(tab.page, 'Read again');
    await expect(tab.page.getByText('Nothing: a first visit')).toBeVisible();
    const to = await backend.mark();
    expect(await sdkRequestsBetween(backend, from, to)).toEqual([]);

    await press(tab.page, 'Opt in');
    await expectSending(tab.page, true);
    const deviceId = await shownDeviceId(tab.page);
    await arrival(backend, deviceId, named('Purchase Completed'), 'the immediate event that waited');
    await arrival(backend, deviceId, named('Button Clicked'), 'the click that waited');
    await arrival(backend, deviceId, named('tab_identity'), 'the screen that waited');
    await arrival(backend, deviceId, named('Page Viewed'), 'the page view that waited');
  });

  test('pending: an opt-out drops what waits, and leaving the page loses it', async ({ context, backend, demo }) => {
    await demo.settings({ defaultConsent: 'pending' });
    const tab = await openTab(context, '/#events');
    await press(tab.page, 'Track');
    await tab.page.reload();
    await press(tab.page, 'Track');
    await showTab(tab.page, 'identity');
    await press(tab.page, 'Opt out');
    await press(tab.page, 'Opt in');
    await expectSending(tab.page, true);
    const deviceId = await shownDeviceId(tab.page);
    await showTab(tab.page, 'events');
    await press(tab.page, 'Screen');
    await arrival(backend, deviceId, named('checkout'), 'the screen after the opt-in');
    expect((await backend.events()).filter((e) => e.device_id === deviceId && named('Button Clicked')(e))).toEqual([]);
  });

  test('with persistConsent off the decision lasts for the page only', async ({ context, demo }) => {
    await demo.settings({ defaultConsent: 'pending', persistConsent: false });
    const tab = await openTab(context, '/pages/one.html');
    await expectSending(tab.page, false);
    await press(tab.page, 'Opt in');
    await expectSending(tab.page, true);
    await tab.page.reload();
    await expectSending(tab.page, false);
  });
});
