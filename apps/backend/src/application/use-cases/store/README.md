# Store policies and setup

Settings, ordering pause, email verification/readiness, destinations, delivery and slot capacity.

## When working here

Ordering policy and first-order currency locking share the store gate. Required email-template gaps block launch readiness.

## Where to start

- [configure-delivery.ts](configure-delivery.ts): Manages local-delivery areas and schedules.
- [configure-shipping.ts](configure-shipping.ts): Manages shipping zones and pickup configuration.
- [get-launch-readiness.ts](get-launch-readiness.ts): Reports outstanding store launch prerequisites.
- [pause-store.ts](pause-store.ts): Changes the gate for accepting new orders.
- [slot-capacity.ts](slot-capacity.ts): Configures fulfillment capacity and variant quotas.
- [update-store-settings.ts](update-store-settings.ts): Validates and persists merchant policies.
- [verify-email.ts](verify-email.ts): Store email verification workflow.

## Related paths and checks

- Storage: store settings, shipping/delivery configuration and audit records in `src/infrastructure/db/schema`.
- Checks: `tests/unit/setup-validation.test.ts` and `tests/browser/admin-management.spec.ts`.
- Merchant entry points: admin setup and settings; `/api/v1/admin/settings`. Currency locking and placement share the store gate.

## More context

[Parent overview](../README.md)
