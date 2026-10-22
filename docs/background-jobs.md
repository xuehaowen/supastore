# Background jobs and scheduled work

The dedicated Node worker uses pg-boss 12.38.0 and the same PostgreSQL database as the backend. Migration `0044_scheduled_work.sql` installs its pinned schema and queues. Web processes never run job consumers or migrate the queue schema. The application role receives queue DML and schema usage permissions through the normal migration role-provisioning script; it does not receive schema creation or ownership.

## Starting and upgrading

1. Stop the old backend version before switching workers; do not deliberately run the previous in-process loop alongside this worker.
2. Back up and apply `pnpm db:migrate` with migration credentials, including the application role configuration. This also grants queue permissions to the runtime role.
3. Run `pnpm dev:backend` or `pnpm dev` locally. With `ENABLE_OUTBOX_WORKER=true`, these launch the worker as a supervised sibling process.
4. For independent supervision use `pnpm dev:worker` or `pnpm start:worker`; disable the launcher's automatic worker with `ENABLE_OUTBOX_WORKER=false` in that launcher's environment, and set it to true for the separate worker.
5. Docker Compose includes a separate `worker` build target/service. Build and deploy it together with backend and storefront. `WORKER_IMAGE` can specify a release tag/digest.

The worker requires a continuously running process and a session-mode database connection. `LISTEN/NOTIFY` wakes consumers, while polling and periodic reconciliation recover missed notifications. Delayed jobs are eligible at their scheduled timestamp; worker availability and provider latency can delay execution. This is not an exact recipient delivery-time guarantee.

`ENABLE_OUTBOX_WORKER=false` leaves a container worker deliberately idle, including maintenance. Its container probe accepts that explicit disabled state. `DISABLE_OUTBOUND_DELIVERY=true` suppresses sends while preserving provider callback reconciliation and cleanup. Restore/recovery procedures must configure both values appropriately before restarting services.

## Scheduling and notification delivery

`scheduled_actions` stores the action identity, queue job ID/generation, target entity, intended time, expiration and completion/cancellation status. Action changes and pg-boss inserts/cancellations share the caller's Drizzle transaction through pg-boss's supported adapter. The producer has a separate two-connection pool so a scheduling transaction cannot starve its own startup when `DB_POOL_MAX=1`. Queue consumers use a separate four-connection pool in addition to the worker's application pool.

Confirmed pickup orders schedule a reminder `PICKUP_REMINDER_LEAD_MINUTES` before the pickup start (default 180, range 0–10080). Local date/time is converted using the slot timezone. Ambiguous or nonexistent daylight-saving times are rejected. A reminder whose intended time is already past becomes immediately eligible if pickup has not started; reminders expire at pickup start. SMS quiet hours may defer a reminder until it expires, in which case it is suppressed.

Creation, confirmation and rescheduling update the reminder transactionally. Cancellation and completion cancel pending reminders. The handler locks the order and checks its current state, slot, action generation and expiration. It materializes an ordinary notification only when due, preserving the existing outbox ordering. Submission checks the booking and generation again so changes after materialization suppress stale messages. Existing confirmed future pickups are backfilled in batches of 100 at startup and every five minutes.

The outbox remains authoritative for consent, ordering, attempts, leases, uncertain provider outcomes and delivery receipts. Queue retries do not authorize blindly repeating uncertain external sends. Notification attempt retries keep the existing six-attempt policy. Queue execution failures have a separate bounded backoff policy (up to eight retries).

`event_deliveries.scheduled_for` records the original intended time; `retry_after` records next-attempt eligibility. `submitted_at` records observed provider acceptance, and `delivered_at` records the first observed confirmed delivery event, when the provider supports receipts. Missing delivery timestamps mean delivery is unconfirmed.

## Resource expiration

Payment upload staging files, temporary evidence candidates and unattached catalog images receive durable expiration jobs. Removed/replaced catalog images reschedule their jobs for immediate eligibility. Cleanup rechecks expiration, attachment/reference state and active leases before deleting. Storage calls occur outside database transactions. Successful staging/candidate deletions are recorded to avoid rescanning completed work; retries can safely repeat deletion after a crash.

A five-minute sweep processes bounded batches of 100 payment intents, 100 temporary candidates and 100 catalog images to recover missed or previously failed cleanup. Active, attached assets are preserved. Application access/finalization checks enforce expiration independently of physical deletion. Object storage is not guaranteed to be purged at the exact timestamp during downtime or outages.

## Operations

The worker writes a PostgreSQL heartbeat every 15 seconds. `/api/health/worker` reads persisted heartbeats, delivery counts, ready/failed queue counts and oldest overdue job age. No heartbeat within 60 seconds is stalled; retained failed jobs, current task failures or a due-job age over 60 seconds are degraded. Web readiness remains independent. A healthy web process does not establish worker health.

Inspect failed pg-boss jobs and `scheduled_actions` before retrying with pg-boss APIs. Correct the dependency/configuration first. Failed queue output contains bounded failure codes rather than raw provider or SQL exceptions. Wrapped database error codes now remain visible through the application's safe diagnostic logger. Retained failed jobs continue to degrade health until an operator resolves/retries/removes them. Notification `review` decisions still require the existing reconciliation workflow.

Shutdown stops subscriptions and claims, allows up to 35 seconds for queue work to drain, closes provider transports/pools and removes the heartbeat. The process keeps a 40-second forced-exit deadline if cleanup fails; Compose allows a 45-second grace period. Unfinished work remains recoverable through queue and notification leases.
