// What every spec imports instead of `@playwright/test`: the pages' addresses on the names of D15,
// the fake backend's events, the demo's settings cookie, and in WebKit the proxy of proxy.ts.
// Each test has its own browser context (Playwright's default), so its own deviceId; a spec finds
// its events on the shared fake backend by that id.
import { test as base, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { startProxy } from './proxy';
import type { Proxy } from './proxy';

export { expect };

export const APP_PORT = 4173;
export const BACKEND = 'http://127.0.0.1:8080';
export const HOST_A = 'a.rubicon.test';
export const HOST_B = 'b.rubicon.test';
export const SITE = 'rubicon.test';

export function appUrl(path: string, host = HOST_A): string {
  return `http://${host}:${APP_PORT}${path}`;
}

export type WireEvent = Record<string, unknown> & {
  readonly type: string;
  readonly device_id: string;
  readonly event?: string;
  readonly name?: string;
  readonly properties?: Record<string, unknown>;
  readonly context?: { readonly page?: { readonly url?: string } };
};

/** Every event the fake backend stored for `deviceId`. */
export async function eventsOf(deviceId: string): Promise<WireEvent[]> {
  const response = await fetch(`${BACKEND}/events`);
  const items = (await response.json()) as { index: number; event: WireEvent }[];
  return items.map((i) => i.event).filter((e) => e.device_id === deviceId);
}

/** Waits until the fake backend holds an event of `deviceId` that `match` accepts, and returns it. */
export async function arrival(deviceId: string, match: (e: WireEvent) => boolean, what: string): Promise<WireEvent> {
  let found: WireEvent | undefined;
  await expect
    .poll(
      async () => {
        found = (await eventsOf(deviceId)).find(match);
        return found !== undefined;
      },
      { message: `${what} for ${deviceId} at the fake backend`, timeout: 15_000 },
    )
    .toBe(true);
  return found as WireEvent;
}

export const named = (name: string) => (e: WireEvent) => e.event === name || e.name === name;

/** The deviceId the page's top bar shows, once the SDK is there. */
export async function deviceIdOf(page: Page): Promise<string> {
  const locator = page.getByTestId('device-id');
  await expect(locator).toHaveText(/^[0-9a-f-]{36}$/, { timeout: 10_000 });
  return (await locator.textContent()) ?? '';
}

/**
 * Saves demo settings for both subdomains, as the Settings tab does: uploads at every event, so a
 * test sees its event without waiting for the interval.
 */
export async function useSettings(context: BrowserContext, settings: Record<string, unknown>): Promise<void> {
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

export const test = base.extend<{ fastUploads: undefined }, { webkitProxy: Proxy | undefined }>({
  webkitProxy: [
    async ({ browserName }, use) => {
      if (browserName !== 'webkit') {
        await use(undefined);
        return;
      }
      const proxy = await startProxy();
      await use(proxy);
      await proxy.close();
    },
    { scope: 'worker' },
  ],
  proxy: async ({ proxy, webkitProxy }, use) => {
    await use(webkitProxy === undefined ? proxy : { server: webkitProxy.origin });
  },
  fastUploads: [
    async ({ context }, use) => {
      await useSettings(context, { flushAt: 1 });
      await use(undefined);
      // A page left open uploads from its pagehide handler when the context closes; offline first,
      // so nothing of this test reaches the server during the next one (the SDK's fixtures do so).
      await context.setOffline(true).catch(() => undefined);
    },
    { auto: true },
  ],
});
