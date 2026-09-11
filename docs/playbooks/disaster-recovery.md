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
2. Verify object storage (S3/MinIO) backup artifacts are staged.

### Step 2: Execute Restore Script
```bash
# Set outbound delivery suppression
export DISABLE_OUTBOUND_DELIVERY=true
export ENABLE_OUTBOX_WORKER=false

# Run restore
./scripts/restore.sh ./backups/20260910_latest postgresql://user:pass@host:5432/supastore_recovery
```

### Step 3: Verify Integrity
1. Run application in diagnostic mode (`DISABLE_OUTBOUND_DELIVERY=true`).
2. Inspect orders, receipts, payout allocations, and catalog.
3. Verify all financial ledger invariants using the reconciliation playbook.

---

## 3. Post-Restore Checklist
- [ ] Database restored and migrations verified.
- [ ] `DISABLE_OUTBOUND_DELIVERY=true` was active during boot.
- [ ] All pending outbox events reviewed per [Outbox Reconciliation Playbook](outbox-reconciliation.md).
- [ ] `DISABLE_OUTBOUND_DELIVERY` safely removed and `ENABLE_OUTBOX_WORKER=true` re-enabled.
