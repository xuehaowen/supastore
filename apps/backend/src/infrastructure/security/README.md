# Security infrastructure

Structured logging and process-local rate limiting.

## When working here

Avoid secrets/private tokens in logs. In-memory throttles are per process; sensitive flows also need database or verified ingress enforcement.

## Where to start

- [logger.ts](logger.ts): Structured logging configuration and redaction.
- [rate-limiter.ts](rate-limiter.ts): Process-local request throttling.

## More context

[Parent overview](../README.md)
