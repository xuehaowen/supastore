# Cancellation and excess funds

Order cancellation and surplus/late-payment return operations.

## When working here

Cancellation must release active reservations while preserving money already received and obligations already authorized. Main placement/confirmation code is in the parent directory.

## Where to start

- [cancel-order.ts](cancel-order.ts): Cancels eligible orders and resolves reservations/funds.
- [surplus-return.ts](surplus-return.ts): Authorizes return of excess or late incoming funds.

## More context

[Parent overview](../README.md) · [Financial contracts](../../../../docs/transaction-contracts.md)
