# Operator cookbook

These recipes cover the current source checkout. Run from the repository root.
Use [commands](commands.md) for the complete command inventory and environment
rules, [merchant operations](merchant-operations.md) for business tasks, and
[two-service deployment](two-service-deployment.md) for infrastructure details.
Examples use synthetic identities and reserved domains; replace them with the
intended configuration. Deployment-specific credentials stay outside Git.

The [isolated rehearsal](cookbook-acceptance-2026-10-18.md) records first-owner
provisioning, password setup and demo browser/storage checks, including the
internal-origin redirect correction and the limits of that evidence.
The later [clean-install and console checks](installation-storage-acceptance-2026-10-19.md)
verify a cache-free Linux dependency install and the pinned RustFS console steps.
Use the [production worksheet](launch-acceptance.md) and
[human pilot script](merchant-pilot.md) for the remaining real-world gates.

## Local demo store

Prerequisites: Node >=22.13.0, pnpm 11.0.9, Docker Compose, and unused local
ports 3000/3001, 5432 and 9000/9001. This recipe creates synthetic data only.

1. Run `pnpm install --frozen-lockfile`. Copy `.env.example` to `.env`
   (`cp .env.example .env` in Bash or `Copy-Item .env.example .env` in PowerShell).
2. Generate each secret separately with
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   Fill `POSTGRES_PASSWORD`, `APP_DATABASE_PASSWORD`, `ADMIN_SETUP_SECRET`,
   `BETTER_AUTH_SECRET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`.
   Update both database URLs to match the selected database and role passwords.
   Retain localhost public origin :3001 and private backend :3000.
3. Set `EMAIL_PROVIDER=disabled`, `DISABLE_OUTBOUND_DELIVERY=true` and
   `ENABLE_OUTBOX_WORKER=false` in the local demo environment.
4. Start PostgreSQL/RustFS and apply migrations:

```bash
docker compose up -d postgres rustfs
pnpm run db:migrate
```

5. Follow [RustFS console setup](#rustfs-console-setup) below to create the
   configured buckets and browser CORS rule. Keep private evidence inaccessible
   anonymously. See [storage access](two-service-deployment.md#storage-access)
   for browser-reachable signed endpoints.
6. Seed the dedicated demo database. This explicit Node invocation works in
   Bash and PowerShell. It requires `MIGRATION_DATABASE_URL` and uses that
   migration-capable connection only in its child because the seed also runs
   migrations; the app continues using its restricted runtime URL:

```bash
node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx --input-type=module -e "process.env.DEMO_SEED='true'; process.env.DATABASE_URL=process.env.MIGRATION_DATABASE_URL; await import('./scripts/seed-demo.ts')"
pnpm run dev
```

Expected: storefront `http://localhost:3001/en`, admin
`http://localhost:3001/admin/login`, and backend database readiness at
`http://localhost:3000/api/health/ready`. New synthetic owner:
`owner@example.test` / `AdminSetupSecret123!`, unless `DEMO_OWNER_PASSWORD` was
overridden. Test a catalog image and private evidence upload as well as browsing;
database readiness alone does not verify storage. Keep demo delivery suppressed.
Common anonymous catalog listings use 30-second revalidation. After a catalog
change, allow revalidation and reload, or use a filtered search (for example
`/en?q=studio`) to check the current catalog without that listing cache.

Alternative: `pnpm run db:init supastore_dev` creates/preserves, migrates and
seeds a named local database using administrator credentials. It does not change
the URLs in `.env` or create storage buckets. Point the app at that database
before starting it. Neither demo tool belongs in real merchant provisioning.

New databases use UTF8 with PostgreSQL 18's builtin `PG_UNICODE_FAST` locale.
Existing databases retain their settings; see [database locale](database-locale.md)
for inspection and migration guidance.

## RustFS console setup

With the supplied Compose configuration, open `http://localhost:9001` (or
`S3_CONSOLE_PORT`) from the operator machine. Sign in using **Account** =
`S3_ACCESS_KEY_ID` and **Key** = `S3_SECRET_ACCESS_KEY`. These are the existing
storage credentials, not a new console account.

1. Select **Browser**, then **Create Bucket**. Enter the value of
   `S3_BUCKET_PUBLIC` (default `supastore-public`) and select **Create**.
2. Repeat for `S3_BUCKET_PRIVATE` (default `supastore-private`). Verify both
   names appear in the bucket list with **Access Policy: Private**. The word
   "public" in the catalog bucket's name does not require anonymous access;
   catalog images are served through the application's asset endpoint.
3. Open **Settings** for the evidence bucket. Under **Access & Sharing**, choose
   **Edit Bucket CORS**, enable **Bucket CORS**, and replace the default wildcard
   origins with the actual storefront origin. For the local demo use:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["http://localhost:3001"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 300
    }
  ]
}
```

4. Select **Save CORS**. Confirm the settings show **Configured**, the exact
   allowed origin and `GET, PUT, HEAD`. For deployment, replace the local origin
   with the intended public HTTPS storefront origin before saving.
5. Verify a catalog image and private evidence upload through the app. A signed
   evidence request should work, while an unsigned request for the private
   object must fail. CORS controls browser origins; it does not replace object
   authorization or make the bucket public.

The [console rehearsal](installation-storage-acceptance-2026-10-19.md#rustfs-console-and-access)
includes screenshots and verifies a permitted preflight and rejection of an
unlisted origin. Keep the console on loopback/private networking; public
storage API access, if needed, uses the separately configured HTTPS endpoint.

## Provision the first owner

Use a migrated real-store database without demo data and a trusted terminal with
the intended backend environment. The existing recovery tool creates a verified
user if needed and creates/restores an active **owner** membership; it therefore
also supplies initial owner access. It is not a staff invitation command.
Check `DATABASE_URL` and the public origin before running it. It loads `.env`
and `.env.local`, not production-specific files; supply deployment values in the
terminal environment when operating a deployed store.

```bash
pnpm run auth:recover-owner --email=owner@example.test --baseUrl=https://shop.example.test
```

Expected: owner ID, expiry and a single-use login URL valid for 15 minutes.
Treat the output as an access credential. Open the URL privately through the
configured storefront; redemption establishes a staff session and redirects to
`/admin`. Open `/admin/setup`, enter the store name and `ADMIN_SETUP_SECRET`,
and complete first-store initialization. Then configure currency/precision,
timezone, contact details, fulfillment, payment methods and notification profiles.
Set currency before the first order; it locks afterward.

The CLI does not create a reusable password. To establish ordinary password
sign-in, configure working transactional email and an enabled backend worker,
then request a password-reset link from `/en/account` using the owner email.
Complete the reset from that mailbox with a 12–128-character password. Resetting
credentials revokes staff and customer sessions. Sign in at `/admin/login`, then
sign out and confirm private access is removed. For an existing owner, the same
CLI restores access without rerunning completed store bootstrap.

Expected completion: normal owner sign-in works, the setup checklist persists,
and customer registration alone still grants no merchant access. No observed
human merchant pilot is implied by this documented sequence.

## Verify a change

Install Chromium once with `pnpm exec playwright install chromium`. Run the main
verification chain, then error coverage separately:

```bash
pnpm run test:all
pnpm run test:errors
```

For a cross-service change run `pnpm run test:storefront`; for container/runtime
changes run `pnpm run test:containers`. These build and mutate disposable
fixtures. `test:browser:existing` instead targets an already running store and
must receive a disposable synthetic target. Choose focused tests using the
[command reference](commands.md#formatting-types-and-tests).

Expected: commands exit zero and no relevant tests are unexpectedly skipped.
Retain failure traces before rerunning. If native Windows SWC cache validation
blocks a build, use the Linux Docker acceptance runner and retain the native
failure as an environment limitation; do not weaken shared-cache permissions.
These checks do not send a real payment or establish recipient email delivery.

## Deploy or upgrade with Compose

Prerequisites: configured secrets, versioned image tags, reachable public origin,
private backend/database network, storage buckets and verified ingress. For an
existing store take matching database/assets backups and rehearse migrations on
a restored copy first. See [deployment recipes](deployment-recipes.md) for the
authoritative deployment sequence and [independent releases](independent-store-instances.md#independent-releases-and-rollback)
for per-store image selection.

```bash
docker compose build backend storefront migrate
docker compose up -d postgres rustfs
docker compose --profile migration run --rm migrate
docker compose up -d backend storefront
docker compose ps
```

Run each next step only after the previous one succeeds. For separate stores,
use the same explicit `--env-file` and `-p` project name on **every** Compose
command, as shown in the independent-store guide. Compose doesn't seed a store
or run migrations automatically. Provision the first owner from a trusted
checkout/terminal with access to the deployment database; the standalone image
does not provide the pnpm/tsx administrative toolchain.

Verify public `/en`, `/admin/login` and `/api/health/ready`, then check worker
health at `/api/health/worker`. Worker
execution requires `ENABLE_OUTBOX_WORKER=true` and a continuously running
worker service; see [background jobs](background-jobs.md). Compose allows 45 seconds for the 35-second shutdown drain.

Verify a controlled purchase, image/evidence upload, confirmation, fulfillment
and refund in the intended acceptance environment. Production needs independent
payment and delivery evidence. If `BACKEND_URL` or
`NEXT_PUBLIC_ANALYTICS_ENDPOINT` changes, rebuild the storefront. An application
image rollback does not reverse database migrations; use compatible images or
a reviewed forward repair, preserving financial and provider history.

## Back up and rehearse a cold restore

Use Bash (WSL/Linux on Windows), compatible PostgreSQL clients, Node and
`sha256sum`. Export `DATABASE_URL` for the source with backup privileges, choose
a new/empty directory, then run:

```bash
bash scripts/backup.sh ./backups/store-snapshot
```

Expected: `database.dump`, `database.sql`, `SHA256SUMS` and
`backup-manifest.json`. Back up matching object-storage data and configuration
separately; the manifest explicitly records that assets need a separate backup.
For a consistent recovery point, coordinate database and asset snapshots.

Provision an **isolated** recovery database and separate restored asset buckets.
Set `RECOVERY_DATABASE_URL` to that database in the Bash session and stop every
client connected to it. Confirm the target before the destructive restore:

```bash
export DISABLE_OUTBOUND_DELIVERY=true
export ENABLE_OUTBOX_WORKER=false
export RESTORE_COLD_CONFIRMED=true
bash scripts/restore.sh ./backups/store-snapshot "$RECOVERY_DATABASE_URL"
```

Expected: checksum verification, cold-client preflight, restore and migrations
all succeed. Configure the same delivery/worker flags in the **actual recovery
service environment before startup**; a child shell cannot modify running
services. Verify financial history, public images, private evidence access and
rejection of anonymous private access. Reconcile all uncertain delivery/payment
outcomes before enabling workers or returning a recovered store to service.
Use the [disaster recovery](playbooks/disaster-recovery.md) and
[outbox reconciliation](playbooks/outbox-reconciliation.md) playbooks for the
record-by-record decisions. Never delete existing volumes as an upgrade recipe.

## Diagnose a failed operation

| Symptom                              | First checks                                                                        | Expected next step                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| App won't start                      | Required secrets, database URLs, matching public origins; backend logs              | Correct the reported configuration; restart the affected service                       |
| Readiness returns 503                | `/api/health/live`, database reachability and migrations                            | Restore DB connectivity; readiness only checks a DB query                              |
| Admin unavailable through storefront | Build-time/runtime `BACKEND_URL`, backend health and asset rewrites                 | Rebuild when the backend destination changes                                           |
| Email stays queued                   | Worker enabled/healthy, delivery suppression, configured provider, delivery history | Investigate the recorded failure/uncertainty before retrying                           |
| Provider configuration unclear       | `pnpm run check:services`; optionally `pnpm run check:services --connect`           | Configuration report versus authenticated connectivity; neither proves message receipt |
| Image/evidence upload fails          | Buckets, CORS, `S3_PUBLIC_ENDPOINT`, browser storage reachability                   | Correct storage configuration; do not rewrite a signed URL's host                      |
| Owner locked out                     | Explicit target DB and first-owner/recovery recipe above                            | Redeem a fresh recovery URL; completed bootstrap remains completed                     |
| Analytics absent                     | Build-time HTTPS endpoint, explicit consent, endpoint response                      | Rebuild if needed; failed purchase measurements can retry on a later visit             |
| Browser fixture cannot bind/start    | Competing fixture ports, Chromium/native PostgreSQL prerequisites                   | Stop the conflicting fixture or fix prerequisites; retain logs                         |

For deployment configuration, migration history and public security headers, run
`pnpm check:deployment --connect` from the matching release checkout. See
[security deployment](security-deployment.md) for the read-only database credentials
and manual ingress checks required alongside its report.

Use a request ID from the visible error and sanitized application logs to trace
an uncertain mutation. Inspect the existing order before submitting another
purchase or payment. Keep authoritative financial reports separate from optional
browser conversion analytics.
