#!/usr/bin/env bash
# Everything the demo's check runs, in order; stops at the first failure. Each step of phase 9 adds
# what it builds (lint, type check, build and Playwright arrive with the app, step 9.2).
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
step 'fake backend';         python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else "check: Python 3.9 or later is needed")'
                             python3 -m unittest discover -s fake-server
printf '\ncheck: passed\n'
