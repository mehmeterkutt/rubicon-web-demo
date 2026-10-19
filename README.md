# Rubicon web demo

A browser host app used to exercise the Rubicon web analytics SDK (`rubicon-team/rubicon-web-sdk`) by
hand and with Playwright, against a fake backend. It holds only the app, the fake backend and their
tests; the SDK and its design live in the SDK repository. It is a test harness:
every page, tab and button triggers one SDK behaviour and says what to expect.

The fake backend arrived with step 9.1 of the SDK's implementation plan, the app with step 9.2, the
manual checklist (`docs/manual-checklist.md`) and the Playwright scenario suite with step 9.3.

## Requirements

- Node 24 or later and pnpm 12 (`packageManager` pins the version); `pnpm install` once. Dependencies
  resolve only to versions at least seven days old (`minimumReleaseAge` in `pnpm-workspace.yaml`).
- Python 3.9 or later, standard library only (the `python3` of macOS is enough).
- The SDK checkout at `~/Projects/rubicon/rubicon-web-sdk` (`../../rubicon-web-sdk` from here), built.
  The app depends on it through `link:../../rubicon-web-sdk/packages/web`, the counterpart of the
  Android demo's composite build, and takes `dist/rubicon.min.js` and `dist/snippet.json` from it:

  ```bash
  cd ../../rubicon-web-sdk && pnpm install && pnpm -r build
  ```

  Build the SDK again after changing it; the demo's build refuses an SDK build whose
  `dist/snippet.json` does not match its `dist/rubicon.min.js`.
- Playwright's browsers, once: `pnpm exec playwright install chromium firefox webkit` (the same
  Playwright version as the SDK, so an SDK checkout that ran its browser tests already has them).

## Hostnames

The demo pages are served on two subdomains of one site, `a.rubicon.test` and `b.rubicon.test` (the
SDK's D15), so the cookies the SDK shares across subdomains (identity, session, consent) can be
tried. For manual runs, add this line to `/etc/hosts` once (with `sudo`); remove it to undo:

```
127.0.0.1 a.rubicon.test b.rubicon.test
```

Chrome, Firefox and Safari then resolve both names to the loopback interface, and the SDK's cookie
domain is `rubicon.test` in every engine, as a customer's registrable domain would be. The
Playwright suite needs no such line: it resolves the names with a host resolver rule in Chromium, a
preference in Firefox and a proxy in WebKit, as the SDK's own browser tests do.

Fallback without any setup: `a.rubicon.localhost` and `b.rubicon.localhost`, which browsers and
macOS resolve to the loopback interface by themselves. Cookies are shared across the two in all
three engines, but Safari (and WebKit) accept a cookie on `Domain=localhost`, so the SDK's identity
cookie lands on `localhost` there and every `*.localhost` site on the machine sees it; use the
`rubicon.test` names for the subdomain checks in Safari. Pages on `*.localhost` are also secure
contexts, unlike plain `http` on `rubicon.test`.

## Run it

```bash
pnpm server                    # terminal 1: the fake backend on 0.0.0.0:8080
pnpm dev                       # terminal 2: the app, http://a.rubicon.test:5173/
pnpm build && pnpm preview     # or the built app, http://a.rubicon.test:4173/
```

The servers listen on `127.0.0.1` and answer the names above, `localhost` and `127.0.0.1`. Use the
built app (`pnpm preview`) for the back/forward cache: the development server keeps a WebSocket
open, which keeps pages out of the cache in some browsers, and its client script fails to load in
the sandboxed iframe (harmless). The SDK in every page sends to `http://127.0.0.1:8080`, another
origin than the pages, so every SDK request is cross-origin and preflighted, as on a customer's
site.

## The app

The main page (`/`) holds the tabs, as the Android and iOS demos do; they are hash routes (`#events`,
...), which `Page Viewed` ignores, and each sends `screen("tab_<name>")` when shown (Settings).

| Tab | What it tries |
|---|---|
| Events | Quick events and `flush()`, an event builder with typed properties, every conversion of Web Serialization 2 (also values from an iframe's realm), every rejected value, every limit (keys, depth, 1024-character strings, 256 properties, names, 32 KB, lone surrogates, the copy), volume, the `beforeSend` hooks, developer errors (`SECOND_INSTANCE`, `INVALID_USER_ID`) |
| Identity | `deviceId`, `identify` with and without traits, a blank and a too long id, `reset`, super properties, `optIn`, `optOut`, `clearLocalData`, "forget me", the Global Privacy Control line, the SDK's cookies and `localStorage` keys on this host |
| Capture | Page views (full page loads, a campaign link with `utm_*`, empty `utm_*`, the single-page area, a redirect at load, a background tab, query and fragment changes), the other pages, hidden pages, leaving and sessions, thirteen HTTP calls through `createTrackedFetch` |
| Server | The fake backend from the page: its batch responses (any status, `Retry-After`, delay, redirect, dropped connection, CORS left off), the preflight's extra allowed headers, the remote configuration (kill switch, autocapture off, flush values, sampling), the events it received (this browser's or all) and the requests it saw, preflights included |
| Logs | The SDK's `eventObserver` (queued, sent, dropped with the reason) and its log lines by level, kept per tab across page loads; an observer and a logger that throw |
| Settings | Every SDK setting, the hooks, consent, identity, the context, network capture, and a JSON field merged into the configuration last (wrong types, another platform's setting); applied by reloading |

| Page | What it tries |
|---|---|
| `/pages/one.html`, `/pages/two.html` | Full page loads, each with its own SDK instance; links with `utm_*`, a referrer with ids |
| `/pages/bfcache.html` | Leaving and coming back with the browser's Back: the back/forward cache restore |
| `/spa/` | The single-page area on React Router: pushes, replaces inside and outside the 500 ms window, redirects while rendering, query and fragment changes, Back and Forward, a deep address loaded directly; with "Router screens" (Settings) also `screen()` per route |
| `/pages/other-host.html` | The second subdomain: the same page on `b.rubicon.test` (and back), sharing device, user, session and consent |
| `/pages/script.html` | The script build from one script tag with its integrity hash (`window.Rubicon`), a second load of the file, two copies of the SDK on one page |
| `/pages/snippet.html` | The two-tag snippet (the stub, the page's init tag, the library loaded async) under a strict policy that allows the stub and the init tag by their hashes, this origin and the fake backend only |
| `/pages/csp-blocked.html` | A policy whose `connect-src` leaves the SDK's host out: `CSP_BLOCKED` |
| `/pages/sandboxed.html` | A sandboxed iframe (opaque origin, no storage): the SDK runs from memory, `STORAGE_UNAVAILABLE` |

Settings are saved in the cookie `demo_settings` on the site's domain (`rubicon.test`), so both
subdomains run the SDK with one configuration; saving reloads the page, and other open tabs keep
their configuration until they are reloaded. The snippet page's init tag applies the saved settings
but the hooks and the JSON field, and its policy allows only `http://127.0.0.1:8080`, so another host
there shows `CSP_BLOCKED`. The demo's own storage is outside the SDK's prefixes (`rubicon.`,
`rubicon_`, `__rubicon_`): the cookie `demo_settings`, `localStorage` `demo.person` (what this host
told the SDK about the user) and `sessionStorage` `demo.journal` (the Logs tab of this browser tab).

Offline, hidden pages and closing tabs are the browser's own: developer tools (Network, Offline),
another tab, closing the tab; the Capture tab says what to expect.

## Fake backend

`fake-server/server.py`, the iOS demo's backend with the browser's additions; its docstring lists
every endpoint.

```bash
python3 fake-server/server.py          # or: pnpm server; listens on 0.0.0.0:8080
```

- `OPTIONS` answers the preflight with the CORS answer of Web HTTP 4: `Access-Control-Allow-Origin: *`,
  `Access-Control-Allow-Methods: POST, GET`, `Access-Control-Allow-Headers` with exactly
  `Authorization`, `Content-Type`, `Content-Encoding`, `If-None-Match` (plus the names set with
  `allow_headers`), `Access-Control-Max-Age: 7200`. For the demo's own paths it allows what is asked.
- Every other response, errors, 404s and the redirect included, carries `Access-Control-Allow-Origin: *`
  and `Access-Control-Expose-Headers: ETag, Retry-After, X-Request-Id`.
- `POST /v1/batch` stores the events (gzip or plain) and answers as `/control` says; `GET /v1/config`
  serves `fake-server/config/<api key>.json` with an ETag and 304, or 404.
- `GET /control?status=503&retry_after=30&delay_ms=0&mode=normal|redirect|drop&cors=on|off&allow_headers=X-A,X-B`,
  `GET /control/reset`. `cors=off` leaves the CORS headers off every `/v1/` answer but the preflight,
  as a gateway error page without them: the browser hides the answer and the SDK logs
  `UPLOAD_FAILED_OPAQUE`. `allow_headers` lists the names of the app's `network.headers`.
- `GET|POST|DELETE /control/config?key=...` reads, writes and deletes a remote configuration
  (`fake-server/config/` is not committed).
- `GET /events[?since=N]`, `GET /events/clear`, `GET /requests` (the last 200 requests, preflights
  included, with their `Origin`; never the key, never `Referer`). A `/v1/` request is expected with
  the browser's own `User-Agent` and an `Origin` (the web SDK sends no User-Agent of its own) or with
  a mobile SDK's `User-Agent`; anything else is noted as "unexpected User-Agent".
- `/api/...` answers the app's own calls through `createTrackedFetch`: `/api/status/<code>`,
  `/api/slow?ms=N`, anything else 200. The app calls it as `localhost`, the SDK as `127.0.0.1`, so
  the SDK's own host is never captured.

## Check

```bash
scripts/check.sh                                          # or: pnpm check
python3 -m unittest discover -s fake-server               # the fake backend's tests alone
python3 -m unittest discover -s fake-server -k preflight  # some of them
pnpm e2e                                                  # the Playwright suite alone
pnpm e2e --project=webkit -g snippet                      # one engine, some tests
```

The check runs Prettier, ESLint, the type check, the fake backend's tests, the build and the
Playwright suite in Chromium, Firefox and WebKit. Playwright starts its own fake backend on 8080
and builds and serves the app on 4173 (`vite preview`), so stop `pnpm server` and `pnpm preview`
first: a server already on one of the ports fails the run rather than being reused with someone's
`/control` settings. The suite has two parts:

- `e2e/smoke.spec.ts` (step 9.2): every page and tab opens and at least one of its events reaches
  the fake backend on 8080 (the CSP page shows `CSP_BLOCKED` instead).
- `e2e/scenarios/` (step 9.3): the scenarios of `docs/manual-checklist.md` that a browser can
  automate, each test named after its row, driven through the demo's pages and buttons. Every
  Playwright worker runs a fake backend of its own (`e2e/backend.ts`: `server.py` on a free port
  with a temporary configuration directory), so a scenario may script the server's answers; the
  snippet page uses the shared one on 8080, which its policy names. Long waits (session timeouts,
  a 429, a 401's hour, the age of another page's events) run on Playwright's clock.

```bash
pnpm e2e e2e/scenarios                        # the scenario suite alone
pnpm e2e --repeat-each 3                      # three times over, for stability
```

What Playwright cannot do (a real back/forward cache restore, real hiding, a background tab, a
private window, a real `https` page, an ad blocker, a physical iPad, measurements on a slow device
or a real network) is in the manual checklist, which says for every row whether the suite covers
it.
