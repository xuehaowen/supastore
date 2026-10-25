CREATE TABLE credit_source_lots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES store_credit_accounts(id), source_entry_id uuid UNIQUE REFERENCES store_credit_entries(id), kind text NOT NULL CHECK(kind IN ('reward','merchant','legacy')), reward_order_id uuid UNIQUE REFERENCES orders(id), remaining_cents integer NOT NULL, reserved_cents integer NOT NULL DEFAULT 0, revoked_pending_cents integer NOT NULL DEFAULT 0, debt_cents integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), CHECK(remaining_cents >= reserved_cents AND reserved_cents >= 0 AND revoked_pending_cents >= 0 AND debt_cents >= 0));
--> statement-breakpoint
CREATE TABLE credit_source_allocations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid NOT NULL REFERENCES store_credit_reservations(id), lot_id uuid NOT NULL REFERENCES credit_source_lots(id), amount_cents integer NOT NULL CHECK(amount_cents > 0), refunded_cents integer NOT NULL DEFAULT 0 CHECK(refunded_cents >= 0 AND refunded_cents <= amount_cents), UNIQUE(reservation_id,lot_id));
--> statement-breakpoint
CREATE TABLE reward_reconciliations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), request_key text NOT NULL UNIQUE, target_cents integer NOT NULL CHECK(target_cents >= 0), reversed_cents integer NOT NULL CHECK(reversed_cents >= 0), created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
-- Legacy balances predate promotional rewards. Preserve counters and active holds;
-- historical captured credit remains legacy when refunded, never inferred as rewards.
INSERT INTO credit_source_lots(account_id,kind,remaining_cents,reserved_cents) SELECT id,'legacy',balance_cents,reserved_cents FROM store_credit_accounts WHERE balance_cents > 0;
--> statement-breakpoint
INSERT INTO credit_source_allocations(reservation_id,lot_id,amount_cents) SELECT r.id,l.id,r.amount_cents FROM store_credit_reservations r JOIN credit_source_lots l ON l.account_id=r.account_id WHERE r.status='active';
--> statement-breakpoint
CREATE TRIGGER immutable_reward_reconciliations BEFORE UPDATE OR DELETE ON reward_reconciliations FOR EACH ROW EXECUTE FUNCTION protect_commerce_ledger();
