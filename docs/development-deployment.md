# Development and deployment

## Current status

There are no application scripts, executable migrations, Docker files or runnable services. This document defines implementation deliverables, not commands that work today.

## Reproducible development

Pin Node, pnpm and dependency versions; provide an environment template, synthetic seed store and exact install/start/check commands. Document local PostgreSQL, Better-Auth and S3 storage configuration and provider differences from production. When connecting to pooled PostgreSQL (Supabase, Neon, PgBouncer), specify `DATABASE_URL` targeting direct session mode (e.g. port 5432) to preserve transaction-level row and advisory locks. Isolate email and physical-payment simulation; never require production credentials or live transfers for tests.

Build schemas and migrations alongside vertical slices. Use one TypeScript application use case and Drizzle transaction per business command, with pure domain calculations and thin server entry points. See [architecture](architecture-overview.md) and [transaction contracts](transaction-contracts.md). Do not generate deferred schemas or duplicate business rules in SQL functions.

CI runs formatting/lint/type checks, pure calculation tests, database-backed authorization/concurrency tests and selected end-to-end journeys. Each slice tests clean migration and supported forward upgrade. Generated financial operation sequences complement explicit examples. Avoid snapshot tests that merely reproduce implementation output without checking behavior.

## Supported deployment model

Evaluate Docker Compose and container hosts such as Railway, Fly.io, Coolify and Render using a 1 vCPU, 1GB RAM test host. The <80MB image and 256–512MB application memory budgets are provisional, unmeasured targets. Record application, database and storage requirements separately and publish only verified deployment recipes. An in-process worker requires a continuously running instance; disable scale-to-zero or supply a continuously running dedicated worker.

### Configuration and process supervision

Use the stack and provider interfaces in [architecture](architecture-overview.md#deployment-and-stack). Deployment recipes must document database, storage and email credentials, a protected bootstrap secret, TLS and verified proxy/edge rate limits. Caddy, Traefik or platform edge defaults are candidates; verify required modules rather than assuming rate limiting is built in.

Support the default in-process worker (registered via Next.js `instrumentation.ts` in Node.js runtime) and optional worker-only container (`node dist/worker.js`). The process must handle SIGTERM/SIGINT with a 15-second drain budget and a longer container stop grace period. Worker shutdown, leases, sequencing and retries follow the [events contract](api-events-spec.md#worker-lifecycle-and-retry); this guide owns how to configure and observe them, not a second worker algorithm.

Run daily housekeeping according to [retention responsibilities](database-schema.md#retention-and-automated-housekeeping). Record job liveness and failures alongside delivery health. No external scheduler is required for the default deployment.

Startup validation checks environment variables, DB connectivity, storage bucket access, and SMTP without logging secrets. Health endpoints distinguish web availability from worker liveness, oldest pending outbox jobs, and delivery errors. Protect owner bootstrap with a deployment-held secret and verify active membership in the database on every private request.

## Backups and upgrades

Back up database, storage assets and required configuration; store secrets separately. Define retention and recovery targets for the supported profile. Test restore into an isolated environment with all outbound delivery disabled, verifying orders, allocations, transfer history, private assets and authorization.

A restore cannot undo a physical payment or previously sent email. Reconcile external operations and uncertain payout attempts before enabling normal work. Operator review of restored outbox state precedes worker resumption.

Before upgrades, back up and rehearse migrations on a copy. Publish compatible versions, downtime expectations and rollback/forward-repair guidance. Container rollback does not reverse database migrations. Test clean installation and the supported upgrade path with representative financial history.

## Open-source release gates

MIT licensing and contribution terms are present. Configure private vulnerability reporting and name responsible maintainers before the first public application release. Publish a tested quickstart, synthetic demo, screenshots, changelog, issue/PR templates and support matrix with the first release. Do not claim support response times without assigned ownership.

Document supported-market and manual-availability limitations prominently. Observe a pilot merchant completing setup, checkout, receipt recording, fulfillment and refund. Fix ordinary task failures before extending payment or customization scope.
