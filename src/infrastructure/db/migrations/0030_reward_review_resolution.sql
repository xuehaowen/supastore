ALTER TABLE reward_reconciliations ADD COLUMN restored_cents integer NOT NULL DEFAULT 0 CHECK(restored_cents >= 0);
--> statement-breakpoint
CREATE TABLE reward_funding_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), request_key uuid NOT NULL UNIQUE, actor_id text NOT NULL, reason text NOT NULL, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TRIGGER reward_review_history BEFORE UPDATE OR DELETE ON reward_funding_reviews FOR EACH ROW EXECUTE FUNCTION protect_commerce_ledger();
