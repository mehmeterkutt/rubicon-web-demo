#!/usr/bin/env bash
# Everything the demo's check runs, in order; stops at the first failure: format, lint, type check,
# the fake backend's tests, the build, and the Playwright suite (the smoke and the scenario specs) in
# Chromium, Firefox and WebKit against the fake backend (it starts both servers, on 8080 and 4173,
# which must be free, and a backend per worker). The SDK checkout next to this repository must be
# built first (README, Requirements).
#
#   scripts/check.sh
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ $# -gt 0 ]]; then
  echo "check: unknown option $1" >&2
  exit 2
fi

step() { printf '\n== %s\n' "$1"; }

step 'format';               pnpm -s format:check
step 'lint';                 pnpm -s lint
step 'type check';           pnpm -s typecheck
step 'fake backend';         python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else "check: Python 3.9 or later is needed")'
                             python3 -m unittest discover -s fake-server
step 'build';                pnpm -s build --logLevel warn
step 'Playwright';           pnpm -s e2e
printf '\ncheck: passed\n'
