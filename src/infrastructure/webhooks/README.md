# Provider signature verification

Telnyx callback verification before durable reconciliation.

## When working here

Verify timestamp and raw signed bytes, bound payloads, and persist trusted events before acknowledging.

## Where to start

- [telnyx.ts](telnyx.ts): Validates signed Telnyx callback payloads.

## More context

[Parent overview](../README.md) · [Notification integration guide](../../../docs/notification-integrations.md)
