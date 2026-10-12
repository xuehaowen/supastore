# Notification policies and templates

Published template management, rendering, consent policy, delivery processing, and callback reconciliation.

## When working here

Published versions and prepared retries are immutable. Unknown send outcomes require review; missing templates must not silently use generic copy.

## Where to start

- [default-templates.json](default-templates.json): Bilingual default notification copy.
- [delivery-policy.ts](delivery-policy.ts): Classifies delivery outcomes and retry/review decisions.
- [notification-inbox.ts](notification-inbox.ts): Reconciles durable provider callbacks.
- [process-delivery.ts](process-delivery.ts): Prepares, submits and records notification attempts.
- [sms-policy.ts](sms-policy.ts): Applies SMS consent and delivery-time policy.
- [template-manager.ts](template-manager.ts): Owner drafts, publication, history and template-review repair.
- [templates.ts](templates.ts): Event requirements, allowed variables and content rendering.

## Related paths and checks

- Storage: `outbox.ts`, `notification-inbox.ts`, `notification-templates.ts` and `sms.ts` in the schema directory.
- Checks: unit `notification-event-coverage.test.ts`, `notification-rendering.test.ts`; integration `notification-template-manager.test.ts` / `outbox-coordination.test.ts`; browser `notification-templates.spec.ts`.
- Owner entry point: `/admin/settings/notifications`. Missing templates enter review; repair only requeues eligible unsent, unprepared messages. STOP suppresses pending SMS without deleting accepted facts; live SMS remains disabled in provider composition.

## More context

See [template management](../../../docs/notification-template-manager.md) for publication and unsent-review repair, [event contracts](../../../docs/api-events-spec.md) for ordering/delivery identity, and [adapter extensions](../../../docs/provider-adapters.md) for new transports.

[Parent overview](../README.md) · [Notification integration guide](../../../docs/notification-integrations.md)
