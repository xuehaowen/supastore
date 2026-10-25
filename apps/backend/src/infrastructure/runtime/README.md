# Runtime lifecycle

Graceful shutdown and tracked in-flight work.

## When working here

Coordinate worker stop and bounded provider drain with container grace periods. Do not abandon uncertain external effects as if nothing happened.

## Where to start

- [shutdown.ts](shutdown.ts): Tracks in-flight work and drains it during shutdown.
- [worker.ts](worker.ts): Independent wall-clock job schedules, per-job in-flight guards, retry diagnostics and process-local health state. Disabled/stalled/degraded workers are not reported as healthy database connections.

## Related paths and checks

- Backend instrumentation registers the notification cleanup and tracks provider work.
- Checks: unit `shutdown.test.ts` and `health.test.ts`.
- Shutdown drains for 35 seconds; backend Compose gives 45 seconds of stop grace. Keep process and container budgets consistent with provider deadlines.

## More context

[Parent overview](../README.md)
