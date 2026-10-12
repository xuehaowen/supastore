# Deployment recipes

Supastore runs as two standalone Next.js services: a public storefront and a
private backend. PostgreSQL and S3-compatible storage retain application data.
The backend also runs the outbox worker when explicitly enabled. No Redis or
external cache is required.

## Docker Compose

Follow [two-service deployment](two-service-deployment.md) for environment
configuration, PostgreSQL upgrades, public origins and trusted ingress.

1. Copy `.env.example` to `.env` and configure unique secrets, database/storage
   credentials and the public HTTPS storefront origin.
2. Build the explicit targets with
   `docker compose build backend storefront migrate`.
3. Start PostgreSQL and object storage with
   `docker compose up -d postgres rustfs`.
4. Back up an existing installation and rehearse recovery before applying
   `docker compose --profile migration run --rm migrate`.
5. Start the application with `docker compose up -d backend storefront`.
6. Verify `/en`, `/api/health/ready`, admin authentication and a controlled
   checkout through the public HTTPS origin.

Publish only the storefront through the HTTPS ingress. Keep the backend,
database and private storage interfaces inaccessible from the public network.
Configure the trusted client-IP contract described in the deployment guide;
unverified forwarding headers must not determine identity or rate limits.

## Other container platforms

Create separate services from Dockerfile targets `backend` and `storefront`,
plus a one-shot job from target `migrations`. Both application containers listen
on port 3000. Route public traffic to the storefront and provide its private
backend origin using the `BACKEND_URL` build argument and runtime variable.

Run the migration job explicitly before application replacement. Configure
backend database/provider/storage credentials and the same public HTTPS origin
for `APP_URL`, `BETTER_AUTH_URL` and `STOREFRONT_ORIGIN`. Give the storefront only
its backend connection, public origin and trusted `EDGE_PROXY_SECRET` settings.
Supervise the enabled backend
worker and verify its health separately from basic application liveness.

Use `/api/health/ready` for readiness and `/api/health/live` for liveness. Preserve
cookies, request bodies and browser origins through ingress. Validate provider
callbacks against the public origin before enabling delivery.

## Resource sizing and recovery

The images default to a 256 MiB Node heap per application process. Heap size is
not total process or container memory. Size PostgreSQL, storage and the host
separately, then measure representative sustained traffic on the target host.
See [current verification evidence](maintenance-hardening-evidence-2026-10-11.md)
for the measured fixture limits; those measurements are not production ceilings.

For an existing store, use the [disaster recovery playbook](playbooks/disaster-recovery.md)
and retain matching database and object-storage backups. Restore with outbound
delivery suppressed in the actual service configuration. Keep immutable image
identifiers for rollback, and preserve financial history when rolling back the
application. A real production-copy drill requires access to that store's backup.
