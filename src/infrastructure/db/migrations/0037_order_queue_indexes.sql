-- Fresh/offline installs build these indexes here. For an online upgrade,
-- prebuild both VALID indexes with scripts/order-query-indexes.sql first.
-- The Drizzle migrator runs in a transaction, so CONCURRENTLY belongs in
-- that separate, nontransactional prebuild step. Existing valid indexes are
-- retained; this migration contains no financial or customer data changes.
CREATE INDEX IF NOT EXISTS "idx_order_admin_history" ON "orders" ("created_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_status_history" ON "orders" ("lifecycle_status", "created_at", "id");
