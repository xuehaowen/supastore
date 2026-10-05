CREATE INDEX "idx_order_customer_history" ON "orders" USING btree ("customer_id","created_at","id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "order_credit_within_purchase" CHECK ("orders"."credit_applied_cents" >= 0 and "orders"."credit_applied_cents" <= "orders"."purchase_total_cents");
--> statement-breakpoint
CREATE FUNCTION protect_commerce_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Commerce ledger history is append-only; record a compensating entry' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_store_credit_entries BEFORE UPDATE OR DELETE ON store_credit_entries FOR EACH ROW EXECUTE FUNCTION protect_commerce_ledger();
--> statement-breakpoint
CREATE TRIGGER immutable_stock_movements BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION protect_commerce_ledger();
--> statement-breakpoint
CREATE TRIGGER immutable_credit_refund_settlements BEFORE UPDATE OR DELETE ON store_credit_refund_settlements FOR EACH ROW EXECUTE FUNCTION protect_commerce_ledger();
