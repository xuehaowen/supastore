# Background processing

Outbox/SMS batches and housekeeping invoked by the dedicated pg-boss worker.

## When working here

Use durable leases and fenced acknowledgments. Provider I/O stays outside financial transactions; stale workers cannot overwrite reclaimed work.

## Where to start

- [housekeeping.ts](housekeeping.ts): Periodic retention and operational cleanup.
- [outbox.ts](outbox.ts): Claims and processes durable email delivery work.
- [sms.ts](sms.ts): Claims SMS work subject to channel and consent policy.

## Related paths and checks

- Composition: `src/infrastructure/queue/worker.ts` registers queue consumers; `scripts/worker.ts` runs them in a separate process.
- Checks: unit `outbox-worker.test.ts`, `outbox-retry.test.ts`, `housekeeping.test.ts`; integration `outbox-coordination.test.ts`.
- PostgreSQL notifications wake delivery/callback processing, with minute reconciliation as a backstop. Expiration jobs target individual resources, with a five-minute cleanup sweep. Housekeeping/threshold checks run hourly. Use `/api/health/worker` to check progress; app liveness alone does not prove it.

## More context

[Parent overview](../README.md)
