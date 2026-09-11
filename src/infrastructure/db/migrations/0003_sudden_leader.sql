CREATE TABLE "upload_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "upload_candidates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "upload_candidates" ADD CONSTRAINT "upload_candidates_intent_id_payment_upload_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_upload_intents"("id") ON DELETE no action ON UPDATE no action;