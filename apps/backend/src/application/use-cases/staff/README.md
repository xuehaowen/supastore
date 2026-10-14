# Staff governance

Staff membership changes and trusted owner recovery.

## When working here

Verify current membership/owner authority in the transaction. Public registration cannot provision an owner.

## Where to start

- [manage-staff.ts](manage-staff.ts): Changes staff membership and permissions.
- [recover-owner.ts](recover-owner.ts): Creates trusted owner-recovery proof.
- [redeem-owner-recovery.ts](redeem-owner-recovery.ts): Redeems recovery proof under governance checks.

## Related paths and checks

- Storage: auth users/sessions, staff memberships and recovery/audit records.
- Checks: `tests/unit/staff-governance.test.ts` and `tests/unit/auth-module.test.ts`.
- Owner provisioning starts in the parent `bootstrap-owner.ts`; recovery redemption is exposed under `/api/auth/recover-owner/redeem`.

## More context

[Parent overview](../README.md)
