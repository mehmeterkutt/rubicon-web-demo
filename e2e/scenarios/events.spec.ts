// Checklist rows 30 to 33: every button of the Events tab's value, rejection and limit cards, the
// hooks switched on in the Settings tab, and the developer errors and invalid configuration. A WARN
// of a code is written once per page and repeated at DEBUG (Web Logging 2), so the lines are matched
// at any level.
import type { Page } from '@playwright/test';
import { arrival, expect, named, openTab, press, showTab, shownDeviceId, test } from '../scenario';
import type { Lines, Tab, WireEvent } from '../scenario';
import type { Backend } from '../backend';

/** Presses the case `button` and returns the event `name` as it arrived. */
async function sent(tab: Tab, backend: Backend, deviceId: string, button: string, name: string): Promise<WireEvent> {
  await press(tab.page, button);
  return arrival(backend, deviceId, named(name), name);
}

function codes(lines: Lines, code: string): string[] {
  return lines.matching(new RegExp(`^${code}: `)).map((l) => l.text);
}

test.describe('row 30: accepted values', () => {
  test('every allowed type and values from another realm arrive converted, without a warning', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/#events');
    const deviceId = await shownDeviceId(tab.page);
    const all = await sent(tab, backend, deviceId, 'Track every allowed type', 'All Types');
    expect(all.properties).toEqual({
      string: 'text',
      int: 42,
      float: 1.1,
      beyond_safe: 9007199254740994,
      boolean: true,
      null: null,
      list_with_undefined: ['a', null, null, 'b'],
      bigint_safe: 9007199254740991,
      boxed_number: 5,
      boxed_string: 'boxed',
      boxed_boolean: true,
      date: '1970-01-01T00:00:00.000Z',
      date_year_9999: '9999-12-31T23:59:59.999Z',
      list: ['a', 1, null, [true]],
      set: ['x', 'y'],
      typed_array: [0.5, 1.5],
      map: { tier: 'gold', level: 3 },
      plain_object: { level1: { level2: { level3: 'deepest allowed' } } },
      null_prototype: { kind: 'no prototype' },
      url: 'https://example.com/a?b=1#c',
      unicode: 'ğüşİıöç 日本 😀',
    });
    const realm = await sent(tab, backend, deviceId, "Values from an iframe's realm", 'Other Realm');
    expect(realm.properties).toEqual({
      object: {},
      filled: { a: 1, b: [1, 2] },
      array: [1, 2, 3],
      date: '1970-01-01T00:00:00.000Z',
      map: { k: 'v' },
    });
    const copied = await sent(tab, backend, deviceId, 'Change the object after track', 'Copied Object');
    expect(copied.properties).toEqual({ state: 'before', list: ['before'] });
    expect(tab.lines.all.filter((l) => l.type === 'warning' && !l.text.startsWith('CLEARTEXT_HOST'))).toEqual([]);
  });
});

test.describe('row 31: rejected values and limits', () => {
  test('a refused value drops its key only, named by key and type, never by value', async ({ context, backend }) => {
    const tab = await openTab(context, '/#events');
    const deviceId = await shownDeviceId(tab.page);
    expect((await sent(tab, backend, deviceId, 'Numbers the JSON cannot hold', 'Bad Numbers')).properties).toEqual({
      kept: 'stays',
    });
    expect((await sent(tab, backend, deviceId, 'Dates the SDK refuses', 'Bad Dates')).properties).toEqual({
      kept: 'stays',
    });
    expect((await sent(tab, backend, deviceId, 'Objects the SDK never converts', 'Bad Objects')).properties).toEqual({
      to_json: {},
      kept: 'stays',
    });
    expect(
      (await sent(tab, backend, deviceId, 'A getter and a Proxy that throw', 'Throwing Values')).properties,
    ).toEqual({ getter: { fine: 1 }, kept: 'stays' });
    expect((await sent(tab, backend, deviceId, 'A Map with a number key', 'Bad Map')).properties).toEqual({
      map: {},
      kept: 'stays',
    });
    expect(
      (await sent(tab, backend, deviceId, 'Properties that are not an object', 'Array Properties')).properties,
    ).toEqual({});

    const dropped = codes(tab.lines, 'PROPERTY_DROPPED');
    for (const key of ['nan', 'infinity', 'big', 'invalid', 'year_10000', 'class_instance', 'error', 'regexp']) {
      expect(dropped.some((text) => text.includes(`"${key}"`))).toBe(true);
    }
    for (const type of ['Product', 'Promise', 'Symbol', 'ArrayBuffer', 'DataView', 'Blob', 'HTMLBodyElement']) {
      expect(dropped.some((text) => text.toLowerCase().includes(`${type.toLowerCase()} is not supported`))).toBe(true);
    }
    expect(
      dropped.some(
        (t) => t.includes('"moment_like"') && t.includes('Pass a Date, epoch milliseconds or an ISO string'),
      ),
    ).toBe(true);
    expect(dropped.some((t) => t.includes('"getter.broken"') && t.includes('threw'))).toBe(true);
    expect(dropped.some((t) => t.startsWith('PROPERTY_DROPPED: Properties dropped: Array'))).toBe(true);
    // Never a value, never the caught error's text.
    expect(tab.lines.all.some((l) => /never sent|getter failed|proxy failed|A-1/.test(l.text))).toBe(false);
    // The first of a code is a WARN, the rest DEBUG (once per page).
    expect(tab.lines.matching(/^PROPERTY_DROPPED: /).filter((l) => l.type === 'warning')).toHaveLength(1);
  });

  test('names, keys, depth, long strings, many properties, size and lone surrogates', async ({ context, backend }) => {
    const tab = await openTab(context, '/#events');
    const deviceId = await shownDeviceId(tab.page);
    expect((await sent(tab, backend, deviceId, 'Bad keys', 'Bad Keys')).properties).toEqual({
      'a�b': 4,
      kept: true,
    });
    expect((await sent(tab, backend, deviceId, 'Nesting deeper than 3', 'Too Deep')).properties).toEqual({
      a: { b: { c: {} } },
    });
    const text = String(
      (await sent(tab, backend, deviceId, 'A string over 1024 characters', 'Long Text')).properties?.['text'],
    );
    // 1024 would cut a surrogate pair in two: 1023 code units, no marker.
    expect(text).toHaveLength(1023);
    expect(text.endsWith('😀')).toBe(true);
    const many = await sent(tab, backend, deviceId, '300 properties', 'Many Properties');
    expect(Object.keys(many.properties ?? {})).toHaveLength(256);
    expect((await sent(tab, backend, deviceId, 'An unpaired surrogate', 'Broken � Text')).properties).toEqual({
      text: 'a�b',
    });
    for (const button of ['A name of 256 characters', 'An empty name', 'A name of spaces', 'An event over 32 KB']) {
      await press(tab.page, button);
    }
    await press(tab.page, 'Track');
    await arrival(backend, deviceId, named('Button Clicked'), 'a click after the dropped events');

    expect(
      codes(tab.lines, 'PROPERTY_DROPPED').filter((t) => t.includes('256 characters') || t.includes('blank')),
    ).toHaveLength(3);
    expect(codes(tab.lines, 'PROPERTY_DROPPED').some((t) => t.includes('"a.b.c.d"'))).toBe(true);
    expect(codes(tab.lines, 'PROPERTY_TRUNCATED')).toEqual([
      'PROPERTY_TRUNCATED: Property "text" truncated to 1024 characters.',
    ]);
    expect(codes(tab.lines, 'TOO_MANY_PROPERTIES')[0]).toContain('44 properties dropped');
    expect(codes(tab.lines, 'INVALID_EVENT_NAME')).toHaveLength(3);
    expect(codes(tab.lines, 'EVENT_OVERSIZE')).toHaveLength(1);
    const names = (await backend.eventsOf(deviceId)).map((e) => String(e.event ?? e.name));
    expect(names.filter((n) => n === '' || n.trim() === '' || n.length > 255 || n === 'Huge Event')).toEqual([]);
    // The observer reports the oversize drop (Logs tab).
    await showTab(tab.page, 'logs');
    await expect(tab.page.getByText('oversize 1')).toBeVisible();
  });
});

/** Switches the hooks named on in the Settings tab and saves, as a person does. */
async function switchOnHooks(page: Page, titles: readonly string[]): Promise<void> {
  await showTab(page, 'settings');
  for (const title of titles) await page.getByLabel(title).check();
  await page.getByTestId('save-settings').click();
  await expect(page.getByTestId('body-settings')).toBeVisible();
}

test.describe('row 32: beforeSend hooks', () => {
  test('drop, mask, tag; a throw, a Promise and a renamed automatic event are refused', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/#settings');
    await shownDeviceId(tab.page);
    await switchOnHooks(tab.page, [
      'Tag app events',
      'Throw on "Hook Test"',
      'Async hook on "Async Hook Test"',
      'Rename Page Viewed',
    ]);
    const deviceId = await shownDeviceId(tab.page);
    await showTab(tab.page, 'events');
    await press(tab.page, 'Debug Event');
    await press(tab.page, 'Hook Test');
    await press(tab.page, 'Async Hook Test');
    const email = await sent(tab, backend, deviceId, 'Event with email', 'Signed Up');
    expect(email.properties).toEqual({ email: '***', plan: 'pro', hooked: true });

    const threw = await tab.lines.waitFor(/^HOOK_THREW: /);
    expect(threw.type).toBe('error');
    expect(threw.text).not.toContain('A hook failed on purpose');
    const violation = await tab.lines.waitFor(/^HOOK_VIOLATION: /);
    expect(violation.type).toBe('error');
    await tab.lines.waitFor(/^A beforeSend hook dropped /);
    const names = (await backend.eventsOf(deviceId)).map((e) => String(e.event ?? e.name));
    expect(names).not.toContain('Debug Event');
    expect(names).not.toContain('Hook Test');
    expect(names).not.toContain('Async Hook Test');
    expect(names).not.toContain('Page Opened');
    // Only the view of the load before the hooks were saved; the reload's is refused.
    expect((await backend.eventsOf(deviceId)).filter(named('Page Viewed'))).toHaveLength(1);
    // Automatic events are untouched by the app-only tagging; the page goes on.
    const started = await arrival(backend, deviceId, named('Session Started'), 'Session Started');
    expect(started.properties).toEqual({});
    await press(tab.page, 'Track');
    const click = await arrival(backend, deviceId, named('Button Clicked'), 'a later click');
    expect(click.properties).toEqual({ button: 'quick', hooked: true });
  });
});

test.describe('row 33: developer errors and invalid configuration', () => {
  test('the Events tab: a second createAnalytics, a blank user id, a function registered', async ({
    context,
    backend,
  }) => {
    const tab = await openTab(context, '/#events');
    const deviceId = await shownDeviceId(tab.page);
    await press(tab.page, 'A second createAnalytics');
    await press(tab.page, 'identify with a blank id');
    await press(tab.page, 'register with a function');
    await press(tab.page, 'Track');
    const click = await arrival(backend, deviceId, named('Button Clicked'), 'a click after the mistakes');
    expect(click.user_id).toBeNull();
    expect(click.properties).toEqual({ button: 'quick' });
    expect(codes(tab.lines, 'SECOND_INSTANCE')[0]).toMatch(/SDK \d+\.\d+\.\d+.*SDK \d+\.\d+\.\d+/);
    expect(codes(tab.lines, 'INVALID_USER_ID')).toHaveLength(1);
    expect(codes(tab.lines, 'PROPERTY_DROPPED').some((t) => t.includes('"callback"'))).toBe(true);
    await expect(tab.page.getByTestId('status')).not.toContainText('threw');
  });

  test('settings out of bounds, of the wrong type, of another platform, reserved or invalid: warned, defaults used', async ({
    context,
    backend,
    demo,
  }) => {
    await demo.settings({
      flushAt: 500,
      headers: { 'Content-Type': 'text/plain' },
      cookieDomain: 'example.com',
      captureHosts: ['http://localhost'],
      extraConfig: '{"flush": {"intervalMs": "ten"}, "session": {"backgroundTimeoutMs": 10000}}',
    });
    const tab = await openTab(context, '/#events');
    const deviceId = await shownDeviceId(tab.page);
    for (const code of [
      'SETTING_OUT_OF_BOUNDS',
      'SETTING_WRONG_TYPE',
      'SETTING_NOT_SUPPORTED',
      'RESERVED_HEADER',
      'INVALID_COOKIE_DOMAIN',
      'INVALID_CAPTURE_HOST',
    ]) {
      await tab.lines.waitFor(new RegExp(`^${code}: `));
    }
    await press(tab.page, 'Flush');
    await arrival(backend, deviceId, named('tab_events'), 'the events of the page that still works');
  });

  test('a blank API key or an invalid host gives an instance that does nothing', async ({ context, demo }) => {
    await demo.settings({ apiKey: '' });
    const blank = await openTab(context, '/#events');
    await expect(blank.page.getByTestId('device-id')).toHaveText('SDK disabled');
    expect((await blank.lines.waitFor(/^INVALID_API_KEY: /)).type).toBe('error');
    await press(blank.page, 'Track');
    await expect(blank.page.getByTestId('status')).toHaveText('Tracked Button Clicked');

    await demo.settings({ host: 'not a url' });
    const invalid = await openTab(context, '/#events');
    await expect(invalid.page.getByTestId('device-id')).toHaveText('SDK disabled');
    expect((await invalid.lines.waitFor(/^INVALID_HOST: /)).type).toBe('error');
  });
});
