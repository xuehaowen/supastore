# Automated verification

Unit/domain, real PostgreSQL integration and production browser journeys.

## When working here

Choose coverage by risk: calculations, persistence/races, interactions and service boundaries. A synthetic lifecycle is not browser/provider evidence.

## Where to start

- [Fast unit and domain checks](unit/README.md): Pure calculations, request boundaries, policy and synthetic lifecycle tests.
- [Transactional integration checks](integration/README.md): Isolated PostgreSQL migrations, commerce, providers, rewards, reports and delivery coordination.
- [Production browser journeys](browser/README.md): Customer/admin flows, localization, rejection and cross-service acceptance.
- [Platform quality baseline](../docs/platform-quality-baseline.md): Current verification evidence, fulfillment-test corrections and Windows execution prerequisites.

## Windows execution prerequisites

Recovery-script tests execute Git Bash, and fixture cleanup tests deliberately create a directory junction. Run them with normal local process/filesystem permissions; a restricted sandbox failure does not establish a product regression or a passing recovery check. Keep assertions enabled and rerun in a supported context.

Some native SWC packages require a private cache with trusted ancestor permissions. If the default cache is rejected, set `SWC_NATIVE_BINDING_CACHE` to an existing validated owner-only directory as described in the [maintenance evidence](../docs/maintenance-hardening-evidence-2026-10-11.md). Do not disable native-loader checks or grant broad cache permissions. Use a writable `TEMP`/`TMP` for Vitest's transform cache.

`node scripts/test-browser.mjs` delegates to `test-storefront.mjs`. A single `node scripts/test-storefront.mjs --measure` builds both production apps, runs the default cross-service browser selection and records process RSS plus initial-route JavaScript. This default selection is not every checked-in browser test; pass additional test paths explicitly when their behavior changes.

## More context

[Parent overview](../README.md)
