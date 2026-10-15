# Rubicon web demo

Browser host app for the Rubicon web SDK (`rubicon-team/rubicon-web-sdk`, checked out next to this
repository's parent at `~/Projects/rubicon/rubicon-web-sdk`). The SDK's design decisions are in
Confluence (space SD, "Analytics SDK: Web") and its plan is `docs/implementation-plan.md` there; this
repository implements its phase 9.

The conversation with the user is in Turkish with technical terms in English; code, comments and
documents are in English, without emoji.

## Layout

| Path | What it is |
|---|---|
| `fake-server/server.py` | The fake backend: the iOS demo's standard-library Python server with the CORS answer of Web HTTP 4 and the browser's User-Agent (step 9.1); its docstring lists every endpoint |
| `fake-server/test_server.py` | Its tests, `unittest`, a server on a free port and a temporary configuration directory per test |
| `index.html`, `pages/*.html`, `spa/index.html` | The app's real HTML pages (step 9.2): the tabs, full page loads, the back/forward cache, the second subdomain, the script build, the snippet, a CSP without the host, a sandboxed iframe, the single-page area |
| `src/demo/` | The demo's logic: settings (cookie `demo_settings`), hook presets, the SDK's creation (`runtime.ts`), the journal of observer updates and log lines, the fake backend client, the `createTrackedFetch` calls |
| `src/app/` | The main page and one file per tab: Events, Identity, Capture, Server, Logs, Settings |
| `src/pages/`, `src/spa/` | The other pages' entry modules; the React Router area |
| `src/ui/` | Shared pieces: components, the page frame (`shell.tsx`), the status line |
| `snippet/init.js` | The snippet page's own init tag (ES5), inlined and hashed by the plugin |
| `public/` | Files served as they are: the sandboxed frame's classic script, the icon |
| `tooling/rubicon-pages.ts` | The Vite plugin: the SDK's script build under `/sdk/`, the snippet's tags and policy, the single-page fallback |
| `e2e/` | Playwright: fixtures (hostnames, events by `deviceId`, settings), the WebKit proxy, the smoke spec |
| `scripts/check.sh` | The demo's check; every step keeps it green and adds what it builds |
| `docs/decisions.md` | Implementation decisions of the demo, the counterpart of the SDK plan's section 15 |

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Installs the dependencies; versions at least seven days old only; the SDK through `link:` |
| `scripts/check.sh` | Format check, lint, type check, the fake backend's tests, build, Playwright in three engines |
| `pnpm format` | Prettier in place (Markdown is not formatted and wraps at 100 columns) |
| `pnpm server` | The fake backend on `0.0.0.0:8080` (`python3 fake-server/server.py [port]`) |
| `pnpm dev`, `pnpm build && pnpm preview` | The app on `127.0.0.1:5173`, the built app on `:4173`; open it as `http://a.rubicon.test:<port>/` |
| `pnpm lint`, `pnpm typecheck` | ESLint (`strictTypeChecked`), `tsc` over `tsconfig.json` (the app) and `tsconfig.node.json` |
| `pnpm e2e` | Playwright: starts the fake backend and builds and serves the app itself; the ports must be free |
| `python3 -m unittest discover -s fake-server` | The fake backend's tests |

Node 24 and pnpm 12.11.2 (`packageManager`); `minimumReleaseAge` seven days in
`pnpm-workspace.yaml`, so a new development dependency is pinned to the newest version at least
seven days old. Python 3.9 or later, standard library only. The SDK checkout
(`../../rubicon-web-sdk`) must be built (`pnpm install && pnpm -r build` there) before the demo
builds; Playwright stays at the SDK's version.

## Rules

- The demo is a test harness: every page and button exists to trigger an SDK behaviour; no product
  features. Its own settings live under storage keys outside the SDK's prefixes (`rubicon.`,
  `rubicon_`, `__rubicon_`).
- The fake backend answers CORS as Web HTTP 4 requires of the real one, on every response, errors
  included; the preflight for `/v1/` lists the allowed headers and never reflects them, so a header
  the SDK sends that the contract does not name fails here as in the field.
- An implementation detail a reader would wonder about gets a row in `docs/decisions.md`; anything
  that changes what the SDK or the fake backend's contract does, or that the user must install or
  run, is a question for the user.
- The SDK comes only from the linked checkout, never copied or edited here: the npm package through
  `link:`, the script build and `dist/snippet.json` through `tooling/rubicon-pages.ts`. An SDK
  behaviour that looks wrong is an SDK bug report, never a demo workaround.
- Every page creates the SDK first, once, from the saved settings (`startDemo()` in
  `src/demo/runtime.ts`; `window.Rubicon` on the script page, the init tag on the snippet page); a
  setting changes by saving and reloading. Each button says what to expect, in the decisions'
  words, with their pointers (Web Queue 2, ...).
- The demo calls the fake backend's own endpoints with plain `fetch`, never through
  `createTrackedFetch`; its app calls go to `localhost`, the SDK to `127.0.0.1`.
- No `StrictMode`: it runs effects twice in development, which would double SDK calls.
- Tests wait on conditions, never fixed sleeps; each test has its own server or browser context. A
  Playwright spec finds its events on the shared fake backend by its context's `deviceId`.

## Git and pull requests

- `master` holds releases, `develop` (the default branch) the next one; work happens on
  `feature/<topic>` and reaches `develop` by pull request, merged by the user with a merge commit so
  that one commit per step survives (the SDK's D1 and D18).
- Conventional Commits naming the step (`feat(app): ... (step 9.2)`), ending with the attribution
  lines the session gives.
- Push and open a pull request only after the user approves; never merge, never push to `develop` or
  `master`.
