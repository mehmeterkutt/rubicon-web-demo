// Checklist rows 34 and 35: the browser's console at each log level with the demo's logger off (the
// SDK's own console sink), debug on and off, and a logger and an observer that throw.
import type { LogLevel } from 'rubicon-analytics';
import { arrival, expect, named, openTab, press, showTab, shownDeviceId, test } from '../scenario';
import type { Line } from '../scenario';

/** The console methods the sink uses per level (debug lines go to console.log). */
const TYPES: Record<Exclude<LogLevel, 'off'>, string> = { debug: 'log', info: 'info', warn: 'warning', error: 'error' };
const ORDER: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'off'];

function typesOf(lines: readonly Line[]): string[] {
  return [...new Set(lines.map((l) => l.type))].sort();
}

test.describe('row 34: the console at each level', () => {
  for (const level of ORDER) {
    test(`logging.level ${level}: only its level and above, developer errors included`, async ({
      context,
      backend,
      demo,
    }) => {
      await demo.settings({ inAppLogger: false, logLevel: level });
      const tab = await openTab(context, '/#events');
      const deviceId = await shownDeviceId(tab.page);
      await press(tab.page, 'identify with a blank id');
      await press(tab.page, 'A second createAnalytics');
      await press(tab.page, 'Track');
      await arrival(backend, deviceId, named('Button Clicked'), 'a click');
      const expected = ORDER.slice(ORDER.indexOf(level))
        .filter((l): l is Exclude<LogLevel, 'off'> => l !== 'off')
        .map((l) => TYPES[l])
        .sort();
      if (level !== 'off') {
        // The page's first line comes at a level each run: the host's CLEARTEXT_HOST WARN, the
        // blank id's INVALID_USER_ID WARN and SECOND_INSTANCE's ERROR, the INFO of the host.
        await tab.lines.waitFor(/^SECOND_INSTANCE: /);
      }
      expect(typesOf(tab.lines.all)).toEqual(expected);
      if (level === 'warn' || level === 'info' || level === 'debug') {
        expect(tab.lines.matching(/^INVALID_USER_ID: /)[0]?.type).toBe('warning');
      }
    });
  }

  test('debug on: developer errors become console.error(new Error(...)); others keep their level', async ({
    context,
    backend,
    demo,
  }) => {
    await demo.settings({ inAppLogger: false, logLevel: 'warn', debug: true });
    const tab = await openTab(context, '/#events');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'identify with a blank id');
    await press(tab.page, 'Track');
    await arrival(backend, deviceId, named('Button Clicked'), 'a click: debug never throws into the page');
    const invalid = await tab.lines.waitFor(/^INVALID_USER_ID: /);
    expect(invalid.type).toBe('error');
    expect(tab.lines.matching(/^CLEARTEXT_HOST: /)[0]?.type).toBe('warning');
    await expect(tab.page.getByTestId('status')).toHaveText('Tracked Button Clicked');
  });

  test('debug on and logging off: nothing at all', async ({ context, backend, demo }) => {
    await demo.settings({ inAppLogger: false, logLevel: 'off', debug: true });
    const tab = await openTab(context, '/#events');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'identify with a blank id');
    await press(tab.page, 'A second createAnalytics');
    await press(tab.page, 'Track');
    await arrival(backend, deviceId, named('Button Clicked'), 'a click');
    expect(tab.lines.all).toEqual([]);
  });
});

test.describe('row 35: a logger and an observer that throw', () => {
  test('the observer is switched off with OBSERVER_THREW; the logger falls back to the console', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/#logs');
    const deviceId = await shownDeviceId(tab.page);
    await expect(tab.page.getByTestId('count-queued')).not.toHaveText('0');
    await press(tab.page, 'Observer throws next');
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    const threw = await tab.lines.waitFor(/^OBSERVER_THREW: /);
    expect(threw.type).toBe('error');
    await showTab(tab.page, 'logs');
    const queued = await tab.page.getByTestId('count-queued').textContent();
    await showTab(tab.page, 'events');
    await press(tab.page, 'Purchase');
    await arrival(backend, deviceId, named('Purchase Completed'), 'the purchase after the observer failed');
    await showTab(tab.page, 'logs');
    await expect(tab.page.getByTestId('count-queued')).toHaveText(queued ?? '');

    await press(tab.page, 'Logger throws next');
    await showTab(tab.page, 'events');
    await press(tab.page, 'Track');
    const fallback = await tab.lines.waitFor(/^LOGGER_THREW: /);
    expect(fallback.type).toBe('warning');
    await press(tab.page, 'Flush');
    // The rest of this page's lines come from the SDK's own console sink.
    const at = tab.lines.all.indexOf(fallback);
    await expect.poll(() => tab.lines.all.slice(at + 1).some((l) => /^Flush \(flush\)$/.test(l.text))).toBe(true);
    await expect(tab.page.getByTestId('status')).not.toContainText('threw');
  });
});
