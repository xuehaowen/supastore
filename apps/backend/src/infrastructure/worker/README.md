# Background processing

Outbox/SMS batches and housekeeping invoked by backend instrumentation.

## When working here

Use durable leases and fenced acknowledgments. Provider I/O stays outside financial transactions; stale workers cannot overwrite reclaimed work.

## Where to start

- [housekeeping.ts](housekeeping.ts): Periodic retention and operational cleanup.
- [outbox.ts](outbox.ts): Claims and processes durable email delivery work.
- [sms.ts](sms.ts): Claims SMS work subject to channel and consent policy.

## Related paths and checks

- Composition: `src/instrumentation.ts` enables the loop only on Node runtime with `ENABLE_OUTBOX_WORKER=true`.
- Checks: unit `outbox-worker.test.ts`, `outbox-retry.test.ts`, `housekeeping.test.ts`; integration `outbox-coordination.test.ts`.
- A nonoverlapping five-second tick processes outbox, SMS and callbacks; Stripe reconciliation/upload cleanup run about each minute, housekeeping/threshold checks about hourly. Long batches alter elapsed cadence. Use `/api/health/worker` to check progress; app liveness alone does not prove it.

## More context

[Parent overview](../README.md)
