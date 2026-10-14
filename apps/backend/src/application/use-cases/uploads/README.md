# Private evidence uploads

Expiring upload intents, immutable candidate finalization and abandoned-upload cleanup.

## When working here

Perform storage I/O outside financial transactions, then recheck authorization/expiry under locks. Cleanup must never delete finalized referenced evidence.

## Where to start

- [cleanup-uploads.ts](cleanup-uploads.ts): Expires abandoned upload intents and cleans unreferenced objects.
- [create-upload-intent.ts](create-upload-intent.ts): Authorizes a staging upload for an existing order.
- [finalize-upload.ts](finalize-upload.ts): Validates and attaches immutable private evidence once.

## Related paths and checks

- Storage: `payment-uploads.ts`, payment evidence associations and private S3-compatible objects.
- Checks: unit `evidence-upload-route.test.ts` / `evidence-view-route.test.ts`, and browser `cross-service-storefront.spec.ts`.
- Evidence endpoints live under `/api/evidence`. Uploaded proof is not a receipt of money. Staging writes cannot alter the immutable finalized object.

## More context

[Parent overview](../README.md)
