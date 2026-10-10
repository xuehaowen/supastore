# Guest access and recovery

Guest session creation and private tracking-link request/verification.

## When working here

Keep recovery responses privacy preserving. An order reference is not access authorization.

## Where to start

- [create-guest-session.ts](create-guest-session.ts): Creates scoped guest identity for shopping.
- [request-tracking-link.ts](request-tracking-link.ts): Requests private order recovery without disclosing ownership.
- [verify-tracking-link.ts](verify-tracking-link.ts): Verifies and exchanges scoped recovery proof.

## Related paths and checks

- Storage: guest/private-access records and order access associations; see the database schema and guest-access helper.
- Checks: unit `public-registration.test.ts` and browser `cross-service-storefront.spec.ts` exercise related identity/private-access boundaries.
- Recovery requests use `/api/v1/recovery`; proof exchange is served by the recovery pages in both customer interfaces.

## More context

[Parent overview](../README.md)
