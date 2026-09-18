# Contributing

Thanks for helping make Jev in Action easier to learn from.

For a bug, open an issue with the use case, steps to reproduce, expected behavior, and actual behavior. For a new demo or larger change, describe the idea in an issue first so we can discuss scope.

## Local workflow

1. Fork and clone the repository.
2. Use Node.js 22+ and run `npm ci`.
3. Create a branch and make a focused change.
4. Run `npm test`. For UI or request-flow changes, install Playwright Chromium and run `npm run test:browser`.
5. Open a pull request describing the problem, the change, and verification. Include a screenshot for visible UI changes.

Tests use fixture provider responses and do not need API keys. Never include `.env`, `.data`, real credentials, personal request history, or sensitive screenshots in a PR.

Keep demo data visibly labeled. Do not invent model output, latency, confidence, or cost. New actions should have explicit constraints and validated inputs; any live side effects must be described clearly before execution. Prefer plain JavaScript and the existing stack unless a change requires otherwise.

Contributions are made under the repository's MIT license. Be respectful, specific, and constructive in discussions.
