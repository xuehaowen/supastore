# Local service and sales verification

Date: October 18, 2026, America/Los_Angeles. Application fix:
`4a7dbe0ef0d3528eb7a6db132faebc661233b75a`. Checks use synthetic transactions and
an isolated Docker project, except the explicitly scoped local configuration
probes below. No real payment was made.

## Configured local services

The `.env` SMTP OAuth2 configuration authenticated successfully using
`node scripts/check-release-services.mjs --connect`. This probe sends no message.
Real SMTP acceptance and inbox receipt require an approved test recipient and
separate receipt confirmation; they are not established by authentication.

The configured local RustFS service authenticated successfully. Its private
evidence bucket existed, but its configured catalog bucket was missing. The empty
catalog bucket was created with default private access. Both buckets then passed
write and signed-read checks; copying and anonymous private-access denial also
passed. Only uniquely named synthetic probe objects were deleted afterward.
Existing objects were not changed. No bucket policy was made public.

The configured development database had 40 migrations. A verified custom-format
backup was retained locally as
`.tmp-cuj/platform-quality/configured-dev-before-0040-0041.dump` before applying
`0040_contextual_commerce` and `0041_promotion_limits`. All 42 migrations and the
new columns are now present. Financial-record counts and fingerprints match the
pre-upgrade backup. The missing application role was created with DML permissions
and no schema-creation rights; its generated password is saved only in ignored
`.env`. No existing role or password was reset. The missing Compose database
password variable was filled from the existing configured connection, without
changing that credential. The migration command and `docker compose config
--quiet` now succeed. This validates configuration, not startup of a second
configured store alongside the existing dependency containers.

## Storage-link correction

An authenticated evidence request returned a signed link using a backend-reachable
storage endpoint that the host browser could not reach. RED checkpoint `7114d33`
records regressions for public signing and internal inline-image fetching. GREEN
checkpoint `4a7dbe0` adds optional `S3_PUBLIC_ENDPOINT` and its Compose setting.
Server writes, copies and inline image fetches continue to use `S3_ENDPOINT`;
browser-facing signatures use the configured public endpoint. Single-endpoint
deployments retain their existing behavior when the new setting is absent.

The real RustFS application check passes authenticated evidence download (200),
anonymous evidence denial (401), unsigned storage denial (403), inline catalog
image rendering (200) and unknown-asset denial (404). Signature lifetimes and
authorization checks are unchanged. Read-only code review found no confirmed
correctness, security or compatibility issues.

The full unit/library suite passes **1,214 tests in 146 files**. Type checking,
lint and formatting pass. Separate contextual-commerce and credit-reward
integration checks pass **25 tests** on isolated databases in Docker PostgreSQL.
Those integration checks preceded the storage-only fix. Earlier full integration,
browser-audit and bundle evidence remains in the dated acceptance records and is
not counted as rerun here.

## Fixture scope

The `supastore-local-verify` project uses a synthetic database, an independent
RustFS container using the same immutable image as the configured local service,
the application images, and a local-only SMTP sink that cannot relay mail.
The worker is enabled for sales and retry verification. Recovery applications
explicitly suppress outbound delivery and disable the worker. Fixture ports bind
to loopback. Sales and recovery fixtures never target the configured store
database; its backed-up schema/configuration maintenance is recorded separately
above.

The backend image was rebuilt for the storage fix. The storefront image is reused
from the passing current Docker launch rehearsal because storefront source did
not change. Temporary fixture tooling, synthetic backups and detailed logs remain
under the ignored `.tmp-cuj/platform-quality` directory.

## Final Docker results

All **33 browser journeys** pass on a fresh fixture using real RustFS and the
enabled worker. Coverage includes pickup-only and shipping-only manual-payment
profiles, free checkout, regional prices, bounded promotion editing, account
verification/password reset, reconciliation, fulfillment, refunds, paid/unpaid
cancellation, lost-response recovery and retrying payment-evidence upload.

Stopping the local SMTP sink causes a durable retry. After restarting the backend
and restoring SMTP, the same delivery is accepted on attempt 2 and reaches the
sink exactly once. Two further worker ticks do not duplicate it. The final worker
health endpoint returns 200. The sink never relays mail externally.

With source writes paused, a database dump and matching snapshot of **five RustFS
objects** were retained. Restarting PostgreSQL and RustFS preserved database
fingerprints and object bytes. Restoration into a separate database and buckets
preserved fingerprints for orders, items, guest sessions, payment upload intents,
receipts, refund authorizations and email deliveries. All five object checksums
match. The restored application passes readiness, owner evidence download,
anonymous denial and catalog-image rendering. Outbound delivery is suppressed and
the restored worker is disabled.

This exercises a database dump and explicit object-copy recovery path, not the
production shell procedure against merchant backups. Fixture containers, network
and volumes were removed; independent inventories found no project resources.
The user's existing PostgreSQL and RustFS services remain running.

[Machine-readable summary](benchmarks/2026-10-18-local-services.json). Real SMTP
acceptance/inbox receipt is the only email check still pending an approved test
recipient. Public deployment, real payment settlement and human usability
acceptance remain separate.

## Diagnostic attempts

The first SMTP sink startup inherited an unrelated HTTP health check; its fixture
configuration was corrected. The first unit run could not use the Windows sandbox
temporary cache; assertions subsequently ran with a writable cache. One broad
unit run timed out in the lint-cache test while competing with image build/lint;
the clean full rerun passed with the unchanged timeout. A browser rerun against
already-used data encountered accumulated setup/search fixtures; final browser
acceptance uses a fresh disposable stack. These attempts are not passing evidence.
The first restore completed its data checks but hit an unbounded client-close
warning; the repeated stage with bounded connection shutdown succeeds. Restored
admin routing initially used the storefront's compiled backend hostname; assigning
that hostname to the isolated restored backend resolves the fixture mismatch.
The initial configured-database migration applied the schema before optional role
setup failed on the absent application password; subsequent provision/connection
checks and the final migration command pass with financial fingerprints intact.
