# Notification adapters

SMTP password/OAuth email, Telnyx SMS/verification, provider registries/configuration and explicit test fakes.

## When working here

Acceptance is not confirmed delivery. Preserve provider/profile identity and report timeout uncertainty rather than silently replaying sends.

## Where to start

- [provider-config.ts](provider-config.ts): Transport configuration and profile identity.
- [email-adapters.ts](email-adapters.ts): Typed email adapter selection.
- [nodemailer-email.ts](nodemailer-email.ts): Pooled SMTP sending and transport outcomes.
- [telnyx-sms.ts](telnyx-sms.ts): SMS transport implementation; live sending is gated.
- [console-sms.ts](console-sms.ts): Explicit console-mode previews with masked recipients and no external delivery.

## More context

[Parent overview](../README.md) · [Notification integration guide](../../../../../docs/notification-integrations.md)
