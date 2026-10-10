# Backend and storefront deployment

See [local performance and recovery evidence](local-performance-recovery.md)
for the verified 30-minute synthetic load and restore/upgrade gates.

The backend owns database transactions, admin, authentication, storage, APIs and
the outbox worker. The separately built storefront calls HTTP APIs. Its only
deployment settings are `BACKEND_URL`, public `STOREFRONT_ORIGIN`, and an optional
storefront-only `EDGE_PROXY_SECRET` for authenticated ingress client IPs; database,
storage, SMTP, authentication and Stripe secrets belong to the backend.

Email/SMS/verification configuration and migrations 0033–0034 are documented in
[notification integrations](notification-integrations.md). Telnyx credentials
stay on the backend; live SMS remains disabled. Restart after provider profile
configuration changes. Backend stop grace is 45 seconds so the 35-second drain
can complete bounded provider calls before closing pooled transports.

## Local development

Install with `pnpm install --frozen-lockfile`. Start dependencies with
`docker compose up -d postgres rustfs`, run `pnpm db:migrate` against the development
database, then run `pnpm dev:backend` and `pnpm dev:storefront` separately.
Use `http://localhost:3001` for `APP_URL`, `STOREFRONT_ORIGIN` and `BETTER_AUTH_URL`,
and `http://127.0.0.1:3000` for the storefront's `BACKEND_URL`. Customer pages and
`/admin` use the storefront origin. Optional Adminer uses port 9002 with
`docker compose --profile tools up -d adminer`; RustFS retains port 9001.

## Containers

`docker compose build backend storefront migrate` creates two application images
and an explicit migration job. Configure secrets and a public HTTPS origin, back
up and rehearse the upgrade on a restored copy, then execute
`docker compose --profile migration run --rm migrate`. Start applications with
`docker compose up -d backend storefront`. Only storefront is published; it proxies
API, authentication, admin and backend admin assets. Backend readiness is
`/api/health/ready`; liveness is `/api/health/live`.

Next.js compiles rewrite destinations at build time. If the backend hostname
changes, supply its origin as Docker build argument `BACKEND_URL` and use that
same value at runtime. Preserve `Set-Cookie` and browser `Origin` headers through
the public proxy. Callback URLs must use the configured public storefront origin.

Migrations never run during app startup. Deploy compatible additive schemas before
replacing application images. The worker runs only with backend. Rollback images
without deleting financial history, provider intents or active reservations.

The streaming API proxy strips client-supplied forwarding and IP headers.
Without a trusted edge client-IP contract, Better Auth can fall back to shared
per-path rate-limit buckets, and backend IP-based limits see the storefront
connection. This can throttle unrelated customers together. Before production,
configure a trusted edge that determines the actual client IP, removes incoming
spoofed IP headers, and delivers a verifiable trusted identity to the backend;
configure auth to use only that trusted source. The edge/provider is deployment
specific. Forwarding arbitrary `X-Forwarded-For` or `X-Real-IP` is unsafe and is
not an acceptable workaround.

## Card payments

Configure backend `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; register Stripe
events at public `/api/payments/stripe/webhook` for checkout completion, asynchronous
payment success and expiry. Redirects do not establish payment. Settlement uses
a signed durable inbox, authoritative provider retrieval and shared confirmation
transactions. Card checkout initially accepts the complete external balance;
orders with manual receipts require merchant review before card payment.

Owner refunds POST `/api/v1/admin/refunds/stripe` with an already authorized
`allocationId`. The backend derives amount and original payment source. Pending or
uncertain refunds retain their payout hold and retry with the same provider intent.
Uncertainty beyond the provider idempotency window requires merchant review.
Changed-order, mismatched and late payments remain in the durable review queue.
Authoritatively expired unpaid sessions release holds only for unchanged card-only
orders with no receipts or completed fulfillment. Manual-payment orders retain
their holds; ambiguous provider outcomes require review.

Run backend/storefront typecheck, builds, unit tests and `pnpm test:integration`
before deployment. Docker image startup, real Stripe/SMTP delivery, TLS and restore
verification require an operator acceptance run; local tests alone do not verify
external deployment configuration.

Run `pnpm test:storefront` for the production-build browser journeys across both
services. Its default selection includes `cross-service-storefront.spec.ts`,
`cross-service-i18n.spec.ts`, and `storefront-journey-updates.spec.ts`; the CI browser
job runs this command. The runner uses an isolated database, local SMTP inbox and
storage fixture. Customer requests use the storefront proxy and merchant actions
use a separate authenticated backend browser session.

The journeys cover payment evidence, actual-receipt recording, confirmation,
shipment and delivery, goods return approval/receipt and refund settlement;
registration and password reset follow links delivered to the local inbox.
Account history uses persisted orders, and saved-address/mixed-credit checkout
checks reservation, submission, capture and reopening from account history.
The synthetic lifecycle in `tests/unit/synthetic-order-lifecycle.test.ts` is a
domain simulation, not evidence of a browser or provider journey.

Local journey validation on 2026-10-09: the default `test:storefront` runner passed
all 10 browser tests after building both services in production mode. The 28
focused unit tests covering evidence route/origin boundaries and the relocated
domain simulation passed. TypeScript validation passed. The extended guest
journey exposed an evidence-upload origin rejection at the service boundary;
evidence endpoints now use the shared configured-origin guard, with regression
checks for missing, foreign and cross-site origins.

The disposable container boundary check uses `scripts/compose.smoke.yml` under
the separate project name `supastore-codex-smoke`, synthetic fixtures, and public
port 3097. After migrating and seeding that fixture, run
`node scripts/test-container-smoke.mjs` to verify catalog, cookie identity,
checkout, private tracking, CSRF, readiness and admin assets. Remove only that
fixture with `docker compose -p supastore-codex-smoke -f scripts/compose.smoke.yml down --volumes`.

Local validation on 2026-10-05: `docker compose config --quiet` and
`docker compose build backend storefront migrate` passed. The isolated fixture
applied the migration chain through 0029 and `node scripts/test-container-smoke.mjs`
passed readiness, catalog/product, cart cookie continuity, quote/order creation,
repeat-order idempotency, private order tracking, ownership and CSRF rejection,
and admin assets through the storefront proxy. Stopping its backend made public
readiness return 500. Runtime robots used the configured public sitemap origin.
The fixture was removed afterward. This was a short functional acceptance run;
external provider delivery and sustained load were not tested.

Initial serving image sizes were backend 340 MB and storefront 323 MB.
Migration runtime packaging was subsequently reduced from 1.54 GB to 241 MB by
bundling only PostgreSQL/Drizzle and SQL. It runs as a nonroot one-shot image.
