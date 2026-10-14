# Contributing to OpenMultiview

Thank you for helping improve the project. Bug reports, layout presets,
documentation and code changes are welcome in French or English.

## Report a bug

Use the bug-report template. Include your vMix version, browser, Node.js version,
the affected screen and the steps to reproduce. State whether you used the local
companion or a public URL. Remove private source names, credentials and
production recall URLs from screenshots and logs.

## Propose a change

For substantial changes, open an issue describing the production need and the
expected behavior. For a small fix, a pull request is enough.

1. Fork and clone the repository.
2. Use Node.js 22 or later; there are no npm dependencies.
3. Start with `npm start` and run `npm test` after changing behavior.
4. Build with `npm run build` if the public site or hosting changed.
5. Describe the user-visible change and how it was verified in the pull request.

Preserve existing source IDs and legacy URL formats. Video tiles must remain
16:9. Automatic screen roots must keep their HTML source on layer 10. Public
deployment must not include PC configuration data or `.env` files. Use the fake
vMix adapter for tests; do not require a contributor's real production inputs.

Keep the dependency-free runtime where possible. Add tests for meaningful
behavior, rather than duplicating markup assertions. Inspect visual changes on
desktop and a narrow viewport, including overflow and keyboard access.

By submitting a contribution, you provide it under the project's MIT license.
