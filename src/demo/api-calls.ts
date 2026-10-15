// The app's own HTTP calls through `createTrackedFetch`, each showing one rule of network capture
// (Web Lifecycle 6, Web HTTP 3, Privacy 5c); the Android and iOS demos' ApiCall list in the
// browser's terms. The calls go to the fake backend's `/api/` paths under the API base of Settings
// (`localhost`), the SDK's own requests to its host (`127.0.0.1`), so the SDK's host is never captured.

export interface ApiCall {
  readonly id: string;
  readonly title: string;
  readonly expectation: string;
  /** Makes the call with `trackedFetch` and describes the outcome as the app sees it. */
  readonly run: (trackedFetch: typeof fetch, apiBase: string, sdkHost: string) => Promise<string>;
}

const trim = (base: string) => base.replace(/\/+$/, '');

export const API_CALLS: readonly ApiCall[] = [
  {
    id: 'orders',
    title: 'GET with ids and a token',
    expectation: 'Captured: path /api/users/:id/orders/:id, no query, no fragment, status_code 200',
    run: (f, base) =>
      outcome(f(`${trim(base)}/api/users/12345/orders/3f2a9c1e-0b1c-4d2e-8f3a-7b2d9c1e0b1c?token=secret#section`)),
  },
  {
    id: 'post-json',
    title: 'POST a JSON string',
    expectation: 'Captured, method POST; no request_bytes, since a string body is never measured',
    run: (f, base) =>
      outcome(
        f(`${trim(base)}/api/cart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"sku":"A1","quantity":2}',
        }),
      ),
  },
  {
    id: 'post-blob',
    title: 'POST a Blob',
    expectation: 'Captured with request_bytes 25 (Blob.size); the body itself is never read',
    run: (f, base) =>
      outcome(
        f(`${trim(base)}/api/cart`, {
          method: 'POST',
          body: new Blob(['{"sku":"A1","quantity":2}'], { type: 'application/json' }),
        }),
      ),
  },
  {
    id: 'request-object',
    title: 'PUT through a Request object',
    expectation: 'Captured, method PUT from the Request',
    run: (f, base) => outcome(f(new Request(`${trim(base)}/api/profile`, { method: 'PUT', body: 'x' }))),
  },
  {
    id: 'not-found',
    title: '404 answer',
    expectation: 'Captured with status_code 404; the call resolves, a 404 is not an error',
    run: (f, base) => outcome(f(`${trim(base)}/api/status/404`)),
  },
  {
    id: 'server-error',
    title: '500 answer',
    expectation: 'Captured with status_code 500',
    run: (f, base) => outcome(f(`${trim(base)}/api/status/500`)),
  },
  {
    id: 'timeout',
    title: 'Timeout (AbortSignal.timeout)',
    expectation: 'Captured with error timeout and no status_code; the call rejects with the same TimeoutError',
    run: (f, base) => outcome(f(`${trim(base)}/api/slow?ms=3000`, { signal: AbortSignal.timeout(1000) })),
  },
  {
    id: 'canceled',
    title: 'Canceled call (AbortController)',
    expectation: 'Captured with error canceled; the call rejects with the same AbortError',
    run: (f, base) => {
      const controller = new AbortController();
      setTimeout(() => {
        controller.abort();
      }, 300);
      return outcome(f(`${trim(base)}/api/slow?ms=3000`, { signal: controller.signal }));
    },
  },
  {
    id: 'refused',
    title: 'Connection refused',
    expectation: 'Captured with error network: nothing listens on localhost:65535',
    run: (f) => outcome(f('http://localhost:65535/api/ping')),
  },
  {
    id: 'reset-token',
    title: 'A token in the path',
    expectation: 'Captured; with the "Mask reset tokens" hook the path is /api/reset-password/:token',
    run: (f, base) => outcome(f(`${trim(base)}/api/reset-password/abc123xyz`)),
  },
  {
    id: 'relative',
    title: 'Relative URL',
    expectation: "Resolved against this page's address: captured with this host when it is in the hosts (404 here)",
    run: (f) => outcome(f('/api/ping')),
  },
  {
    id: 'other-host',
    title: 'A host not in the list',
    expectation: 'Passed through, never captured: unknown-host.invalid is not a captured host',
    run: (f) => outcome(f('http://unknown-host.invalid/api/ping')),
  },
  {
    id: 'sdk-host',
    title: "Call to the SDK's own host",
    expectation: 'Never captured, whatever the configured hosts',
    run: (f, _base, sdkHost) => outcome(f(`${trim(sdkHost)}/api/ping`)),
  },
];

async function outcome(call: Promise<Response>): Promise<string> {
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  try {
    const response = await call;
    const text = await response.text();
    return `HTTP ${response.status}, ${text.length} characters read by the app, ${ms()} ms`;
  } catch (error) {
    // The same error object the page's fetch gave; its name only.
    const name = error instanceof Error ? error.name : typeof error;
    return `Rejected with ${name} after ${ms()} ms`;
  }
}
