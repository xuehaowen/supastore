-- Staff sessions are separate from customer sessions, including token lookup,
-- session listing and revocation. Existing sessions are not promoted to staff.
CREATE TABLE "staff_session" (
  "id" text PRIMARY KEY NOT NULL,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_staff_session_user" ON "staff_session" ("user_id");
