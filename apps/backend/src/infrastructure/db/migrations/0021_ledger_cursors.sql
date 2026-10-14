DROP INDEX "idx_credit_entry_history";
--> statement-breakpoint
CREATE INDEX "idx_credit_entry_history" ON "store_credit_entries" ("account_id", "created_at", "id");
--> statement-breakpoint
DROP INDEX "idx_stock_movement_history";
--> statement-breakpoint
CREATE INDEX "idx_stock_movement_history" ON "stock_movements" ("variant_id", "created_at", "id");
