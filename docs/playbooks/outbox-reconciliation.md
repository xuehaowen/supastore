# Outbox State Reconciliation Playbook

After restoring from a database backup or recovering from worker downtime,
inspect every delivery state, including `dispatching`, `awaiting`, `accepted`
and `review`, as well as `pending`, `retrying` and `exhausted`. Provider acceptance
does not necessarily prove final delivery.

## 1. Inspect Outbox State

Query the delivery status across all pending and retrying event records:

```sql
SELECT status, channel, COUNT(*), MIN(created_at) as oldest, MAX(created_at) as newest
FROM event_deliveries
GROUP BY status, channel;
```

---

## 2. Decision Matrix

| State                  | Historical External Evidence                                 | Action                                                                                                  |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `pending` / `retrying` | Email was already confirmed delivered via SMTP logs/provider | Mark as `delivered` (suppress resend)                                                                   |
| `pending` / `retrying` | Email was definitely NOT delivered                           | Keep as `pending` (allow worker to dispatch)                                                            |
| `exhausted`            | Reached max 6 attempts before disaster                       | Inspect failure reason; keep as `exhausted` or authorize one safe retry while retaining attempt history |

---

## 3. SQL Reconciliation Queries

For `dispatching`, `awaiting`, `accepted` and `review`, preserve pinned provider,
attempt, lease and idempotency evidence. Consult authoritative provider status
and the application's reconciliation workflow. Do not reset these records with
the SQL below: an expired idempotency window or uncertain provider outcome can
require manual review rather than a resend. Keep outbound delivery disabled
until unresolved outcomes are established.

### Suppress a Verified Delivered Record

Stop delivery workers before reconciliation. Match each record to authoritative
provider evidence and retain that evidence in the incident record. Age alone
does not prove delivery. Never mark an uncertain batch delivered by date.

```sql
UPDATE event_deliveries
SET status = 'delivered', lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
WHERE id = '<verified-delivery-id>'
  AND status IN ('pending', 'retrying');
```

### Re-Queue Specific Delivery

```sql
UPDATE event_deliveries
SET status = 'pending', retry_after = NOW(), lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
WHERE id = '<verified-undelivered-id>'
  AND status IN ('retrying', 'exhausted');
```

Never reset `attempts` on deliveries with persisted attempt records: attempt
numbers are unique audit identities. Requeueing an exhausted delivery authorizes
one additional submission; another rejection remains exhausted. For `failed`
deliveries, first establish a definite rejection, correct the permanent cause,
and document owner authorization before the same targeted retry. Never requeue
`review` rows whose submission outcome is uncertain. Expired authentication links
must be replaced by a new customer request, not requeued.

---

## 4. Re-Enabling Outbox Worker

Keep outbound delivery disabled while any delivery outcome remains uncertain.
Once all uncertain records have been audited and either verified delivered or
verified safe to retry:

1. Remove `DISABLE_OUTBOUND_DELIVERY=true` from your environment.
2. Restart the application service with `ENABLE_OUTBOX_WORKER=true`.
3. Check `/api/health/worker` to monitor queue drain lag and metrics.
