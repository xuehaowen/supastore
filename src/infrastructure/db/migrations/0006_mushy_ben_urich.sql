CREATE TABLE "cash_drawer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawer_name" text DEFAULT 'Main Register' NOT NULL,
	"opened_by_user_id" text NOT NULL,
	"closed_by_user_id" text,
	"starting_balance_cents" integer DEFAULT 0 NOT NULL,
	"closing_balance_cents" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "cash_receipt_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"cash_drawer_session_id" uuid,
	"sequential_number" text NOT NULL,
	"drawer_name" text DEFAULT 'Main Register' NOT NULL,
	"payer_name" text,
	"tendered_amount_cents" integer NOT NULL,
	"change_due_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_receipt_details_receipt_id_unique" UNIQUE("receipt_id"),
	CONSTRAINT "cash_receipt_details_sequential_number_unique" UNIQUE("sequential_number")
);
--> statement-breakpoint
CREATE TABLE "cash_receipt_sequences" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_sequence_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_receipt_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"delta_amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"investigation_notes" text,
	"corrected_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN "account_type" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_receipt_details" ADD CONSTRAINT "cash_receipt_details_receipt_id_payment_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."payment_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_receipt_details" ADD CONSTRAINT "cash_receipt_details_cash_drawer_session_id_cash_drawer_sessions_id_fk" FOREIGN KEY ("cash_drawer_session_id") REFERENCES "public"."cash_drawer_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipt_corrections" ADD CONSTRAINT "payment_receipt_corrections_receipt_id_payment_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."payment_receipts"("id") ON DELETE restrict ON UPDATE no action;