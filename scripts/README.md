# Development and operator tools

Test fixtures, builds/migrations, seeds, benchmarks, release checks and backup/recovery tooling.

## When working here

Inspect target database, Compose project and outbound suppression before mutation. Synthetic runners are not production provider acceptance.

## Where to start

- [backend.mjs](backend.mjs): Backend launcher using root Next.js source.
- [test-integration.mjs](test-integration.mjs): Isolated PostgreSQL integration runner.
- [test-browser.mjs](test-browser.mjs): Main production browser fixture runner.
- [test-storefront.mjs](test-storefront.mjs): Two-service browser runner.
- [check-release-services.mjs](check-release-services.mjs): Provider configuration/connectivity probe.

## More context

[Parent overview](../README.md)
