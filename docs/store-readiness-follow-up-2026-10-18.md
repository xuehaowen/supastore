# Store readiness follow-up

Date: October 18, 2026, America/Los_Angeles. Scope: the user-selected isolated local test store, using synthetic accounts and transactions.

## Delivered changes

- Admin navigation provides staff sign-out through `/api/admin-auth/sign-out`. Failed requests retain a visible retry action; successful sign-out redirects to `/admin/login`. Customer and merchant sessions remain independent.
- Launchers validate only in-memory settings. Root package commands use Node environment-file options upstream, including production build-time settings. Storefront processes receive an allowlist of runtime/public settings instead of backend credentials.
- Optional analytics is mounted in the storefront. Consent gates public page views, anonymous cart/checkout stages and confirmed/completed purchases. Private page paths, customer contact details and order references are excluded from telemetry.
- Purchase measurement uses the accepted currency/precision snapshot, records major currency units, and marks browser-local completion only after the analytics endpoint accepts the request. Concurrent observers share one in-flight attempt. Failed attempts can retry on a subsequent visit; this is best-effort per-browser measurement, not an accounting ledger.
- Docker/Compose pass the optional public analytics endpoint at build time. Changing it requires rebuilding the storefront.
- The merchant-pilot roadmap item is open until an observed human pilot is recorded.

## Verification

Fresh Linux backend and storefront fixture images compile successfully, including production lint/type checks. The isolated Docker store uses a disposable PostgreSQL database, a separate RustFS volume and a local SMTP sink that cannot relay externally. Analytics requests are intercepted by the browser against a reserved synthetic endpoint.

Final unit/library verification passes **1,268 tests** (1,176 backend/shared unit tests and 92 storefront library tests). Root, backend and storefront TypeScript checks and ESLint pass. The separate error suite passes 78 tests. The fresh isolated Docker browser run passes **19 of 19 journeys**, including sign-out failure/retry and session separation, consent and purchase retry/deduplication, cart/checkout validation, order retry, fulfillment, permissions, payment corrections and refunds.

The acceptance Compose project was stopped with volume removal. Label-filtered container, volume and network inventories are empty. Separately tagged fixture images and diagnostic logs are retained; the configured store was not changed.

Ignored diagnostic artifacts are under `.tmp-cuj/review-checks/` and `.tmp-cuj/store-readiness/`; they are not production deployment configuration.

## Diagnostic attempts

The initial native Windows build was blocked by SWC cache permission validation. Existing shared-cache and system permissions were not changed; this local acceptance uses Linux Docker builds. A newly created temporary cache was isolated during diagnosis.

The first browser run passed 18 of 19 journeys. The session fixture's direct signup request omitted the browser Origin header and was correctly rejected. A synthetic request reproduced rejection without Origin and acceptance with Origin. The test now supplies the actual browser origin; application origin protection remains enabled. The next run reached the expected sign-out error, but its broad alert locator also matched the framework route announcer. The assertion now targets the visible sign-out error specifically.

## Remaining merchant acceptance

This local run does not establish live Stripe settlement/refunds, production domain/TLS/ingress behavior, target-host recovery, or human usability. The prior approved Inbox-delivery test remains separate evidence. An owner should perform the intended real merchant workflow and an observed mobile/language usability pilot before public cutover. Financial reports and ledgers remain authoritative for sales and refunds; optional browser analytics is a conversion aid.
