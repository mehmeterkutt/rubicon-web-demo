// The fake backend's own endpoints (fake-server/server.py), called with the page's plain `fetch`,
// never through `createTrackedFetch`: the SDK's requests are what is being tried, these only steer
// and read the server. Its base is the SDK's host, so the Server tab shows the server the SDK uses.

/** An event as the fake backend stored it, with its index in arrival order. */
export interface ServerEvent {
  readonly index: number;
  readonly event: Record<string, unknown>;
}

/** One line of `/requests`, as the server recorded it. */
export interface ServerRequest {
  readonly time: string;
  readonly method: string;
  readonly path: string;
  readonly status: number | string;
  readonly origin: string | null;
  readonly bytes: number;
  readonly gzip: boolean;
  readonly user_agent: string | null;
  readonly if_none_match: string | null;
  readonly note: string;
}

export interface Control {
  readonly status: number;
  readonly retry_after: string | null;
  readonly delay_ms: number;
  readonly mode: string;
  readonly cors: string;
  readonly allow_headers: readonly string[];
}

export interface Answer {
  readonly status: number;
  readonly text: string;
}

export class FakeBackend {
  constructor(readonly base: string) {}

  control(query = ''): Promise<Control> {
    return this.json<Control>(`/control${query}`);
  }

  reset(): Promise<Control> {
    return this.json<Control>('/control/reset');
  }

  remoteConfig(key: string): Promise<Answer> {
    return this.call('GET', `/control/config?key=${encodeURIComponent(key)}`);
  }

  saveRemoteConfig(key: string, values: Record<string, unknown>): Promise<Answer> {
    return this.call('POST', `/control/config?key=${encodeURIComponent(key)}`, JSON.stringify(values));
  }

  deleteRemoteConfig(key: string): Promise<Answer> {
    return this.call('DELETE', `/control/config?key=${encodeURIComponent(key)}`);
  }

  events(since = 0): Promise<ServerEvent[]> {
    return this.json<ServerEvent[]>(`/events?since=${since}`);
  }

  clearEvents(): Promise<Answer> {
    return this.call('GET', '/events/clear');
  }

  requests(): Promise<ServerRequest[]> {
    return this.json<ServerRequest[]>('/requests');
  }

  private async json<T>(path: string): Promise<T> {
    const answer = await this.call('GET', path);
    if (answer.status !== 200) throw new Error(`HTTP ${answer.status}`);
    return JSON.parse(answer.text) as T;
  }

  private async call(method: string, path: string, body?: string): Promise<Answer> {
    const init: RequestInit = { method, cache: 'no-store' };
    if (body !== undefined) {
      init.body = body;
      init.headers = { 'Content-Type': 'application/json' };
    }
    const response = await fetch(this.base.replace(/\/+$/, '') + path, init);
    return { status: response.status, text: await response.text() };
  }
}

/** The event's name for a list: the track name, the screen name or the type. */
export function eventLabel(event: Record<string, unknown>): string {
  const name = event['event'] ?? event['name'] ?? event['type'];
  return typeof name === 'string' ? name : '?';
}
