# Customer accounts

Profile/address ownership and optional SMS preferences/verification.

## When working here

Derive the customer from verified server identity. Guest-order claims additionally require private order access proof; matching email is insufficient.

## Where to start

- [customer-ownership.ts](customer-ownership.ts): Resolves verified customers and proof-based order ownership.
- [sms-preferences.ts](sms-preferences.ts): Updates consent and coordinates phone verification.
- [update-profile.ts](update-profile.ts): Updates verified customer name and phone details.

## Related paths and checks

- Storage: `auth.ts`, `customers.ts`, `sms.ts` and customer associations on orders.
- Checks: unit `customer-profile.test.ts`, integration `sms-verification.test.ts`, browser `storefront-journey-updates.spec.ts`.
- API entry points: `/api/v1/account`, `/api/v1/account/addresses`, `/api/v1/account/orders`, `/api/v1/account/sms`. Profile/address edits leave purchase snapshots intact; phone changes and opt-out fence pending verification approvals.

## More context

[Parent overview](../README.md)
