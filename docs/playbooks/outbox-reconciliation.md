# Outbox State Reconciliation Playbook

After restoring from a database backup or recovering from worker downtime, the outbox table may contain events in `pending`, `retrying`, or `exhausted` status whose delivery status is uncertain.

## 1. Inspect Outbox State

Query the delivery status across all pending and retrying event records:

```sql
SELECT status, channel, COUNT(*), MIN(created_at) as oldest, MAX(created_at) as newest
FROM event_deliveries
GROUP BY status, channel;
```

---

## 2. Decision Matrix

| State | Historical External Evidence | Action |
|---|---|---|
| `pending` / `retrying` | Email was already confirmed delivered via SMTP logs/provider | Mark as `delivered` (suppress resend) |
| `pending` / `retrying` | Email was definitely NOT delivered | Keep as `pending` (allow worker to dispatch) |
| `exhausted` | Reached max 6 attempts before disaster | Inspect failure reason; keep as `exhausted` or reset to `pending` with `attempts = 0` |

---

## 3. SQL Reconciliation Queries

### Bulk Suppress (Mark as Delivered Without Resending)
```sql
UPDATE event_deliveries
SET status = 'delivered', lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
WHERE status IN ('pending', 'retrying')
  AND created_at < '2026-09-10 00:00:00Z';
```

### Re-Queue Specific Delivery
```sql
UPDATE event_deliveries
SET status = 'pending', attempts = 0, retry_after = NOW(), lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
WHERE id = '<delivery-id>';
```

---

## 4. Re-Enabling Outbox Worker
Once all uncertain records have been audited and either marked `delivered` or retained as `pending`:
1. Remove `DISABLE_OUTBOUND_DELIVERY=true` from your environment.
2. Restart the application service with `ENABLE_OUTBOX_WORKER=true`.
3. Check `/api/health/worker` to monitor queue drain lag and metrics.
