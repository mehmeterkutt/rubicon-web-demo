// Checklist rows 3 to 8: two tabs and two subdomains sharing identity, session and consent, an
// erasure seen by another tab, "forget me", identify and reset; every step a button of the demo.
import type { Page } from '@playwright/test';
import { HOST_B } from '../fixtures';
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
  showTab,
  shownDeviceId,
  test,
} from '../scenario';
import type { WireEvent } from '../scenario';

const HOLD = { flushAt: 100, flushIntervalMs: 600_000 };

const clickedOn = (page: string) => (e: WireEvent) => named('Button Clicked')(e) && e.properties?.['page'] === page;

/** The consent pill of the page's top bar: "sending" or "not sending", polled from `isOptedOut`. */
async function expectSending(page: Page, sending: boolean): Promise<void> {
  await expect(page.getByTestId('sdk-state')).toHaveText(sending ? 'sending' : 'not sending');
}

test.describe('row 3: two tabs', () => {
  test('a user identified in one tab is the user of the other; both share device and session', async ({
    context,
    backend,
  }) => {
    const first = await openTab(context, '/#identity');
    const deviceId = await shownDeviceId(first.page);
    await press(first.page, 'Identify');
    const identify = await arrival(backend, deviceId, (e) => e.type === 'identify', 'the identify event');
    expect(identify.user_id).toBe('user-42');
    // The default hook masks an email trait.
    expect(identify['traits']).toEqual({ plan: 'pro', email: '***' });

    const second = await openTab(context, '/#events');
    await shownDeviceId(second.page, deviceId);
    await press(second.page, 'Track');
    const click = await arrival(backend, deviceId, named('Button Clicked'), 'the click of the second tab');
    expect(click.user_id).toBe('user-42');
    expect(sessionOf(click)).toBe(sessionOf(identify));
  });
});

test.describe('row 4: two subdomains', () => {
  test('device, user and session carry over to the other subdomain; super properties stay per host', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/#identity');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'Identify');
    await press(tab.page, 'Register');
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    const onA = await arrival(backend, deviceId, named('Button Clicked'), 'the click on host a');
    expect(onA.properties).toEqual({ button: 'quick', plan: 'pro' });

    await tab.page.goto(
      tab.page
        .url()
        .replace(/^http:\/\/a\./, 'http://b.')
        .replace(/\/#.*$/, '/pages/other-host.html'),
    );
    await shownDeviceId(tab.page, deviceId);
    await press(tab.page, 'Track');
    const onB = await arrival(backend, deviceId, clickedOn('other-host'), 'the click on host b');
    expect(onB.user_id).toBe('user-42');
    expect(sessionOf(onB)).toBe(sessionOf(onA));
    expect(onB.properties).toEqual({ page: 'other-host' });
    expect(onB.context?.page?.url).toBe(`http://${HOST_B}:4173/pages/other-host.html`);
  });

  test('with identity.crossSubdomain off each subdomain is its own device', async ({ context, demo }) => {
    await demo.settings({ crossSubdomain: false });
    const onA = await openTab(context, '/pages/other-host.html');
    const deviceA = await shownDeviceId(onA.page);
    const onB = await openTab(context, '/pages/other-host.html', HOST_B);
    const deviceB = await shownDeviceId(onB.page);
    expect(deviceB).not.toBe(deviceA);
  });
});

test.describe('row 5: consent across tabs and subdomains', () => {
  test('an opt-out on one subdomain stops the other tab; an opt-in there resumes both', async ({
    context,
    backend,
  }) => {
    const onA = await openTab(context, '/pages/one.html');
    const deviceId = await shownDeviceId(onA.page);
    const onB = await openTab(context, '/pages/other-host.html', HOST_B);
    await shownDeviceId(onB.page, deviceId);
    await arrival(backend, deviceId, pageViewOf('/pages/other-host.html'), 'the view on host b');

    await press(onA.page, 'Opt out');
    await expectSending(onA.page, false);
    await expectSending(onB.page, false);
    await press(onB.page, 'Track');
    await press(onB.page, 'Flush');

    await press(onB.page, 'Opt in');
    await expectSending(onB.page, true);
    await expectSending(onA.page, true);
    await press(onA.page, 'Track');
    await arrival(backend, deviceId, clickedOn('one'), 'the click on host a after the opt-in');
    // Nothing of the opted-out period, and no event for the decisions themselves.
    const events = await backend.eventsOf(deviceId);
    expect(events.filter(clickedOn('other-host'))).toEqual([]);
    expect(events.filter(named('Session Ended'))).toEqual([]);
    expect(events.filter((e) => /opt/i.test(String(e.event ?? e.name)))).toEqual([]);
  });
});

test.describe('row 6: an erasure seen by another tab', () => {
  test("clearLocalData in one tab deletes the other tab's unsent events and renews deviceId there", async ({
    context,
    backend,
    demo,
  }) => {
    await demo.settings(HOLD);
    const writer = await openTab(context, '/#events');
    const oldId = await shownDeviceId(writer.page);
    await press(writer.page, 'Track');
    await press(writer.page, 'Track');
    await chunksStored(writer.page);

    const eraser = await openTab(context, '/#identity');
    await shownDeviceId(eraser.page, oldId);
    await press(eraser.page, 'Clear local data');
    await expect(eraser.page.getByTestId('device-id')).not.toHaveText(oldId);
    const newId = await shownDeviceId(eraser.page);
    // The other tab reads the identity cookie at every call and poll.
    await shownDeviceId(writer.page, newId);

    await press(writer.page, 'Screen');
    await press(writer.page, 'Flush');
    await arrival(backend, newId, named('checkout'), 'the screen after the erasure');
    expect(await backend.eventsOf(oldId)).toEqual([]);
    expect((await backend.eventsOf(newId)).filter(named('Button Clicked'))).toEqual([]);
  });
});

test.describe('row 7: forget me', () => {
  test('reads deviceId, opts out and clears: nothing is sent until an opt-in under a new id', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/#identity');
    const oldId = await shownDeviceId(tab.page);
    await arrival(backend, oldId, named('tab_identity'), 'the first events');
    await press(tab.page, 'Forget me');
    await expect(tab.page.getByTestId('status')).toContainText(`ask the backend to erase ${oldId}`);
    await expectSending(tab.page, false);
    await expect(tab.page.getByTestId('device-id')).not.toHaveText(oldId);
    // Only the decision is stored: the consent cookie, no identity cookie.
    await press(tab.page, 'Read again');
    const stored = tab.page.getByTestId('sdk-storage');
    await expect(stored).toContainText(/rubicon_[0-9a-f]{16}_c /);
    await expect(stored).not.toContainText(/cookie\s+rubicon_[0-9a-f]{16} /);

    await showTab(tab.page, 'events');
    await press(tab.page, 'Purchase');
    await press(tab.page, 'Flush');
    await showTab(tab.page, 'identity');
    await press(tab.page, 'Opt in');
    await expectSending(tab.page, true);
    const newId = await shownDeviceId(tab.page);
    expect(newId).not.toBe(oldId);
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    const after = await arrival(backend, newId, named('Button Clicked'), 'the click after the opt-in');
    expect(after.user_id).toBeNull();
    expect((await backend.events()).filter(named('Purchase Completed'))).toEqual([]);
    expect((await backend.eventsOf(oldId)).filter(named('tab_events'))).toEqual([]);
  });
});

test.describe('row 8: identify and reset', () => {
  test('reset ends the session with the old user; another id while identified starts a new user', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/#identity');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'Identify');
    const identified = await arrival(backend, deviceId, (e) => e.type === 'identify', 'identify user-42');
    // The same id again without traits: nothing.
    await press(tab.page, 'Without traits');

    await press(tab.page, 'Reset');
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    const ended = await arrival(backend, deviceId, named('Session Ended'), 'Session Ended at the reset');
    expect(ended.user_id).toBe('user-42');
    expect(sessionOf(ended)).toBe(sessionOf(identified));
    const anonymous = await arrival(backend, deviceId, named('Button Clicked'), 'the click after the reset');
    expect(anonymous.user_id).toBeNull();
    expect(sessionOf(anonymous)).not.toBe(sessionOf(identified));

    await showTab(tab.page, 'identity');
    await press(tab.page, 'Identify');
    await tab.page.getByTestId('user-id').fill('user-43');
    await press(tab.page, 'Identify');
    const identifies = await arrivals(backend, deviceId, (e) => e.type === 'identify', 'three identify events', 3);
    expect(identifies.map((e) => e.user_id)).toEqual(['user-42', 'user-42', 'user-43']);
    const ends = await arrivals(backend, deviceId, named('Session Ended'), 'Session Ended at the new user', 2);
    expect((ends[1] as WireEvent).user_id).toBe('user-42');
    expect(sessionOf(identifies[2] as WireEvent)).not.toBe(sessionOf(identifies[1] as WireEvent));
    // Blank and too long ids are ignored.
    await press(tab.page, 'Blank id');
    await press(tab.page, 'Id of 256 characters');
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    const last = await arrivals(backend, deviceId, named('Button Clicked'), 'the last click', 2);
    expect((last[1] as WireEvent).user_id).toBe('user-43');
  });
});
