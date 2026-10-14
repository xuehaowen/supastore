# External capability contracts

Small interfaces for notification and payment providers.

## When working here

Keep SDK types and credentials out of contracts. Declare only capabilities the adapter actually supports.

## Where to start

- [notifications.ts](notifications.ts): Provider-neutral email, SMS and verification interfaces.
- [payments.ts](payments.ts): Provider-neutral payment and refund interfaces.

## More context

[Parent overview](../README.md)
