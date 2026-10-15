// WebKit has no host resolver setting, so in WebKit the demo's pages reach the names of D15 through
// this proxy, as the SDK's own browser tests do (SDK plan section 15, step 1.3): a request in the
// proxy's absolute form for the loopback interface, `localhost` or a `*.rubicon.test` name is passed
// to 127.0.0.1 on the same port, Host header unchanged; anything else, and a refused connection, is
// a network failure for the browser, as it would be without the proxy. Plain HTTP only.
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Proxy {
  readonly origin: string;
  close(): Promise<void>;
}

const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\]|[a-z0-9-]+\.rubicon\.test)$/i;

export async function startProxy(): Promise<Proxy> {
  const server = createServer((req, res) => {
    let target: URL;
    try {
      target = new URL(req.url ?? '');
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!LOCAL.test(target.hostname) || target.protocol !== 'http:') {
      req.socket.destroy();
      return;
    }
    const headers = { ...req.headers };
    delete headers['proxy-connection'];
    const upstream = request(
      {
        host: '127.0.0.1',
        port: Number(target.port || 80),
        method: req.method,
        path: target.pathname + target.search,
        headers,
      },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on('error', () => req.socket.destroy());
    req.pipe(upstream);
  });
  // No HTTPS through this proxy.
  server.on('connect', (_req, socket) => socket.destroy());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}
