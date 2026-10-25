# Commerce HTTP helpers

Mutation origin checks, bounded JSON parsing, validation and response envelopes.

## When working here

Private data is no-store. Missing/unapproved origins and cross-site mutations are rejected. Other route families can have different protocols.

## Where to start

- [commerce-api.ts](commerce-api.ts): Origin checks, bounded JSON parsing and response envelopes.

## Related paths and checks

- Commerce responses: `{ data, requestId }` or `{ error: { code, message }, requestId }`; private reads are no-store, selected public reads use a short cache lifetime.
- Checks: unit `commerce-api-routes.test.ts` and `request-validation.test.ts`, browser `request-rejections.spec.ts`.
- JSON parsing bounds actual body size to 32 KiB. The origin guard accepts the normalized public origin from the shared resolver or the request origin, and rejects missing/unapproved origins and cross-site mutations. Catalog images and product CSV imports use this same guard before authentication or body parsing. Auth/webhook/assets use their own protocols.

## More context

[Parent overview](../README.md)
