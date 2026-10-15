// Checklist rows 11 to 15: the server's answers scripted from the Server tab (429, 503, 401, CORS
// left off) and the network going away; long waits run on Playwright's clock, installed before the
// first page and moved with fastForward, which fires the SDK's timers that fall due.
import type { Page } from '@playwright/test';
import { arrival, arrivals, expect, named, openTab, press, showTab, shownDeviceId, test } from '../scenario';
import type { Lines } from '../scenario';

/** Sets the Server tab's batch answer and applies it, as a person does. */
async function answerWith(page: Page, options: { status?: number; retryAfter?: string; corsOff?: boolean }) {
  await showTab(page, 'server');
  if (options.status !== undefined) await press(page, String(options.status));
  if (options.retryAfter !== undefined) await page.getByLabel('Retry-After (seconds)').fill(options.retryAfter);
  if (options.corsOff === true) await page.getByLabel('Leave the CORS headers off').check();
  await press(page, 'Apply');
  await expect(page.getByTestId('status')).toContainText('The server now answers');
}

async function resetServer(page: Page): Promise<void> {
  await showTab(page, 'server');
  await press(page, 'Reset to 200');
  await expect(page.getByTestId('status')).toContainText('The server answers 200 again');
}

/** The wait of `Uploads wait (<reason>) for <ms> ms`, once the page logged one after `from` lines. */
async function waitLogged(lines: Lines, reason: string, from = 0): Promise<number> {
  const pattern = new RegExp(`^Uploads wait \\(${reason}\\) for (\\d+) ms$`);
  await expect.poll(() => lines.all.slice(from).some((l) => pattern.test(l.text))).toBe(true);
  const line = lines.all.slice(from).find((l) => pattern.test(l.text));
  return Number(pattern.exec(line?.text ?? '')?.[1]);
}

test.describe('row 11: a 429 seen by one tab', () => {
  test('pauses the other tab and the next page load as asked, then both send', async ({ context, backend }) => {
    await context.clock.install();
    const first = await openTab(context, '/#server');
    const deviceId = await shownDeviceId(first.page);
    await arrival(backend, deviceId, named('tab_server'), 'the first events');
    await answerWith(first.page, { status: 429, retryAfter: '120' });
    await showTab(first.page, 'events');
    const paused = await first.lines.waitFor(/^The server asked to slow down; uploads pause for (\d+) ms$/);
    const pause = Number(/(\d+) ms$/.exec(paused.text)?.[1]);
    expect(pause).toBeGreaterThanOrEqual(120_000);
    expect(pause).toBeLessThanOrEqual(132_000);
    await resetServer(first.page);

    const second = await openTab(context, '/#events');
    await press(second.page, 'Track');
    await waitLogged(second.lines, 'throttle');
    const before = second.lines.all.length;
    await second.page.reload();
    await waitLogged(second.lines, 'throttle', before);
    expect((await backend.eventsOf(deviceId)).filter(named('Button Clicked'))).toEqual([]);

    await second.page.clock.fastForward('02:15');
    await press(second.page, 'Flush');
    await arrival(backend, deviceId, named('Button Clicked'), 'the click held by the pause');
    await arrival(backend, deviceId, named('tab_events'), 'the screen refused with 429');
  });
});

test.describe('row 12: 503', () => {
  test('with Retry-After 30 the retry comes by itself 30 seconds later', async ({ context, backend }) => {
    await context.clock.install();
    const tab = await openTab(context, '/#server');
    const deviceId = await shownDeviceId(tab.page);
    await arrival(backend, deviceId, named('tab_server'), 'the first events');
    await answerWith(tab.page, { status: 503, retryAfter: '30' });
    await showTab(tab.page, 'events');
    const paused = await tab.lines.waitFor(/^The server asked to slow down; uploads pause for (\d+) ms$/);
    expect(Number(/(\d+) ms$/.exec(paused.text)?.[1])).toBeGreaterThanOrEqual(30_000);
    await resetServer(tab.page);
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    await waitLogged(tab.lines, 'throttle');
    await tab.page.clock.fastForward('00:20');
    expect((await backend.eventsOf(deviceId)).filter(named('Button Clicked'))).toEqual([]);
    // No button: the timer that ends the pause sends.
    await tab.page.clock.fastForward('00:15');
    await arrival(backend, deviceId, named('Button Clicked'), 'the click after the pause');
    await arrival(backend, deviceId, named('tab_events'), 'the screen refused with 503');
  });

  test('without Retry-After it backs off about 2 seconds and tries again', async ({ context, backend }) => {
    const tab = await openTab(context, '/#server');
    const deviceId = await shownDeviceId(tab.page);
    await arrival(backend, deviceId, named('tab_server'), 'the first events');
    await answerWith(tab.page, { status: 503, retryAfter: '' });
    await showTab(tab.page, 'events');
    const failed = await tab.lines.waitFor(/^Upload failed \(http_503\); waiting (\d+) ms$/);
    const wait = Number(/waiting (\d+) ms$/.exec(failed.text)?.[1]);
    expect(wait).toBeGreaterThanOrEqual(1_000);
    expect(wait).toBeLessThanOrEqual(3_000);
    await resetServer(tab.page);
    await arrival(backend, deviceId, named('tab_events'), 'the screen after the backoff');
  });
});

test.describe('row 13: 401', () => {
  test('one ERROR, then an hour of pause for every page, which clearLocalData does not end', async ({
    context,
    backend,
  }) => {
    await context.clock.install();
    const tab = await openTab(context, '/#server');
    const deviceId = await shownDeviceId(tab.page);
    await arrival(backend, deviceId, named('tab_server'), 'the first events');
    await answerWith(tab.page, { status: 401 });
    await showTab(tab.page, 'events');
    const error = await tab.lines.waitFor(/^UPLOAD_UNAUTHORIZED: /);
    expect(error.type).toBe('error');
    await resetServer(tab.page);
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    const wait = await waitLogged(tab.lines, 'config');
    expect(wait).toBeGreaterThan(40 * 60_000);
    expect(wait).toBeLessThanOrEqual(72 * 60_000);

    let from = tab.lines.all.length;
    await tab.page.reload();
    await press(tab.page, 'Flush');
    await waitLogged(tab.lines, 'config', from);
    from = tab.lines.all.length;
    await showTab(tab.page, 'identity');
    await press(tab.page, 'Clear local data');
    await expect(tab.page.getByTestId('device-id')).not.toHaveText(deviceId);
    const newId = await shownDeviceId(tab.page);
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    await waitLogged(tab.lines, 'config', from);
    expect(await backend.eventsOf(newId)).toEqual([]);

    await tab.page.clock.fastForward('01:13:00');
    await press(tab.page, 'Flush');
    await arrival(backend, newId, named('Button Clicked'), 'the click after the hour');
    expect(tab.lines.matching(/^UPLOAD_UNAUTHORIZED: /)).toHaveLength(1);
  });
});

test.describe('row 14: offline and online', () => {
  test('nothing is sent offline and nothing is lost; going online sends all 50 in order', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/#events');
    const deviceId = await shownDeviceId(tab.page);
    await arrival(backend, deviceId, named('tab_events'), 'the first events');
    await context.setOffline(true);
    await press(tab.page, 'Burst 50');
    await tab.lines.waitFor(/^Offline; the upload waits for the network$/);
    expect((await backend.eventsOf(deviceId)).filter(named('Burst Event'))).toEqual([]);

    await context.setOffline(false);
    const burst = await arrivals(backend, deviceId, named('Burst Event'), 'the burst after going online', 50);
    expect(burst.map((e) => e.properties?.['index'])).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(tab.lines.matching(/^Upload failed/)).toEqual([]);
  });
});

test.describe('row 15: a backend that leaves out CORS', () => {
  test('the browser hides the answer: UPLOAD_FAILED_OPAQUE once, a retry, nothing lost', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/#server');
    const deviceId = await shownDeviceId(tab.page);
    await arrival(backend, deviceId, named('tab_server'), 'the first events');
    await answerWith(tab.page, { corsOff: true });
    await showTab(tab.page, 'events');
    const warn = await tab.lines.waitFor(/^UPLOAD_FAILED_OPAQUE: /);
    expect(warn.type).toBe('warning');
    await tab.lines.waitFor(/^Upload failed \(io\); waiting \d+ ms$/);
    await resetServer(tab.page);
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    await arrival(backend, deviceId, named('Button Clicked'), 'the click after CORS is back');
    await tab.lines.waitFor(/^Uploaded \d+ events$/);
    expect(tab.lines.matching(/^UPLOAD_FAILED_OPAQUE: /).filter((l) => l.type === 'warning')).toHaveLength(1);
  });
});
