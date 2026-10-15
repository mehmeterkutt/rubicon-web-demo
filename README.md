# Rubicon web demo

A browser host app used to exercise the Rubicon web analytics SDK (`rubicon-team/rubicon-web-sdk`) by
hand and with Playwright, against a fake backend. It holds only the app, the fake backend and their
tests; the SDK and its design live in the SDK repository and in Confluence.

The fake backend arrived with step 9.1 of the SDK's implementation plan; the app and the checklist
arrive with steps 9.2 and 9.3.

## Requirements

- Node 24 or later and pnpm 12 (`packageManager` pins the version); `pnpm install` once. Dependencies
  resolve only to versions at least seven days old (`minimumReleaseAge` in `pnpm-workspace.yaml`).
- Python 3.9 or later, standard library only (the `python3` of macOS is enough).

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

The pages themselves arrive with the app (step 9.2).

## Fake backend

`fake-server/server.py`, the iOS demo's backend with the browser's additions; its docstring lists
every endpoint.

```bash
python3 fake-server/server.py          # or: pnpm server; listens on 0.0.0.0:8080
```

The SDK in a demo page uses `http://127.0.0.1:8080` as its `host`. The pages are on another origin,
so every SDK request is cross-origin and preflighted, as on a customer's site.

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
  `/api/slow?ms=N`, anything else 200.

## Check

```bash
scripts/check.sh                                          # or: pnpm check
python3 -m unittest discover -s fake-server               # the fake backend's tests alone
python3 -m unittest discover -s fake-server -k preflight  # some of them
```

The check runs Prettier and the fake backend's tests; lint, type check, build and Playwright join it
with the app (step 9.2).
