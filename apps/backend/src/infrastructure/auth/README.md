# Authentication and staff checks

Better Auth configuration/client integration and active staff verification.

## When working here

A session is not staff permission. Recheck active membership and required role for private merchant operations.

## Where to start

- [index.ts](index.ts): Server authentication configuration and hooks.
- [client.ts](client.ts): Browser authentication client using the current public origin.
- [session.ts](session.ts): In-transaction active staff and owner checks.

## More context

[Parent overview](../README.md)
