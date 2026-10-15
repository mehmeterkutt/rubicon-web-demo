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
| `scripts/check.sh` | The demo's check; every step keeps it green and adds what it builds |
| `docs/decisions.md` | Implementation decisions of the demo, the counterpart of the SDK plan's section 15 |

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Installs the development dependencies; versions at least seven days old only |
| `scripts/check.sh` | Format check, the fake backend's tests |
| `pnpm format` | Prettier in place (Markdown is not formatted and wraps at 100 columns) |
| `python3 fake-server/server.py [port]` | The fake backend on `0.0.0.0:8080` |
| `python3 -m unittest discover -s fake-server` | The fake backend's tests |

Node 24 and pnpm 12.11.2 (`packageManager`); `minimumReleaseAge` seven days in
`pnpm-workspace.yaml`, so a new development dependency is pinned to the newest version at least
seven days old. Python 3.9 or later, standard library only.

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
- Tests wait on conditions, never fixed sleeps; each test has its own server or browser context.

## Git and pull requests

- `master` holds releases, `develop` (the default branch) the next one; work happens on
  `feature/<topic>` and reaches `develop` by pull request, merged by the user with a merge commit so
  that one commit per step survives (the SDK's D1 and D18).
- Conventional Commits naming the step (`feat(app): ... (step 9.2)`), ending with the attribution
  lines the session gives.
- Push and open a pull request only after the user approves; never merge, never push to `develop` or
  `master`.
