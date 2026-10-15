// What the scenario specs (e2e/scenarios/) share: the worker's own fake backend (backend.ts), the
// demo's settings pointed at it, the SDK's log lines as the page's console shows them, and the steps
// a person takes in the app (open a page, a tab, press a button). The scenarios drive the demo's own
// pages and buttons; they call the SDK directly only where the app has no control (none so far) and
// read the browser's storage only to observe. Rows of docs/manual-checklist.md name their test.
import type { BrowserContext, Page } from '@playwright/test';
import { Backend } from './backend';
import { appUrl, expect, SITE, test as base } from './fixtures';
import type { WireEvent } from './fixtures';

export { expect };
export type { WireEvent };

/** The demo's settings a scenario may change (src/demo/settings.ts), saved as the Settings tab does. */
export type Settings = Record<string, unknown>;

export interface Demo {
  /**
   * Saves the demo's settings for both subdomains: the worker's backend as the SDK's host and the
   * app's API base, an upload at every event unless `flushAt` says otherwise, then `settings`.
   * Applies to the pages loaded afterwards, as saving in the Settings tab does.
   */
  settings(settings?: Settings): Promise<void>;
}

export const test = base.extend<{ demo: Demo }, { backend: Backend }>({
  backend: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern.
    async ({}, use) => {
      const backend = await Backend.start();
      await use(backend);
      await backend.stop();
    },
    { scope: 'worker' },
  ],
  demo: [
    // After `fastUploads`, whose settings cookie (the shared backend) this one replaces.
    async ({ context, backend, fastUploads }, use) => {
      // eslint-disable-next-line @typescript-eslint/no-meaningless-void-operator -- named for the order only.
      void fastUploads;
      await backend.reset();
      const demo: Demo = {
        settings: (settings = {}) =>
          writeSettings(context, { host: backend.origin, apiBase: backend.apiBase, flushAt: 1, ...settings }),
      };
      await demo.settings();
      await use(demo);
    },
    { auto: true },
  ],
});

async function writeSettings(context: BrowserContext, settings: Settings): Promise<void> {
  await context.addCookies([
    {
      name: 'demo_settings',
      value: encodeURIComponent(JSON.stringify(settings)),
      domain: `.${SITE}`,
      path: '/',
      sameSite: 'Lax',
    },
  ]);
}

/** One line the SDK wrote, through the demo's logger or its own console sink. */
export interface Line {
  readonly type: string;
  readonly text: string;
}

const PREFIX = '[Rubicon] ';

/**
 * The SDK's lines of one page, as its console shows them: the demo's logger mirrors every line to
 * the console with the prefix of the SDK's own sink, so both read the same here. Attached before the
 * page loads, kept across its reloads and navigations.
 */
export class Lines {
  readonly all: Line[] = [];

  constructor(page: Page) {
    page.on('console', (message) => {
      const text = message.text();
      const at = text.indexOf(PREFIX);
      if (at >= 0) {
        this.all.push({ type: message.type(), text: text.slice(at + PREFIX.length) });
        return;
      }
      // A developer error with debug on is `console.error(new Error(...))`, whose text Firefox gives
      // as "Error" alone: the message is read from the Error itself.
      if (message.type() !== 'error' || message.args().length !== 1) return;
      void message
        .args()[0]
        ?.evaluate((value) => (value instanceof Error ? value.message : ''))
        .then((error) => {
          if (error.startsWith(PREFIX)) this.all.push({ type: 'error', text: error.slice(PREFIX.length) });
        })
        .catch(() => undefined);
    });
  }

  matching(pattern: RegExp): Line[] {
    return this.all.filter((line) => pattern.test(line.text));
  }

  async waitFor(pattern: RegExp, timeout = 15_000): Promise<Line> {
    await expect
      .poll(() => this.matching(pattern).length, { message: `an SDK line matching ${String(pattern)}`, timeout })
      .toBeGreaterThan(0);
    return this.matching(pattern)[0] as Line;
  }
}

/** A tab of the scenario: its page, its SDK lines and its deviceId. */
export interface Tab {
  readonly page: Page;
  readonly lines: Lines;
}

/** Opens `path` on `host` in a new page of `context` (or in `page`), watching its SDK lines. */
export async function openTab(context: BrowserContext, path: string, host?: string, page?: Page): Promise<Tab> {
  const target = page ?? (await context.newPage());
  const lines = new Lines(target);
  await target.goto(appUrl(path, host));
  return { page: target, lines };
}

/** The deviceId the page's top bar shows, waiting until it is `expected` when given. */
export async function shownDeviceId(page: Page, expected?: string): Promise<string> {
  const locator = page.getByTestId('device-id');
  await expect(locator).toHaveText(expected ?? /^[0-9a-f-]{36}$/, { timeout: 10_000 });
  return (await locator.textContent()) ?? '';
}

/** Presses the button named `name` (its whole text). */
export async function press(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
}

/** Shows the main page's tab `name` by its link, as a person does. */
export async function showTab(page: Page, name: string): Promise<void> {
  await page.getByTestId(`tab-${name}`).click();
  await expect(page.getByTestId(`body-${name}`)).toBeVisible();
}

export const named = (name: string) => (e: WireEvent) => e.event === name || e.name === name;

export const pageViewOf = (path: string) => (e: WireEvent) =>
  e.event === 'Page Viewed' && (e.context?.page?.url ?? '').endsWith(path);

/** Waits until the backend holds at least `count` events of `deviceId` that `match` accepts. */
export async function arrivals(
  backend: Backend,
  deviceId: string,
  match: (e: WireEvent) => boolean,
  what: string,
  count = 1,
  timeout = 15_000,
): Promise<WireEvent[]> {
  let found: WireEvent[] = [];
  await expect
    .poll(
      async () => {
        found = (await backend.eventsOf(deviceId)).filter(match);
        return found.length;
      },
      { message: `${what} for ${deviceId} at the fake backend`, timeout },
    )
    .toBeGreaterThanOrEqual(count);
  return found;
}

/** The first event of `deviceId` that `match` accepts, once it arrived. */
export async function arrival(
  backend: Backend,
  deviceId: string,
  match: (e: WireEvent) => boolean,
  what: string,
  timeout = 15_000,
): Promise<WireEvent> {
  return (await arrivals(backend, deviceId, match, what, 1, timeout))[0] as WireEvent;
}

/** The session id an event carries. */
export function sessionOf(event: WireEvent): string | undefined {
  const context = event['context'] as { session?: { id?: string } } | undefined;
  return context?.session?.id;
}

/**
 * The engine's `visibilitychange` with `document.visibilityState` replaced: Playwright never hides a
 * page (SDK plan section 15, step 7.4), so a hidden page is simulated as in the SDK's own tests; real
 * hiding is the checklist's.
 */
export async function setVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((visibility) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibility === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/** The SDK's `localStorage` keys on the page's origin whose name contains `infix` (observation only). */
export function storedKeys(page: Page, infix: string): Promise<string[]> {
  return page.evaluate((part) => Object.keys(localStorage).filter((key) => key.includes(part)), infix);
}

/** The events the page's origin holds in stored chunks, from the chunk keys (`...<count>.<chars>`). */
export async function storedEvents(page: Page): Promise<number> {
  const keys = await storedKeys(page, '.q1.');
  return keys.reduce((sum, key) => sum + Number(key.split('.').at(-2)), 0);
}

/** Waits until the page's origin holds at least one stored event chunk. */
export async function chunksStored(page: Page): Promise<void> {
  await expect.poll(async () => (await storedKeys(page, '.q1.')).length).toBeGreaterThan(0);
}
