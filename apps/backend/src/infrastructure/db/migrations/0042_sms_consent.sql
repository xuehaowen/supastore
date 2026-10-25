ALTER TABLE store_settings ADD COLUMN sms_policy jsonb NOT NULL DEFAULT '{"enabled":false,"reviewed":false}'::jsonb;
--> statement-breakpoint
ALTER TABLE sms_preferences ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE sms_preferences ADD COLUMN consent_text text NOT NULL DEFAULT '', ADD COLUMN consent_version text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE sms_preferences DROP CONSTRAINT sms_preferences_pkey;
--> statement-breakpoint
ALTER TABLE sms_preferences ADD PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE sms_preferences ALTER COLUMN customer_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE sms_preferences ADD CONSTRAINT sms_preferences_customer_id_unique UNIQUE(customer_id);
--> statement-breakpoint
CREATE TABLE sms_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preference_id uuid NOT NULL REFERENCES sms_preferences(id),
  phone text NOT NULL,
  action text NOT NULL,
  source text NOT NULL,
  wording text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX sms_consent_phone_time ON sms_consent_events(phone, created_at);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN sms_preference_id uuid REFERENCES sms_preferences(id);
