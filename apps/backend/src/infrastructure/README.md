# Backend integrations

Database, authentication, storage, providers, HTTP security, workers and runtime setup.

## When working here

Secrets stay on backend. Implement application ports at this edge instead of importing provider details into business policy.

## Where to start

- [web.ts](web.ts): Resolves browser sessions, guest cart identity and private order cookies for server entry points.

- [adapter-registry.ts](adapter-registry.ts): Typed adapter registration and lookup.
- [Shared configuration helpers](../../../../packages/config/README.md): Validates public and internal service origins. Database and authentication modules validate their own configuration.
- [storage.ts](storage.ts): S3-compatible object access and upload helpers.
- [Authentication and staff checks](auth/README.md): Better Auth configuration/client integration and active staff verification.
- [Provider composition](bootstrap/README.md): Validates configuration and constructs process-wide notification adapters.
- [Database access](db/README.md): PostgreSQL/Drizzle connection setup, schema, ledger cursors and versioned migrations.
- [Commerce HTTP helpers](http/README.md): Mutation origin checks, bounded JSON parsing, validation and response envelopes.
- [Notification adapters](notifications/README.md): SMTP password/OAuth email, Telnyx SMS/verification, provider registries/configuration and explicit test fakes.
- [Payment adapters](payments/README.md): Stripe transport and typed payment-adapter selection.
- [Runtime lifecycle](runtime/README.md): Graceful shutdown and tracked in-flight work.
- [Security infrastructure](security/README.md): Structured logging and process-local rate limiting.
- [Provider signature verification](webhooks/README.md): Telnyx callback verification before durable reconciliation.
- [Background processing](worker/README.md): Outbox/SMS batches and housekeeping invoked by backend instrumentation.

## More context

[Parent overview](../README.md)
