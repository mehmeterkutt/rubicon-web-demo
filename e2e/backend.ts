// A fake backend of the scenario suite's own: the same `fake-server/server.py`, one instance per
// Playwright worker on a free port with a temporary configuration directory, so a scenario that
// scripts the server's answers (429, 503, 401, CORS off, a remote configuration) never changes what
// a test in another worker sees. Tests of one worker run one after another and reset it first. The
// shared backend on 8080 stays for the smoke suite and the snippet page, whose policy names that
// port. docs/decisions.md, step 9.3.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { WireEvent } from './fixtures';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Imports the server module, binds port 0 on the loopback interface with a temporary configuration
// directory, prints the port and serves; when its standard input closes it removes the directory and
// exits, so a worker that dies takes its server with it.
const LAUNCHER = `
import os, shutil, sys, tempfile, threading
sys.path.insert(0, 'fake-server')
from server import FakeBackend
config = tempfile.mkdtemp(prefix='rubicon-demo-config-')
server = FakeBackend(('127.0.0.1', 0), config_dir=config, verbose=False)
print(server.server_address[1], flush=True)
def stop():
    sys.stdin.read()
    shutil.rmtree(config, ignore_errors=True)
    os._exit(0)
threading.Thread(target=stop, daemon=True).start()
server.serve_forever()
`;

/** One line of `/requests`. */
export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly status: number | string;
  readonly origin: string | null;
  readonly bytes: number;
  readonly gzip: boolean;
  readonly note: string;
}

export class Backend {
  private markers = 0;

  private constructor(
    private readonly child: ChildProcess,
    readonly port: number,
  ) {}

  /** What the SDK is configured with: the loopback address, another origin than the pages. */
  get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** The same server under another name, for the app's own calls through `createTrackedFetch`. */
  get apiBase(): string {
    return `http://localhost:${this.port}`;
  }

  static async start(): Promise<Backend> {
    // Its standard error is kept for a failed start only: a request the browser abandons (a
    // canceled call, a closed page) makes the standard library print a traceback, which is noise.
    const child = spawn('python3', ['-c', LAUNCHER], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let errors = '';
    child.stderr.on('data', (chunk: Buffer) => {
      if (errors.length < 4000) errors += chunk.toString();
    });
    const port = await new Promise<number>((resolve, reject) => {
      const lines = createInterface({ input: child.stdout as NodeJS.ReadableStream });
      lines.once('line', (line) => {
        resolve(Number(line));
      });
      child.once('exit', (code) => {
        reject(new Error(`the fake backend exited with ${String(code)}: ${errors}`));
      });
    });
    return new Backend(child, port);
  }

  async stop(): Promise<void> {
    this.child.stdin?.end();
    await new Promise<void>((resolve) => {
      if (this.child.exitCode !== null) resolve();
      else
        this.child.once('exit', () => {
          resolve();
        });
    });
  }

  /** Back to 200, no events, no remote configuration of `keys`. */
  async reset(keys: readonly string[] = []): Promise<void> {
    await this.get('/control/reset');
    await this.get('/events/clear');
    for (const key of keys) {
      await fetch(`${this.origin}/control/config?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
    }
  }

  /**
   * Every event this server stored for `deviceId`, in arrival order, each `message_id` once: the
   * delivery is at least once and the real backend deduplicates on `message_id` (Web Queue 2, 3), so
   * a page that left with its request in flight and the next page sending the same chunk again is
   * the contract, not a failure.
   */
  async eventsOf(deviceId: string): Promise<WireEvent[]> {
    const seen = new Set<unknown>();
    return (await this.events()).filter((e) => {
      if (e.device_id !== deviceId || seen.has(e['message_id'])) return false;
      seen.add(e['message_id']);
      return true;
    });
  }

  /** Every event this server stored, in arrival order, duplicates included. */
  async events(): Promise<WireEvent[]> {
    const items = (await this.get('/events')) as { event: WireEvent }[];
    return items.map((i) => i.event);
  }

  /**
   * Puts a marker into the server's request log (an app call to `/api/marker-<n>`), so a test can
   * read the requests made after it with {@link requestsSince}; the log keeps the last 200 only.
   */
  async mark(): Promise<string> {
    const path = `/api/marker-${String(++this.markers)}`;
    await fetch(this.origin + path);
    return path;
  }

  /** The requests this server saw after the marker `path`, oldest first. */
  async requestsSince(path: string): Promise<RecordedRequest[]> {
    const all = await this.requests();
    const at = all.findIndex((r) => r.path === path);
    if (at < 0) throw new Error(`the marker ${path} left the request log`);
    return all.slice(at + 1);
  }

  /** The requests this server saw, oldest first. */
  async requests(): Promise<RecordedRequest[]> {
    return ((await this.get('/requests')) as RecordedRequest[]).reverse();
  }

  private async get(path: string): Promise<unknown> {
    const response = await fetch(this.origin + path);
    return response.json();
  }
}
