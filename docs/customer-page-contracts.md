# Customer-page HTTP validation

Step 2 of the [platform quality plan](../plans/platform-quality-enhancement.md).
Date: 2026-10-16, America/Los_Angeles. Local Step 2 verification completed.

## Behavior

The storefront validates all eight customer-page responses before rendering:
layout, catalog, product, cart, checkout, account, order and collection. Shared
Valibot schemas live in `packages/contracts/src/customer-page-validation.ts` and
are exposed through `@supastore/contracts/customer-page-validation`. The root
package entry point does not import these schemas, keeping existing client-side
endpoint validators independent from the server page-schema graph.

Validation checks consumed nested objects/arrays, safe integer money/quantity
fields, currency precision, lifecycle/fulfillment/payment states and ISO wire
timestamps. Signed credit ledger entries remain valid. Public store data can be
absent before bootstrap; unavailable quotes, translations and payment attempts
can be omitted, matching JSON serialization. Unknown additive fields are removed.
Opaque saved quote item/shipping snapshots retain their array/object shape; they
are not rendered directly. This validation does not recalculate prices, replace
authorization or change transaction rules.

Schema failures become the existing generic 502 with the correlated request ID;
payloads and validation issues are not returned to customers. Catalog retains its
cookie-free bounded public cache. Cart, checkout, account, order, layout and live
stock reads retain their existing cookie-forwarding no-store behavior.

## Existing-store compatibility

The original migration-0022 database policy default omitted later optional
delivery/reward/fiscal fields. Previously, `publicStore()` returned that raw JSON
while business calculations used `commercePolicy()` to fill defaults. Strict page
decoding exposed the mismatch. The shared public producer now uses that same
existing normalization function before serializing responses. No migration or
stored-setting changes are required, and configured policies keep their values.

Deployment compatibility:

| Backend                      | Storefront               | Supported behavior                                 |
| ---------------------------- | ------------------------ | -------------------------------------------------- |
| Previous raw-policy producer | Previous shallow decoder | Previous behavior                                  |
| New normalized producer      | Previous decoder         | Compatible additive response                       |
| New normalized producer      | New nested decoder       | Supported and verified together                    |
| Previous raw-policy producer | New decoder              | Not guaranteed for migrated/default-created stores |

Deploy the normalized backend before the new storefront. For rollback, roll back
the storefront first or retain the backend normalization patch. Do not restore a
raw-policy backend while strict consumers are active. For future breaking fields
or statuses, introduce compatible producers before changing consumers and retain
previous response fields through the supported rollout/rollback window.

## Verification

- RED checkpoint `b7b81ac`: new decoder API absent; executable positive response
  cases failed. Fixtures describe all eight prior wire shapes, including omitted
  optional fields and additive compatibility.
- RED checkpoint `f664c71`: exact persisted migration-default policy failed to
  expose required defaults through the actual `layoutPage()` producer. The same
  regression passes with producer normalization.
- Focused decoder/policy/cache/privacy suite: 89 tests passed. New decoder
  statement/branch/function/line coverage was 100% in the recorded focused run;
  this is executable-code coverage, not proof of every possible payload.
- Root, backend and storefront TypeScript checks passed. Schema outputs are
  constrained against public models; backend loaders retain their compile-time
  model checks. The keyed return cast follows successful runtime parsing rather
  than casting untrusted data directly.
- Full unit/library suite: 1,022 passed in 118 files. Both production builds and all 36 production browser journeys passed in a fresh isolated run. Production checks include the 34 existing default journeys plus actual
  serialized responses for every decoder and an old-store policy/product-page
  regression.
- Independent TypeScript review found and rechecked the legacy-policy issue;
  source security review found no actionable privacy/cache/auth issues. No
  dependency vulnerability scan is implied by those reviews.

Existing [Step 1 resource evidence](platform-quality-baseline.md) remains a
separate baseline. The final measured run recorded identical initial raw client JavaScript sizes: catalog 506,558 bytes and product 510,814 bytes. Sum-of-chunk gzip sizes were 159,836 and 161,260 bytes (156.1/157.5 KiB); the two-byte gzip differences are not a performance improvement. The dedicated schema entry point did not grow those client bundles. KVM 2 and real payment/email
acceptance remain separate release gates.

Final post-journey Windows Next CLI working sets: backend 653,692,928 bytes
(623.4 MiB; lifetime peak 674,045,952), storefront 401,821,696 bytes
(383.2 MiB; lifetime peak 405,176,320). The workload includes two additional
contract journeys versus Step 1. These snapshots are diagnostic and do not
establish a memory improvement, sustained plateau or target-host capacity.

Repository lint/format and root/backend/storefront type checks passed. Full
PostgreSQL baseline remains 136 passing tests from Step 1; this step adds no
financial/stock mutation changes and verifies the changed read producer through
unit and real HTTP/browser tests. Build/native-cache and interim compatibility
failures were investigated rather than counted as passes. Final runner exited 0
and cleaned up its synthetic services. Logs remain ignored under
`.tmp-cuj/platform-quality`.
