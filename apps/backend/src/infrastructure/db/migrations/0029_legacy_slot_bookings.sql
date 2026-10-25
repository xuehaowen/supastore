-- Preserve pre-capacity booking obligations without changing legacy snapshots.
INSERT INTO slot_reservations(slot_id,order_id,status,created_at)
SELECT f.fulfillment_slot_id,o.id,
 CASE WHEN o.lifecycle_status='completed' OR f.status IN ('shipped','fulfilled') THEN 'consumed' ELSE 'active' END,
 o.created_at
FROM order_fulfillments f JOIN orders o ON o.id=f.order_id
WHERE f.fulfillment_slot_id IS NOT NULL AND o.lifecycle_status <> 'cancelled'
ON CONFLICT(order_id) DO NOTHING;
