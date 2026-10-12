CREATE TABLE "catalog_media_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"s3_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catalog_media_uploads_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
ALTER TABLE "product_collections" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "product_collections" ADD COLUMN "image_alt" text DEFAULT '' NOT NULL;