# Milky Bakery: two manual-payment instances

Launch direction confirmed by the owner on October 17, 2026: likely two separate instances, one for pickup and one for shipping, with manual payment initially. The configuration below supports that direction without adding multi-tenancy, a theme system or card-payment requirements. No live store was configured by this work.

## Isolation and public origins

Use one complete backend/storefront/database/storage stack per store, with a distinct Compose project name, environment file, public hostname and secrets. Store settings are database-wide: pointing both backends at one database would share fulfillment configuration rather than create two independent stores.

Use distinct hostnames, for example `pickup.example.com` and `shipping.example.com` (replace these examples with the actual domains). Do not distinguish stores only by different ports on the same hostname: browser cookies are scoped by hostname rather than port. Keep each public origin consistent across `STOREFRONT_ORIGIN`, `APP_URL` and `BETTER_AUTH_URL`, with HTTPS ingress routing to its storefront. Backend service DNS remains `http://backend:3000` inside each project's network.

Example values for **new installations**:

| Setting                            | Pickup instance              | Shipping instance              |
| ---------------------------------- | ---------------------------- | ------------------------------ |
| Compose project (`-p`)             | `milky-pickup`               | `milky-shipping`               |
| Secret environment file            | `/etc/supastore/pickup.env`  | `/etc/supastore/shipping.env`  |
| `POSTGRES_DB`                      | `milky_pickup`               | `milky_shipping`               |
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
docker compose --env-file /etc/supastore/pickup.env -p milky-pickup -f docker-compose.yml config --quiet
docker compose --env-file /etc/supastore/shipping.env -p milky-shipping -f docker-compose.yml config --quiet

docker compose --env-file /etc/supastore/pickup.env -p milky-pickup -f docker-compose.yml up -d postgres rustfs
docker compose --env-file /etc/supastore/shipping.env -p milky-shipping -f docker-compose.yml up -d postgres rustfs

docker compose --env-file /etc/supastore/pickup.env -p milky-pickup -f docker-compose.yml --profile migration run --rm migrate
docker compose --env-file /etc/supastore/shipping.env -p milky-shipping -f docker-compose.yml --profile migration run --rm migrate

docker compose --env-file /etc/supastore/pickup.env -p milky-pickup -f docker-compose.yml up -d backend storefront
docker compose --env-file /etc/supastore/shipping.env -p milky-shipping -f docker-compose.yml up -d backend storefront
```

Build the application and migration targets before these startup commands using the [deployment recipe](deployment-recipes.md). The root Compose recipe currently uses shared local `latest` image tags: record immutable image IDs before an update and release both instances deliberately. Compose project isolation does not create independent image versions or provide independent rollback tags. Existing containers keep their current image until replaced; build/recreation must not accidentally become an unplanned update of the other store.

Provision the owner separately for each store using the existing trusted terminal tooling, then use its admin UI:

| Admin configuration            | Pickup store                                                           | Shipping store                                               |
| ------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `/admin/settings/commerce`     | Enable pickup; disable shipping/local delivery                         | Enable shipping; disable pickup/local delivery               |
| Fulfillment details            | Add the intended pickup location and actual preparation/schedule rules | Add actual country/region/postal rates and destination rules |
| `/admin/setup#payment-methods` | Active manual receiving account with verified instructions             | Active manual receiving account with verified instructions   |
| Email                          | Configure delivery, publish required templates and verify it           | Configure delivery, publish required templates and verify it |

For the chosen manual-payment launch, leave `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` empty in both effective backend environments; the current application enables online payment from valid provider credentials rather than a separate manual-only switch. Do not enable Stripe accounts or offer card checkout until separately configured and accepted. Manual payment still requires checking actual funds before recording a receipt; an uploaded image is evidence rather than settlement. Transactional email and order recovery remain necessary.

Keep the location private in public copy and structured data. This work adds no public street address or LocalBusiness/Bakery markup. Review existing customer-facing pickup instructions as part of owner acceptance; no real location was supplied or changed.

## Stock and operations

These are independent stores: carts, orders, accounts, stock, credit, reports, settings and pause controls are separate. There is no cross-instance stock, catalog or account synchronization. Allocate stock separately before publishing products in both stores; do not assign the same physical units to both inventory pools. Reuse approved product content through the existing catalog tools where appropriate, without copying order/payment ledgers between stores.

Identify the store when reconciling its manual payment reference. Review payment, pickup/dispatch and failed-email queues in each instance. Pausing one instance does not pause the other. Keep a matching database/assets backup and restore record for each store.

Recovery settings now reach the actual backend container: `ENABLE_OUTBOX_WORKER=false` and `DISABLE_OUTBOUND_DELIVERY=true` can be set in the relevant environment file. Stop clients before restoring, then start the restored environment with suppression applied through container recreation. Editing the environment file followed only by `docker compose restart` does not apply new environment variables. Follow [cold restore](playbooks/disaster-recovery.md), reconcile before resuming delivery, and avoid changing the other instance's environment or volumes.

## Local verification and remaining acceptance

The root Compose recipe was rendered for two explicitly named synthetic projects. Both database/storage pairs ran concurrently with distinct names, ports, networks and volumes; custom database health checks passed. A marker written in the pickup database was absent from the shipping database. Identical bucket/object keys retained different contents in the two storage services. Only those test projects/volumes were removed afterward.

`tests/browser/manual-launch-profiles.spec.ts` rehearses pickup-only and shipping-only configurations in disposable services at 375px: exactly one fulfillment choice, only relevant address/location fields, manual payment instructions, unpaid order placement, one exact synthetic receipt, confirmation and completed pickup/shipment delivery. The test restores configuration afterward. It does not transfer real money. Both profiles pass and are included in the normal CI browser selection.

This verifies same-host dependency isolation and each configured sales workflow separately. It is not a simultaneous two-store application load test or proof of KVM 2 capacity. Actual domains, secrets, receiving instructions, pickup rules, shipping rates, real catalog/photographs, email delivery, provider reconciliation and matching backups still require owner/target acceptance. Performance optimization remains deferred.
