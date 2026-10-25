-- References are permanent display identifiers, never access credentials.
-- Padding is a minimum width, so numbers continue to grow past 999999.
CREATE FUNCTION commerce_reference(prefix text, value bigint) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT prefix || '-' || repeat('0', greatest(0, 6 - length(value::text))) || value::text
$$;
--> statement-breakpoint
CREATE SEQUENCE order_reference_sequence;
--> statement-breakpoint
CREATE SEQUENCE payment_reference_sequence;
--> statement-breakpoint
-- Pre-launch orders are renumbered in place; no compatibility alias is retained.
ALTER TABLE orders DROP CONSTRAINT orders_reference_code_unique;
--> statement-breakpoint
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS number FROM orders
)
UPDATE orders SET reference_code = commerce_reference('ORD', numbered.number)
FROM numbered WHERE orders.id = numbered.id;
--> statement-breakpoint
SELECT setval('order_reference_sequence', greatest(count(*), 1), count(*) > 0) FROM orders;
--> statement-breakpoint
ALTER TABLE orders ALTER COLUMN reference_code SET DEFAULT commerce_reference('ORD', nextval('order_reference_sequence'));
--> statement-breakpoint
ALTER TABLE orders ALTER COLUMN reference_code SET NOT NULL;
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_reference_code_unique UNIQUE (reference_code);
--> statement-breakpoint
ALTER SEQUENCE order_reference_sequence OWNED BY orders.reference_code;
--> statement-breakpoint
ALTER TABLE payment_receipts ADD COLUMN reference_code text;
--> statement-breakpoint
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS number FROM payment_receipts
)
UPDATE payment_receipts SET reference_code = commerce_reference('PAY', numbered.number)
FROM numbered WHERE payment_receipts.id = numbered.id;
--> statement-breakpoint
SELECT setval('payment_reference_sequence', greatest(count(*), 1), count(*) > 0) FROM payment_receipts;
--> statement-breakpoint
ALTER TABLE payment_receipts ALTER COLUMN reference_code SET DEFAULT commerce_reference('PAY', nextval('payment_reference_sequence'));
--> statement-breakpoint
ALTER TABLE payment_receipts ALTER COLUMN reference_code SET NOT NULL;
--> statement-breakpoint
ALTER TABLE payment_receipts ADD CONSTRAINT payment_receipts_reference_code_unique UNIQUE (reference_code);
--> statement-breakpoint
ALTER SEQUENCE payment_reference_sequence OWNED BY payment_receipts.reference_code;
