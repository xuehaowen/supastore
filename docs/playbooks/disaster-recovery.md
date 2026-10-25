# Disaster Recovery Playbook (`O2`)

This playbook guides the recovery of Supastore following severe infrastructure loss or database corruption.

## 1. Safety Invariant: Outbound Email Suppression

> [!CAUTION]
> Restoring from a historical database backup into an active network environment without suppressing outbound delivery can trigger duplicate notification emails to customers (e.g. resending old order confirmation or refund emails).
> **`DISABLE_OUTBOUND_DELIVERY=true` must be strictly enforced during cold restore.**

---

## 2. Cold Restore Procedure

### Step 1: Provision Isolated Instance

1. Provision a clean PostgreSQL database (e.g. `supastore_recovery`).
2. Verify object storage (S3/RustFS) backup artifacts are staged.

### Step 2: Execute Restore Script

Stop the backend (including its in-process worker) and other clients of the target
database before restoring. Exporting variables in a shell does not change the
environment of an already-running service. The restore script requires explicit
cold-maintenance confirmation and refuses a target with active sessions.
New backup directories contain SHA256SUMS; verify and retain that file alongside
the dumps. A database backup is separate from the object-storage backup.

Run the scripts with Bash and LF line endings (enforced by `.gitattributes` in
fresh checkouts). Install compatible PostgreSQL clients, Node and `sha256sum`;
checksum verification supports GNU and Alpine BusyBox via `-c`. See the
[synthetic shell rehearsal](../reliability-acceptance-2026-10-17.md#actual-shell-procedure-follow-up)
for tested guards and the remaining merchant database/assets acceptance.

```bash
# Set outbound delivery suppression
export DISABLE_OUTBOUND_DELIVERY=true
export ENABLE_OUTBOX_WORKER=false
export RESTORE_COLD_CONFIRMED=true

# Run restore
./scripts/restore.sh ./backups/20260910_latest postgresql://user:pass@host:5432/supastore_recovery
```

### Step 3: Verify Integrity

1. Run application in diagnostic mode (`DISABLE_OUTBOUND_DELIVERY=true`).
2. Inspect orders, receipts, payout allocations, and catalog.
3. Verify all financial ledger invariants using the reconciliation playbook.
4. Confirm public images and private payment evidence were restored from the
   matching object-storage snapshot. Compare the inventory/checksums.
5. Apply recovery flags to the actual container/service configuration before
   restarting it. Restore executes migrations and exits nonzero on any failure;
   a failed run must not be treated as a usable recovery.

---

## 3. Post-Restore Checklist

- [ ] Database restored and migrations verified.
- [ ] `DISABLE_OUTBOUND_DELIVERY=true` was active during boot.
- [ ] All pending outbox events reviewed per [Outbox Reconciliation Playbook](outbox-reconciliation.md).
- [ ] `DISABLE_OUTBOUND_DELIVERY` safely removed and `ENABLE_OUTBOX_WORKER=true` re-enabled.
