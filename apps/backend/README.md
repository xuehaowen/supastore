# Backend application

This Next.js application owns merchant admin, authentication, APIs, database access, storage and the outbox worker. Its implementation lives in `src`, with its own Next.js and TypeScript configuration.

## When working here

Run `pnpm dev:backend` from the workspace root. The launcher reads the existing root `.env` for this service without modifying it. Shared UI, language helpers, shipping helpers and public HTTP contracts live under `packages`.

## Where to start

- [Backend launcher](../../scripts/backend.mjs): Sets the backend service role and starts this application.
- [Source overview](src/README.md): Backend implementation.

## More context

[Parent overview](../README.md) · [Deployment guide](../../docs/two-service-deployment.md)
