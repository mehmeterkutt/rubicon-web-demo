# Rubicon web demo

Browser host app for the Rubicon web SDK (`rubicon-team/rubicon-web-sdk`, checked out next to this
repository's parent at `~/Projects/rubicon/rubicon-web-sdk`). The SDK's design decisions are in
Confluence (space SD, "Analytics SDK: Web") and its plan is `docs/implementation-plan.md` there; this
repository implements its phase 9.

The conversation with the user is in Turkish with technical terms in English; code, comments and
documents are in English, without emoji.

## Git and pull requests

- `master` holds releases, `develop` (the default branch) the next one; work happens on
  `feature/<topic>` and reaches `develop` by pull request, merged by the user with a merge commit so
  that one commit per step survives (the SDK's D1 and D18).
- Conventional Commits naming the step (`feat(app): ... (step 9.2)`), ending with the attribution
  lines the session gives.
- Push and open a pull request only after the user approves; never merge, never push to `develop` or
  `master`.
