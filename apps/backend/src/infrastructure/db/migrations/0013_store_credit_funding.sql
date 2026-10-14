CREATE TABLE "store_credit_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"precision" integer NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"reserved_cents" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "credit_balance_valid" CHECK ("store_credit_accounts"."balance_cents" >= "store_credit_accounts"."reserved_cents" and "store_credit_accounts"."reserved_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "store_credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"kind" text NOT NULL,
	"order_id" uuid,
	"reversal_of_id" uuid,
	"reason" text NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_credit_entries_reversal_of_id_unique" UNIQUE("reversal_of_id"),
	CONSTRAINT "store_credit_entries_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "credit_entry_nonzero" CHECK ("store_credit_entries"."amount_cents" <> 0)
);
--> statement-breakpoint
CREATE TABLE "store_credit_refund_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_authorization_id" uuid NOT NULL,
	"credit_entry_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	CONSTRAINT "store_credit_refund_settlements_refund_authorization_id_unique" UNIQUE("refund_authorization_id"),
	CONSTRAINT "store_credit_refund_settlements_credit_entry_id_unique" UNIQUE("credit_entry_id"),
	CONSTRAINT "credit_refund_positive" CHECK ("store_credit_refund_settlements"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "store_credit_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"debit_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_credit_reservations_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "store_credit_reservations_debit_entry_id_unique" UNIQUE("debit_entry_id"),
	CONSTRAINT "credit_hold_positive" CHECK ("store_credit_reservations"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "confirmation_funding" ALTER COLUMN "receipt_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "credit_applied_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "confirmation_funding" ADD COLUMN "credit_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "store_credit_accounts" ADD CONSTRAINT "store_credit_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_credit_entries" ADD CONSTRAINT "store_credit_entries_account_id_store_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."store_credit_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_credit_entries" ADD CONSTRAINT "store_credit_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_credit_refund_settlements" ADD CONSTRAINT "store_credit_refund_settlements_refund_authorization_id_refund_authorizations_id_fk" FOREIGN KEY ("refund_authorization_id") REFERENCES "public"."refund_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_credit_refund_settlements" ADD CONSTRAINT "store_credit_refund_settlements_credit_entry_id_store_credit_entries_id_fk" FOREIGN KEY ("credit_entry_id") REFERENCES "public"."store_credit_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_credit_reservations" ADD CONSTRAINT "store_credit_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_credit_reservations" ADD CONSTRAINT "store_credit_reservations_account_id_store_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."store_credit_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_credit_reservations" ADD CONSTRAINT "store_credit_reservations_debit_entry_id_store_credit_entries_id_fk" FOREIGN KEY ("debit_entry_id") REFERENCES "public"."store_credit_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_credit_customer_currency" ON "store_credit_accounts" USING btree ("customer_id","currency");--> statement-breakpoint
CREATE INDEX "idx_credit_entry_history" ON "store_credit_entries" USING btree ("account_id","created_at");--> statement-breakpoint
ALTER TABLE "confirmation_funding" ADD CONSTRAINT "confirmation_funding_credit_entry_id_store_credit_entries_id_fk" FOREIGN KEY ("credit_entry_id") REFERENCES "public"."store_credit_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confirmation_funding" ADD CONSTRAINT "confirmation_funding_one_source" CHECK (("confirmation_funding"."receipt_id" is not null) <> ("confirmation_funding"."credit_entry_id" is not null));--> statement-breakpoint
ALTER TABLE "confirmation_funding" ADD CONSTRAINT "confirmation_funding_positive" CHECK ("confirmation_funding"."funded_amount_cents" > 0);