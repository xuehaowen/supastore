CREATE TABLE outside_sales_adjustments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_date date NOT NULL, net_cents integer NOT NULL, tax_cents integer NOT NULL, reason text NOT NULL, actor_id text NOT NULL, request_key uuid NOT NULL UNIQUE, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CHECK(net_cents <> 0 OR tax_cents <> 0));
--> statement-breakpoint
CREATE TRIGGER outside_sales_history BEFORE UPDATE OR DELETE ON outside_sales_adjustments FOR EACH ROW EXECUTE FUNCTION protect_commerce_ledger();
--> statement-breakpoint
CREATE TABLE sales_threshold_alerts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fiscal_start date NOT NULL, threshold_cents integer NOT NULL CHECK(threshold_cents > 0), observed_net_cents text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(fiscal_start,threshold_cents));
