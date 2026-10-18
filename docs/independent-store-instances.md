# Independent store instances

This optional deployment recipe uses two independent stores: one pickup-only and one shipping-only, with manual payment. It does not add multi-tenancy or require card payments. Choose this topology only when separate catalog, inventory, customer accounts and order histories are appropriate.

## Private verification and domain layout

Application verification can use Docker locally or on a private server before
connecting a public domain. Public DNS is not a prerequisite for that stage.
Use operator-supplied hostnames and deployment configuration; the examples below
use reserved example domains rather than a merchant's actual domain.

The two-instance commands below assume separate hostnames, not path prefixes.
Neither Next.js application currently configures `basePath`; storefront admin
rewrites and asset paths start at the origin root. A reverse proxy that only
strips `/pickup` or `/shipping` does not establish working links, assets,
authentication, guest-order cookies or SEO for independent stores. Do not treat
that proposed public layout as supported or accepted yet.

One instance already supports enabling pickup and shipping together, sharing
catalog, inventory, customer accounts and orders. This is the recommended
launch configuration if both methods serve the same business and stock pool.
If independent stores are required, separate hostnames match the existing
deployment model; using the proposed paths instead requires explicit routing,
cookie/session isolation and acceptance work. Each variant currently has one
price; enabling both methods does not provide fulfillment-specific product
prices or availability rules.

For two-instance browser verification, use distinct test hostnames resolving to
the Docker host rather than two ports on `localhost`, since ports do not isolate
cookies. VPS verification can use SSH tunnels to loopback-bound storefront
ports and locally resolved test hostnames. It still needs the actual SSH alias
and an agreed test configuration. Use separate test data and keep outbound
delivery suppressed until an approved recipient is available.

Passing this private Docker stage establishes application behavior only. Real
domain HTTPS, secure cookies, canonical/sitemap origins and ingress remain a
separate acceptance stage before public selling; they do not block private
Docker verification.

## Isolation and public origins

Use one complete backend/storefront/database/storage stack per store, with a distinct Compose project name, environment file, public hostname and secrets. Store settings are database-wide: pointing both backends at one database would share fulfillment configuration rather than create two independent stores.

Use distinct hostnames, for example `pickup.example.com` and `shipping.example.com` (replace these examples with the actual domains). Do not distinguish stores only by different ports on the same hostname: browser cookies are scoped by hostname rather than port. Keep each public origin consistent across `STOREFRONT_ORIGIN`, `APP_URL` and `BETTER_AUTH_URL`, with HTTPS ingress routing to its storefront. Backend service DNS remains `http://backend:3000` inside each project's network.

Example values for **new installations**:

| Setting                            | Pickup instance              | Shipping instance              |
| ---------------------------------- | ---------------------------- | ------------------------------ |
| Compose project (`-p`)             | `store-pickup`               | `store-shipping`               |
| Secret environment file            | `/etc/supastore/pickup.env`  | `/etc/supastore/shipping.env`  |
| `POSTGRES_DB`                      | `store_pickup`               | `store_shipping`               |
| `POSTGRES_PORT`                    | `5432`                       | `5433`                         |
| `S3_API_PORT`                      | `9000`                       | `9100`                         |
| `S3_CONSOLE_PORT`                  | `9001`                       | `9101`                         |
| `ADMINER_PORT` (optional tools)    | `9002`                       | `9102`                         |
| `PORT` (storefront ingress target) | `3000`                       | `3002`                         |
| Public origin                      | `https://pickup.example.com` | `https://shipping.example.com` |

Generate independent database/application-role, authentication, bootstrap, storage and edge secrets. Keep secret files outside the repository and restrict their access. When using host-side backup/operator scripts, update their database URLs and storage endpoints to match the selected instance; changing `POSTGRES_DB` does not rewrite an existing `DATABASE_URL`.

Compose scopes container names, volumes and networks by the explicit project name. Dependency ports remain bound to loopback. The same internal database/storage ports and bucket names can be used because the services are independent. Each storage instance still needs its public/private buckets configured according to the deployment recipe. Never share a live data volume between the two stacks.

For an existing installation, retain its current project name and inspect actual database mounts before changing deployment configuration. Container-name changes do not migrate data. Back up and verify a restored copy first; do not use `down --volumes` to migrate a real store. The PostgreSQL 18 volume notes in [two-service deployment](two-service-deployment.md) still apply.

## Deploy and configure each store

From the repository, use the explicit environment file and project for **every** operation:

```sh
docker compose --env-file /etc/supastore/pickup.env -p store-pickup -f docker-compose.yml config --quiet
docker compose --env-file /etc/supastore/shipping.env -p store-shipping -f docker-compose.yml config --quiet

docker compose --env-file /etc/supastore/pickup.env -p store-pickup -f docker-compose.yml up -d postgres rustfs
docker compose --env-file /etc/supastore/shipping.env -p store-shipping -f docker-compose.yml up -d postgres rustfs

docker compose --env-file /etc/supastore/pickup.env -p store-pickup -f docker-compose.yml --profile migration run --rm migrate
docker compose --env-file /etc/supastore/shipping.env -p store-shipping -f docker-compose.yml --profile migration run --rm migrate

docker compose --env-file /etc/supastore/pickup.env -p store-pickup -f docker-compose.yml up -d backend storefront
docker compose --env-file /etc/supastore/shipping.env -p store-shipping -f docker-compose.yml up -d backend storefront
```

Build the application and migration targets before these startup commands using the [deployment recipe](deployment-recipes.md). Select `BACKEND_IMAGE`, `STOREFRONT_IMAGE` and `MIGRATION_IMAGE` independently in each instance's environment file. Empty application references preserve the local `latest` defaults; an empty migration reference preserves the project-specific migration tag. For releases, use versioned tags that are never overwritten or verified registry digests. Project isolation alone does not pin versions.

## Independent releases and rollback

Treat backend, storefront and migration images as a tested release set. These example values are illustrative tags to build or replace with actual verified image references:

```dotenv
BACKEND_IMAGE=supastore-backend:release-20261017-a
STOREFRONT_IMAGE=supastore-storefront:release-20261017-a
MIGRATION_IMAGE=supastore-migrate:release-20261017-a
```

Building from a chosen checkout requires writable tag names, not digest references:

```sh
docker compose --env-file /etc/supastore/pickup.env -p store-pickup -f docker-compose.yml --profile migration build backend storefront migrate
```

When using prebuilt registry images, pull and verify the approved digests instead. Before changing running services, inspect the effective selection without printing environment secrets:

```sh
docker compose --env-file /etc/supastore/pickup.env -p store-pickup -f docker-compose.yml --profile migration config --images
```

Confirm each selected image is already present locally and matches the approved release, and record its immutable image ID/registry digest plus the previous release and database schema version. Stop if any selected image is missing or unverified. Back up and rehearse on an isolated copy before migrating an existing store. Apply only the approved forward-compatible migration image, then replace backend before storefront:

```sh
docker compose --env-file /etc/supastore/pickup.env -p store-pickup -f docker-compose.yml --profile migration run --rm --pull never migrate
docker compose --env-file /etc/supastore/pickup.env -p store-pickup -f docker-compose.yml up -d --wait --no-deps --no-build --pull never backend
docker compose --env-file /etc/supastore/pickup.env -p store-pickup -f docker-compose.yml up -d --wait --no-deps --no-build --pull never storefront
```

The shipping environment file and project are not part of those commands. It can continue selecting the previous release. Do not overwrite its version tags while building the pickup candidate. Do not use `--build` during service replacement or rollback.

To roll back pickup, select the previously verified image set in **its** environment file, verify compatibility with the current database, then replace storefront before backend using the same `up --wait --no-deps --no-build --pull never` options. Do not run reverse migrations or restore an older database to undo an application upgrade: financial history and real payment outcomes must remain intact. A rollback that is incompatible with the current schema is not available merely because an older image exists; pause new orders and resolve compatibility instead. Validate order access, worker health and the intended manual-payment path after replacement.

This selection mechanism does not automatically verify image provenance, schema compatibility, health of the other store or a target-host rollout. Those remain operator acceptance checks.

Provision the owner separately for each store using the existing trusted terminal tooling, then use its admin UI:

| Admin configuration            | Pickup store                                                           | Shipping store                                               |
| ------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `/admin/settings/commerce`     | Enable pickup; disable shipping/local delivery                         | Enable shipping; disable pickup/local delivery               |
| Fulfillment details            | Add the intended pickup location and actual preparation/schedule rules | Add actual country/region/postal rates and destination rules |
| `/admin/setup#payment-methods` | Active manual receiving account with verified instructions             | Active manual receiving account with verified instructions   |
| Email                          | Configure delivery, publish required templates and verify it           | Configure delivery, publish required templates and verify it |

For the chosen manual-payment launch, leave `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` empty in both effective backend environments; the current application enables online payment from valid provider credentials rather than a separate manual-only switch. Do not enable Stripe accounts or offer card checkout until separately configured and accepted. Manual payment still requires checking actual funds before recording a receipt; an uploaded image is evidence rather than settlement. Transactional email and order recovery remain necessary.

Publish only merchant-approved business details. Private operational addresses must not be reused in public copy or structured data. Review customer-facing pickup instructions separately; the current implementation adds no LocalBusiness markup.

## Stock and operations

These are independent stores: carts, orders, accounts, stock, credit, reports, settings and pause controls are separate. There is no cross-instance stock, catalog or account synchronization. Allocate stock separately before publishing products in both stores; do not assign the same physical units to both inventory pools. Reuse approved product content through the existing catalog tools where appropriate, without copying order/payment ledgers between stores.

Identify the store when reconciling its manual payment reference. Review payment, pickup/dispatch and failed-email queues in each instance. Pausing one instance does not pause the other. Keep a matching database/assets backup and restore record for each store.

Recovery settings now reach the actual backend container: `ENABLE_OUTBOX_WORKER=false` and `DISABLE_OUTBOUND_DELIVERY=true` can be set in the relevant environment file. Stop clients before restoring, then start the restored environment with suppression applied through container recreation. Editing the environment file followed only by `docker compose restart` does not apply new environment variables. Follow [cold restore](playbooks/disaster-recovery.md), reconcile before resuming delivery, and avoid changing the other instance's environment or volumes.

## Local verification and remaining acceptance

The root Compose recipe was rendered for two explicitly named synthetic projects. Both database/storage pairs ran concurrently with distinct names, ports, networks and volumes; custom database health checks passed. A marker written in the pickup database was absent from the shipping database. Identical bucket/object keys retained different contents in the two storage services. Only those test projects/volumes were removed afterward.

`tests/browser/manual-launch-profiles.spec.ts` rehearses pickup-only and shipping-only configurations in disposable services at 375px: exactly one fulfillment choice, only relevant address/location fields, manual payment instructions, unpaid order placement, one exact synthetic receipt, confirmation and completed pickup/shipment delivery. The test restores configuration afterward. It does not transfer real money. Both profiles pass and are included in the normal CI browser selection.

This verifies same-host dependency isolation and each configured sales workflow separately. It is not a simultaneous two-store application load test or proof of target host capacity. Actual domains, secrets, receiving instructions, pickup rules, shipping rates, real catalog/photographs, email delivery, provider reconciliation and matching backups still require owner/target acceptance. Performance optimization remains deferred.

Release-selection follow-up: Docker Compose's actual parser resolves all three explicit image references independently for pickup and shipping, including the migration profile and default fallback. Changing the pickup candidate and selecting its previous release leaves shipping image references and pickup volume definitions unchanged. This is a configuration-only check with illustrative references; no sample release image was built, pulled or deployed, and no live rollback was performed. Five deployment regressions and the full 1,182-test unit/library suite pass; canonical types, lint and formatting pass. Existing 45-test browser acceptance is retained because this follow-up changes no application code. [Release-selection evidence](benchmarks/2026-10-17-instance-releases.json).
